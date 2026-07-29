import { describe, expect, it } from 'vitest';
import { buildCoachInput, type CoachInputParams } from './input-builder';

function params(overrides: Partial<CoachInputParams> = {}): CoachInputParams {
  return {
    salonName: 'ヘアサロン ルミエール',
    salonProfile: {
      salonType: '女性向け',
      targetCustomer: '30〜40代女性',
      priceBand: 'カット6,000円前後',
      strengths: 'a'.repeat(500),
      dataMode: 'demo',
    },
    tradeAreaRadiusM: 500,
    changeEvents: [],
    ownKpiSeries: [],
    competitorSummary: {
      activeCount: 10,
      averageRating: 4.1,
      averageReviewCount: 77,
      newThisRun: 1,
      closedThisRun: 0,
    },
    pastRecommendations: [],
    dataNotes: [],
    ...overrides,
  };
}

describe('buildCoachInput', () => {
  it('長文はクリップされる (生データを丸ごと渡さない)', () => {
    const input = buildCoachInput(params());
    expect(input.salon.strengths.length).toBeLessThanOrEqual(201);
  });

  it('イベントは最大20件に制限される', () => {
    const events = Array.from({ length: 30 }, (_, i) => ({
      id: `id-${i}`,
      eventType: 'rating_change' as const,
      severity: 'low' as const,
      title: `event ${i}`,
      description: 'desc',
    }));
    const input = buildCoachInput(params({ changeEvents: events }));
    expect(input.change_events).toHaveLength(20);
  });

  it('過去の提案が実施ステータス付きで含まれる (US-005)', () => {
    const input = buildCoachInput(
      params({
        pastRecommendations: [
          { title: '口コミ返信', status: 'completed', proposedAt: '2026-07-01' },
          { title: 'SNS投稿', status: 'rejected', proposedAt: '2026-07-08' },
        ],
      }),
    );
    expect(input.past_recommendations).toHaveLength(2);
    expect(input.past_recommendations[1]?.status).toBe('rejected');
  });

  it('KPI時系列がsnake_caseで構造化される', () => {
    const input = buildCoachInput(
      params({
        ownKpiSeries: [{ metricKey: 'rating', value: 4.2, observedAt: '2026-07-22T00:00:00Z' }],
      }),
    );
    expect(input.own_kpi_series[0]).toEqual({
      metric: 'rating',
      value: 4.2,
      observed_at: '2026-07-22T00:00:00Z',
    });
  });
});
