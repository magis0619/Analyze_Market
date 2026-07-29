import { describe, expect, it } from 'vitest';
import { AnthropicCoachGenerator, CoachGenerationError, type CoachMessagesClient } from './anthropic';
import type { CoachInput } from './input-builder';
import type { CoachOutput } from './schema';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const UNKNOWN_ID = '99999999-9999-4999-8999-999999999999';

const INPUT: CoachInput = {
  salon: {
    name: 'テストサロン',
    type: 'メンズ',
    target_customer: '20代男性',
    price_band: '4,000円前後',
    strengths: 'フェード',
    trade_area_radius_m: 500,
  },
  change_events: [
    {
      id: EVENT_ID,
      event_type: 'new_competitor',
      severity: 'high',
      title: '新規競合を検知',
      description: '新しい美容院が出店しました',
    },
  ],
  own_kpi_series: [],
  competitor_summary: {
    active_count: 10,
    average_rating: 4.0,
    average_review_count: 50,
    new_this_run: 1,
    closed_this_run: 0,
  },
  past_recommendations: [],
  data_notes: [],
};

function validOutput(evidenceId: string = EVENT_ID): CoachOutput {
  return {
    weekly_summary: '新規競合が出店しました。',
    risk_level: 'medium',
    data_quality_note: '',
    recommendations: [
      {
        title: '競合を確認する',
        action: '競合のメニューを確認する',
        rationale: '新規出店があったため',
        evidence_event_ids: [evidenceId],
        priority: 1,
        difficulty: 'low',
        expected_effect: '差別化の明確化',
        deadline_days: 7,
        steps: ['競合ページを確認する'],
      },
    ],
  };
}

function fakeClient(responses: string[]): { client: CoachMessagesClient; calls: () => number } {
  let count = 0;
  return {
    client: {
      async create() {
        const text = responses[Math.min(count, responses.length - 1)];
        count += 1;
        return { stop_reason: 'end_turn', content: [{ type: 'text', text }] };
      },
    },
    calls: () => count,
  };
}

describe('AnthropicCoachGenerator', () => {
  it('正常系: 検証済み出力を返す (呼び出し1回)', async () => {
    const { client, calls } = fakeClient([JSON.stringify(validOutput())]);
    const generator = new AnthropicCoachGenerator(client, 'claude-opus-5');
    const output = await generator.generate(INPUT);
    expect(output.recommendations).toHaveLength(1);
    expect(calls()).toBe(1);
    expect(generator.kind).toBe('anthropic:claude-opus-5');
  });

  it('不正JSON → 1回だけ再生成し、成功したら返す', async () => {
    const { client, calls } = fakeClient(['not json at all', JSON.stringify(validOutput())]);
    const generator = new AnthropicCoachGenerator(client, 'claude-opus-5');
    const output = await generator.generate(INPUT);
    expect(output.recommendations).toHaveLength(1);
    expect(calls()).toBe(2);
  });

  it('存在しないevidence IDの提案は除外され、全滅なら再生成される', async () => {
    const { client, calls } = fakeClient([
      JSON.stringify(validOutput(UNKNOWN_ID)),
      JSON.stringify(validOutput()),
    ]);
    const generator = new AnthropicCoachGenerator(client, 'claude-opus-5');
    const output = await generator.generate(INPUT);
    expect(output.recommendations[0]?.evidence_event_ids).toEqual([EVENT_ID]);
    expect(calls()).toBe(2);
  });

  it('2回連続で無効 → CoachGenerationError (再生成は1回まで)', async () => {
    const { client, calls } = fakeClient(['bad', 'still bad']);
    const generator = new AnthropicCoachGenerator(client, 'claude-opus-5');
    await expect(generator.generate(INPUT)).rejects.toThrow(CoachGenerationError);
    expect(calls()).toBe(2);
  });

  it('refusal は CoachGenerationError になる', async () => {
    const client: CoachMessagesClient = {
      async create() {
        return { stop_reason: 'refusal', content: [] };
      },
    };
    const generator = new AnthropicCoachGenerator(client, 'claude-opus-5');
    await expect(generator.generate(INPUT)).rejects.toThrow(CoachGenerationError);
  });

  it('提案4件以上はzod検証で弾かれ再生成される', async () => {
    const four = validOutput();
    four.recommendations = Array.from({ length: 4 }, () => ({
      ...validOutput().recommendations[0]!,
    }));
    const { client, calls } = fakeClient([JSON.stringify(four), JSON.stringify(validOutput())]);
    const generator = new AnthropicCoachGenerator(client, 'claude-opus-5');
    const output = await generator.generate(INPUT);
    expect(output.recommendations.length).toBeLessThanOrEqual(3);
    expect(calls()).toBe(2);
  });
});
