import Anthropic from '@anthropic-ai/sdk';
import type { CoachInput } from './input-builder';
import { COACH_SYSTEM_PROMPT } from './prompt';
import {
  COACH_OUTPUT_JSON_SCHEMA,
  coachOutputSchema,
  repairCoachOutput,
  type CoachOutput,
} from './schema';

export type CoachEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** 失敗の種別。再試行時にどうパラメータを変えるかを決める */
export type CoachFailureReason = 'truncated' | 'invalid' | 'refusal' | 'transport';

export class CoachGenerationError extends Error {
  constructor(
    message: string,
    readonly reason: CoachFailureReason,
    readonly attempts: number,
  ) {
    super(message);
    this.name = 'CoachGenerationError';
  }
}

export interface CoachRequestParams {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: 'user'; content: string }[];
  /**
   * 明示的に adaptive を指定する。
   * claude-opus-5 では省略時も adaptive だが、ANTHROPIC_MODEL は上書き可能で
   * 4.8/4.7 では省略 = 思考OFF になるため、モデル非依存に明示する。
   * 'disabled' は使わない (可視テキストへの <thinking> 漏れ、xhigh/max で400)。
   */
  thinking: { type: 'adaptive' };
  output_config: {
    effort: CoachEffort;
    format: { type: 'json_schema'; schema: Record<string, unknown> };
  };
}

export interface CoachUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface CoachResponse {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
  usage?: CoachUsage;
}

/** テストで fake を注入できるよう、必要最小限のクライアント形状だけに依存する */
export interface CoachMessagesClient {
  stream(params: CoachRequestParams): { finalMessage(): Promise<CoachResponse> };
}

const DEFAULT_MODEL = 'claude-opus-5';
const DEFAULT_EFFORT: CoachEffort = 'medium';
/** thinking と本文で共有する上限。出力JSONは2〜4Kトークン程度なので十分な余裕を取る */
const BASE_MAX_TOKENS = 32_000;
/** 切断時のみ引き上げる */
const ESCALATED_MAX_TOKENS = 64_000;
const DEFAULT_TIMEOUT_MS = 120_000;

const VALID_EFFORTS: CoachEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

export function getCoachEffort(): CoachEffort {
  const configured = process.env.ANTHROPIC_COACH_EFFORT as CoachEffort | undefined;
  return configured && VALID_EFFORTS.includes(configured) ? configured : DEFAULT_EFFORT;
}

export function createAnthropicMessagesClient(apiKey: string): CoachMessagesClient {
  // SDK の timeout はミリ秒
  const timeout = Number(process.env.ANTHROPIC_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const client = new Anthropic({ apiKey, timeout });
  return client.messages as unknown as CoachMessagesClient;
}

const TRUNCATION_HINT =
  '前回の出力は途中で切れました。推論を短くし、提案は最大2件に絞って、完全なJSONを1つだけ返してください。';

interface ValidationOutcome {
  output?: CoachOutput;
  errors: string[];
}

/**
 * 出力を zod で検証し、evidence ID が既知の change_event ID 集合に含まれるか確認する。
 * 不正な evidence を持つ提案は除外する (仕様08: DB側で検証)。
 */
function validateOutput(rawText: string, knownEventIds: Set<string>): ValidationOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { errors: ['出力がJSONとして解析できません'] };
  }

  const result = coachOutputSchema.safeParse(parsed);
  if (!result.success) {
    return {
      errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }

  const errors: string[] = [];
  const validRecommendations = result.data.recommendations.filter((rec) => {
    const invalidIds = rec.evidence_event_ids.filter((id) => !knownEventIds.has(id));
    if (invalidIds.length > 0) {
      errors.push(
        `提案「${rec.title}」のevidence_event_idsに存在しないIDが含まれています: ${invalidIds.join(', ')}。入力のchange_eventsのidのみ使用してください`,
      );
      return false;
    }
    return true;
  });

  // 提案が元々あったのに全滅した場合のみ再試行に値する
  if (result.data.recommendations.length > 0 && validRecommendations.length === 0) {
    return { errors };
  }

  return {
    output: repairCoachOutput({ ...result.data, recommendations: validRecommendations }),
    errors,
  };
}

