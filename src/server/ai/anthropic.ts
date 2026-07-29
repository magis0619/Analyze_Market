import Anthropic from '@anthropic-ai/sdk';
import type { CoachInput } from './input-builder';
import { COACH_SYSTEM_PROMPT } from './prompt';
import { COACH_OUTPUT_JSON_SCHEMA, coachOutputSchema, type CoachOutput } from './schema';

export class CoachGenerationError extends Error {}

/** テストで fake を注入できるよう、必要最小限のクライアント形状だけに依存する */
export interface CoachMessagesClient {
  create(params: {
    model: string;
    max_tokens: number;
    system: string;
    messages: { role: 'user'; content: string }[];
    output_config: { format: { type: 'json_schema'; schema: Record<string, unknown> } };
  }): Promise<{
    stop_reason: string | null;
    content: { type: string; text?: string }[];
  }>;
}

const DEFAULT_MODEL = 'claude-opus-5';

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
}

export function createAnthropicMessagesClient(apiKey: string): CoachMessagesClient {
  const client = new Anthropic({ apiKey });
  return client.messages as unknown as CoachMessagesClient;
}

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

  if (result.data.recommendations.length > 0 && validRecommendations.length === 0) {
    return { errors };
  }

  return {
    output: { ...result.data, recommendations: validRecommendations },
    errors,
  };
}

/**
 * Anthropic API による AI コーチ生成。
 * - structured output (json_schema) で出力形式を強制
 * - zod 検証 + evidence ID の実在検証
 * - 無効な出力は検証エラーを添えて1回だけ再生成 (仕様08 ガードレール)
 */
export class AnthropicCoachGenerator {
  readonly kind: string;

  constructor(
    private readonly client: CoachMessagesClient,
    private readonly model: string = getAnthropicModel(),
  ) {
    this.kind = `anthropic:${this.model}`;
  }

  async generate(input: CoachInput): Promise<CoachOutput> {
    const knownEventIds = new Set(input.change_events.map((event) => event.id));
    const inputJson = JSON.stringify(input, null, 2);

    const firstResponse = await this.request(
      `以下が今週の観測データです。JSON形式で提案を出力してください。\n\n${inputJson}`,
    );
    const first = validateOutput(firstResponse, knownEventIds);
    if (first.output) return first.output;

    // 再生成は1回だけ。検証エラーを是正指示として渡す
    const retryResponse = await this.request(
      `以下が今週の観測データです。JSON形式で提案を出力してください。\n\n${inputJson}\n\n` +
        `前回の出力には次の問題がありました。修正して再出力してください:\n- ${first.errors.join('\n- ')}`,
    );
    const retry = validateOutput(retryResponse, knownEventIds);
    if (retry.output) return retry.output;

    throw new CoachGenerationError(
      `AI出力の検証に2回失敗しました: ${retry.errors.join(' / ')}`,
    );
  }

  private async request(userContent: string): Promise<string> {
    const response = await this.client.create({
      model: this.model,
      max_tokens: 16000,
      system: COACH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: COACH_OUTPUT_JSON_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });

    if (response.stop_reason === 'refusal') {
      throw new CoachGenerationError('AI生成がセーフティ上の理由で拒否されました');
    }
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock?.text) {
      throw new CoachGenerationError('AI応答にテキストが含まれていません');
    }
    return textBlock.text;
  }
}
