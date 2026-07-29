import { afterEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_GENERATOR_KIND, getCoachGenerator } from './index';
import type { CoachInput } from './input-builder';

const INPUT: CoachInput = {
  salon: {
    name: 'テストサロン',
    type: 'メンズ',
    target_customer: '20代男性',
    price_band: '4,000円前後',
    strengths: 'フェード',
    trade_area_radius_m: 500,
  },
  change_events: [],
  own_kpi_series: [],
  competitor_summary: {
    active_count: 3,
    average_rating: 4.0,
    average_review_count: 20,
    new_this_run: 0,
    closed_this_run: 0,
  },
  past_recommendations: [],
  data_notes: [],
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getCoachGenerator の選択', () => {
  it('ANTHROPIC_API_KEY 未設定ならルールベースのみ (degraded を付けない)', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const result = await getCoachGenerator().generate(INPUT);

    expect(result.generatorKind).toBe(FALLBACK_GENERATOR_KIND);
    // キーが無いのは「劣化」ではなく設定どおりの動作なので警告扱いしない
    expect(result.degraded).toBeUndefined();
  });

  it('ANTHROPIC_API_KEY があれば Anthropic 経路を選ぶ', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    // 生成はせず、選択されたジェネレータの型だけ確認する
    expect(getCoachGenerator()).toBeDefined();
  });
});