interface AttemptPlan {
  effort: CoachEffort;
  maxTokens: number;
  userContent: string;
}

export interface CoachGenerationOutput {
  output: CoachOutput;
  usage: CoachUsage | null;
}

/**
 * Anthropic API による AI コーチ生成。
 * - structured output (json_schema) + adaptive thinking + effort
 * - zod 検証 + evidence ID の実在検証
 * - 失敗種別に応じて**パラメータを変えて**1回だけ再生成 (同一パラメータの再送は無意味)
 */
export class AnthropicCoachGenerator {
  readonly kind: string;

  constructor(
    private readonly client: CoachMessagesClient,
    private readonly model: string = getAnthropicModel(),
    private readonly effort: CoachEffort = getCoachEffort(),
  ) {
    this.kind = `anthropic:${this.model}`;
  }

  async generate(input: CoachInput): Promise<CoachGenerationOutput> {
    const knownEventIds = new Set(input.change_events.map((event) => event.id));
    const baseContent = `以下が今週の観測データです。JSON形式で提案を出力してください。\n\n${JSON.stringify(
      input,
      null,
      2,
    )}`;

    const first: AttemptPlan = {
      effort: this.effort,
      maxTokens: BASE_MAX_TOKENS,
      userContent: baseContent,
    };
    const firstResult = await this.attempt(first, knownEventIds);
    if (firstResult.output) {
      return { output: firstResult.output, usage: firstResult.usage };
    }

    // refusal はパラメータを変えても結果が変わらないので再試行しない
    if (firstResult.reason === 'refusal') {
      throw new CoachGenerationError(firstResult.message, 'refusal', 1);
    }

    // 切断なら「本文に使える予算を増やす」方向へ両方のレバーを倒す
    const second: AttemptPlan =
      firstResult.reason === 'truncated'
        ? {
            effort: 'low',
            maxTokens: ESCALATED_MAX_TOKENS,
            userContent: `${baseContent}\n\n${TRUNCATION_HINT}`,
          }
        : {
            effort: this.effort,
            maxTokens: BASE_MAX_TOKENS,
            userContent: `${baseContent}\n\n前回の出力には次の問題がありました。修正して再出力してください:\n- ${firstResult.errors.join('\n- ')}`,
          };

    const secondResult = await this.attempt(second, knownEventIds);
    if (secondResult.output) {
      return { output: secondResult.output, usage: secondResult.usage };
    }

    throw new CoachGenerationError(secondResult.message, secondResult.reason, 2);
  }

  private async attempt(
    plan: AttemptPlan,
    knownEventIds: Set<string>,
  ): Promise<{
    output?: CoachOutput;
    usage: CoachUsage | null;
    reason: CoachFailureReason;
    errors: string[];
    message: string;
  }> {
    let response: CoachResponse;
    try {
      response = await this.client
        .stream({
          model: this.model,
          max_tokens: plan.maxTokens,
          system: COACH_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: plan.userContent }],
          thinking: { type: 'adaptive' },
          output_config: {
            effort: plan.effort,
            format: {
              type: 'json_schema',
              schema: COACH_OUTPUT_JSON_SCHEMA as unknown as Record<string, unknown>,
            },
          },
        })
        .finalMessage();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { usage: null, reason: 'transport', errors: [message], message };
    }

    const usage = response.usage ?? null;

    if (response.stop_reason === 'refusal') {
      const message = 'AI生成がセーフティ上の理由で拒否されました';
      return { usage, reason: 'refusal', errors: [message], message };
    }

    // 切断は JSON.parse の前に判定する (JSON不正と誤分類しないため)
    if (response.stop_reason === 'max_tokens') {
      const message = '出力がmax_tokensに達して途中で切れました';
      return { usage, reason: 'truncated', errors: [message], message };
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock?.text) {
      const message = 'AI応答にテキストが含まれていません';
      return { usage, reason: 'invalid', errors: [message], message };
    }

    const validated = validateOutput(textBlock.text, knownEventIds);
    if (validated.output) {
      return { output: validated.output, usage, reason: 'invalid', errors: [], message: '' };
    }
    return {
      usage,
      reason: 'invalid',
      errors: validated.errors,
      message: `AI出力の検証に失敗しました: ${validated.errors.join(' / ')}`,
    };
  }
}
