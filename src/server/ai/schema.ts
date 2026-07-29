import { z } from 'zod';

/** AIコーチの出力スキーマ (仕様08)。実AI・ルールベース fallback の両方がこれに準拠する */

export const MAX_RECOMMENDATIONS = 3;
export const MIN_DEADLINE_DAYS = 1;
export const MAX_DEADLINE_DAYS = 30;

export const recommendationSchema = z.object({
  title: z.string().min(1),
  action: z.string().min(1),
  rationale: z.string().min(1),
  // .uuid() は付けない。存在しないIDは後段の membership 検証で必ず落ちるため
  // そちらが厳密に上位互換であり、かつ「その提案だけ捨てる」粒度で扱える。
  // ここで uuid を強制すると、1件の不正IDで出力全体が却下されてしまう。
  evidence_event_ids: z.array(z.string().min(1)).min(1),
  priority: z.number().int(),
  difficulty: z.enum(['low', 'medium', 'high']),
  expected_effect: z.string().min(1),
  deadline_days: z.number().int(),
  steps: z.array(z.string().min(1)).min(1),
});

export const coachOutputSchema = z.object({
  weekly_summary: z.string().min(1),
  risk_level: z.enum(['low', 'medium', 'high']),
  data_quality_note: z.string(),
  // 件数超過は決定論的に直せるので、ここでは弾かず repairCoachOutput で切り詰める
  recommendations: z.array(recommendationSchema),
});

export type CoachRecommendation = z.infer<typeof recommendationSchema>;
export type CoachOutput = z.infer<typeof coachOutputSchema>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 決定論的に修復できる違反を直す。
 * 再試行はAPI呼び出し1回分のコストなので、機械的に直せるものに使わない。
 * 構造的な失敗 (parse不能・必須欠落・型違い) のみが再試行に値する。
 */
export function repairCoachOutput(output: CoachOutput): CoachOutput {
  return {
    ...output,
    recommendations: output.recommendations
      .slice(0, MAX_RECOMMENDATIONS)
      .map((rec, index) => ({
        ...rec,
        priority: clamp(rec.priority, 1, MAX_RECOMMENDATIONS) || index + 1,
        deadline_days: clamp(rec.deadline_days, MIN_DEADLINE_DAYS, MAX_DEADLINE_DAYS),
      })),
  };
}

/**
 * Anthropic API の structured output (output_config.format) に渡す JSON Schema。
 * 上記 zod スキーマと同一内容を手書きで保守する。
 * minItems/maxItems/minimum/maximum は structured output 未サポートのため wire には含めず、
 * 受信後の zod 検証で担保する。
 */
export const COACH_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['weekly_summary', 'risk_level', 'data_quality_note', 'recommendations'],
  properties: {
    weekly_summary: { type: 'string' },
    risk_level: { type: 'string', enum: ['low', 'medium', 'high'] },
    data_quality_note: { type: 'string' },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'action',
          'rationale',
          'evidence_event_ids',
          'priority',
          'difficulty',
          'expected_effect',
          'deadline_days',
          'steps',
        ],
        properties: {
          title: { type: 'string' },
          action: { type: 'string' },
          rationale: { type: 'string' },
          evidence_event_ids: { type: 'array', items: { type: 'string' } },
          priority: { type: 'integer' },
          difficulty: { type: 'string', enum: ['low', 'medium', 'high'] },
          expected_effect: { type: 'string' },
          deadline_days: { type: 'integer' },
          steps: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;
