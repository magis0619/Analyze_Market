import { AnthropicCoachGenerator, createAnthropicMessagesClient } from './anthropic';
import { generateFallbackCoachOutput } from './fallback';
import type { CoachInput } from './input-builder';
import type { CoachOutput } from './schema';

export const FALLBACK_GENERATOR_KIND = 'rule-based-fallback';

export interface CoachGenerationResult {
  output: CoachOutput;
  /** 実際に使われた生成方式。coaching_reports.model に記録する */
  generatorKind: string;
}

export interface CoachGenerator {
  generate(input: CoachInput): Promise<CoachGenerationResult>;
}

class FallbackCoachGenerator implements CoachGenerator {
  async generate(input: CoachInput): Promise<CoachGenerationResult> {
    return {
      output: generateFallbackCoachOutput(input),
      generatorKind: FALLBACK_GENERATOR_KIND,
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
      const output = await this.anthropic.generate(input);
      return { output, generatorKind: this.anthropic.kind };
    } catch (error) {
      console.error('AIコーチ生成に失敗したためルールベースにフォールバックします:', error);
      return this.fallback.generate(input);
    }
  }
}

/**
 * ANTHROPIC_API_KEY があれば Anthropic 生成 (実行時エラーはルールベースへフォールバック)、
 * なければルールベース生成を返す。
 */
export function getCoachGenerator(): CoachGenerator {
  const fallback = new FallbackCoachGenerator();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;
  const anthropic = new AnthropicCoachGenerator(createAnthropicMessagesClient(apiKey));
  return new ResilientCoachGenerator(anthropic, fallback);
}
