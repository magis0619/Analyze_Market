import {
  AnthropicCoachGenerator,
  CoachGenerationError,
  createAnthropicMessagesClient,
  type CoachFailureReason,
  type CoachUsage,
} from './anthropic';
import { generateFallbackCoachOutput } from './fallback';
import type { CoachInput } from './input-builder';
import { getAiMode } from '@/server/integrations/modes';
import type { CoachOutput } from './schema';

export const FALLBACK_GENERATOR_KIND = 'rule-based-fallback';

/** 実API経路が失敗してルールベースに落ちたことを呼び出し側へ伝える */
export interface CoachDegradation {
  reason: CoachFailureReason | 'unknown';
  message: string;
}

export interface CoachGenerationResult {
  output: CoachOutput;
  /** 実際に使われた生成方式。coaching_reports.model に記録する */
  generatorKind: string;
  usage: CoachUsage | null;
  /**
   * 実AI生成が期待されていたのに失敗した場合のみ設定される。
   * 呼び出し側はこれを collection_runs / ダッシュボードに表面化させること
   * (握りつぶすと「壊れているのに正常に見える」状態になる)。
   */
  degraded?: CoachDegradation;
}

export interface CoachGenerator {
  generate(input: CoachInput): Promise<CoachGenerationResult>;
}

class FallbackCoachGenerator implements CoachGenerator {
  async generate(input: CoachInput): Promise<CoachGenerationResult> {
    return {
      output: generateFallbackCoachOutput(input),
      generatorKind: FALLBACK_GENERATOR_KIND,
      usage: null,
    };
  }
}

/** AI生成に失敗してもルールベースへフォールバックするラッパー (仕様05 障害設計) */
class ResilientCoachGenerator implements CoachGenerator {
  constructor(
    private readonly anthropic: AnthropicCoachGenerator,
    private readonly fallback: FallbackCoachGenerator,
  ) {}

  async generate(input: CoachInput): Promise<CoachGenerationResult> {
    try {
      const { output, usage } = await this.anthropic.generate(input);
      return { output, generatorKind: this.anthropic.kind, usage };
    } catch (error) {
      const reason = error instanceof CoachGenerationError ? error.reason : 'unknown';
      const message = error instanceof Error ? error.message : String(error);
      console.error('AIコーチ生成に失敗したためルールベースにフォールバックします:', error);
      const result = await this.fallback.generate(input);
      return { ...result, degraded: { reason, message } };
    }
  }
}

export interface CoachGeneratorOptions {
  /** 予算上限などで実API呼び出しを禁じる。キーがあってもルールベースを使う */
  forceFallback?: boolean;
}

/**
 * ANTHROPIC_API_KEY があれば Anthropic 生成 (実行時エラーはルールベースへフォールバック)、
 * なければルールベース生成を返す。
 */
export function getCoachGenerator(options: CoachGeneratorOptions = {}): CoachGenerator {
  const fallback = new FallbackCoachGenerator();
  if (options.forceFallback || getAiMode() === 'fallback') return fallback;
  const anthropic = new AnthropicCoachGenerator(
    createAnthropicMessagesClient(process.env.ANTHROPIC_API_KEY as string),
  );
  return new ResilientCoachGenerator(anthropic, fallback);
}
