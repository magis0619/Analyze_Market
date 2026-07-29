import { z } from 'zod';

/** AIコーチの出力スキーマ (仕様08)。実AI・ルールベース fallback の両方がこれに準拠する */

export const recommendationSchema = z.object({
  title: z.string().min(1),
  action: z.string().min(1),
  rationale: z.string().min(1),
  evidence_event_ids: z.array(z.string().uuid()).min(1),
  priority: z.number().int().min(1).max(3),
  difficulty: z.enum(['low', 'medium', 'high']),
  expected_effect: z.string().min(1),
  deadline_days: z.number().int().min(1).max(30),
  steps: z.array(z.string().min(1)).min(1),
});

export const coachOutputSchema = z.object({
  weekly_summary: z.string().min(1),
  risk_level: z.enum(['low', 'medium', 'high']),
  data_quality_note: z.string(),
  recommendations: z.array(recommendationSchema).max(3),
});

export type CoachRecommendation = z.infer<typeof recommendationSchema>;
export type CoachOutput = z.infer<typeof coachOutputSchema>;

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
