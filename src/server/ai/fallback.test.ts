import { describe, expect, it } from 'vitest';
import { generateFallbackCoachOutput } from './fallback';
import type { CoachInput } from './input-builder';
import { coachOutputSchema } from './schema';

const EVENT_LOW_REVIEW = {
  id: '11111111-1111-4111-8111-111111111111',
  event_type: 'own_low_rating_review',
  severity: 'high',
  title: '★2の新規口コミを検知',
  description: '未返信の低評価口コミがあります',
};
const EVENT_NEW_COMPETITOR = {
  id: '22222222-2222-4222-8222-222222222222',
  event_type: 'new_competitor',
  severity: 'high',
  title: '新しい美容院「Lien hair design」を検知',
  description: '徒歩圏内に新規競合が出店しました',
};
const EVENT_RATING_CHANGE = {
  id: '33333333-3333-4333-8333-333333333333',
  event_type: 'rating_change',
  severity: 'low',
  title: '競合の評価が4.1→4.3に上昇',
  description: '競合の評価が上がっています',
};

function baseInput(events: CoachInput['change_events']): CoachInput {
  return {
    salon: {
      name: 'ヘアサロン ルミエール',
      type: '女性向け',
      target_customer: '30〜40代女性',
      price_band: 'カット6,000円前後',
      strengths: 'カラーの発色',
      trade_area_radius_m: 500,
    },
    change_events: events,
    own_kpi_series: [{ metric: 'rating', value: 4.2, observed_at: '2026-07-22T00:00:00Z' }],
    competitor_summary: {
      active_count: 10,
      average_rating: 4.1,
      average_review_count: 77,
      new_this_run: 0,
      closed_this_run: 0,
    },
    past_recommendations: [],
    data_notes: [],
  };
}

describe('generateFallbackCoachOutput', () => {
  it('初回(イベントなし): スキーマ準拠で提案0件、観測不足を明示する', () => {
    const output = generateFallbackCoachOutput(baseInput([]));
    expect(coachOutputSchema.safeParse(output).success).toBe(true);
    expect(output.recommendations).toHaveLength(0);
    expect(output.data_quality_note).toContain('観測不足');
    expect(output.weekly_summary).toContain('10店');
    expect(output.risk_level).toBe('low');
  });

  it('低評価口コミ: 返信提案が最優先で生成される', () => {
    const output = generateFallbackCoachOutput(baseInput([EVENT_LOW_REVIEW]));
    expect(coachOutputSchema.safeParse(output).success).toBe(true);
    expect(output.recommendations[0]?.title).toContain('低評価口コミ');
    expect(output.recommendations[0]?.evidence_event_ids).toEqual([EVENT_LOW_REVIEW.id]);
    expect(output.risk_level).toBe('medium');
  });

  it('複数イベント: 提案は最大3件、priorityは1,2,3の連番、evidenceは実イベントIDのみ', () => {
    const output = generateFallbackCoachOutput(
      baseInput([EVENT_LOW_REVIEW, EVENT_NEW_COMPETITOR, EVENT_RATING_CHANGE]),
    );
    expect(coachOutputSchema.safeParse(output).success).toBe(true);
    expect(output.recommendations.length).toBeLessThanOrEqual(3);
    expect(output.recommendations.map((r) => r.priority)).toEqual(
      output.recommendations.map((_, i) => i + 1),
    );
    const knownIds = new Set([
      EVENT_LOW_REVIEW.id,
      EVENT_NEW_COMPETITOR.id,
      EVENT_RATING_CHANGE.id,
    ]);
    for (const rec of output.recommendations) {
      expect(rec.evidence_event_ids.length).toBeGreaterThanOrEqual(1);
      expect(rec.evidence_event_ids.every((id) => knownIds.has(id))).toBe(true);
    }
    expect(output.risk_level).toBe('high');
  });
});
