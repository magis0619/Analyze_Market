import { describe, expect, it } from 'vitest';
import {
  AnthropicCoachGenerator,
  CoachGenerationError,
  type CoachMessagesClient,
  type CoachRequestParams,
  type CoachResponse,
} from './anthropic';
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

function textResponse(text: string, stopReason = 'end_turn'): CoachResponse {
  return {
    stop_reason: stopReason,
    content: [{ type: 'text', text }],
    usage: { input_tokens: 1200, output_tokens: 800 },
  };
}

/** 送信パラメータを記録する fake。実際に何を送っているかを検証できるようにする */
function fakeClient(responses: CoachResponse[]) {
  const params: CoachRequestParams[] = [];
  let index = 0;
  const client: CoachMessagesClient = {
    stream(p) {
      params.push(p);
      const response = responses[Math.min(index, responses.length - 1)]!;
      index += 1;
      return { finalMessage: async () => response };
    },
  };
  return { client, params, calls: () => index };
}

describe('AnthropicCoachGenerator リクエストパラメータ', () => {
  it('thinking=adaptive / effort / max_tokens / structured output を送る', async () => {
    const { client, params } = fakeClient([textResponse(JSON.stringify(validOutput()))]);
    await new AnthropicCoachGenerator(client, 'claude-opus-5', 'medium').generate(INPUT);

    expect(params[0]!.thinking).toEqual({ type: 'adaptive' });
    expect(params[0]!.output_config.effort).toBe('medium');
    expect(params[0]!.max_tokens).toBe(32_000);
    expect(params[0]!.output_config.format.type).toBe('json_schema');
    expect(params[0]!.model).toBe('claude-opus-5');
  });
});

describe('AnthropicCoachGenerator 正常系', () => {
  it('検証済み出力と usage を返す (呼び出し1回)', async () => {
    const { client, calls } = fakeClient([textResponse(JSON.stringify(validOutput()))]);
    const generator = new AnthropicCoachGenerator(client, 'claude-opus-5', 'medium');

    const result = await generator.generate(INPUT);
    expect(result.output.recommendations).toHaveLength(1);
    expect(result.usage?.output_tokens).toBe(800);
    expect(calls()).toBe(1);
    expect(generator.kind).toBe('anthropic:claude-opus-5');
  });
});

describe('AnthropicCoachGenerator 再試行時のパラメータ変更', () => {
  it('stop_reason=max_tokens なら max_tokens を上げ effort を下げて再試行する', async () => {
    const { client, params, calls } = fakeClient([
      { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"weekly_su' }] },
      textResponse(JSON.stringify(validOutput())),
    ]);
    const result = await new AnthropicCoachGenerator(client, 'claude-opus-5', 'medium').generate(
      INPUT,
    );

    expect(calls()).toBe(2);
    // 同一パラメータの再送では同じく切れるため、必ず変えていること
    expect(params[0]!.max_tokens).toBe(32_000);
    expect(params[1]!.max_tokens).toBe(64_000);
    expect(params[0]!.output_config.effort).toBe('medium');
    expect(params[1]!.output_config.effort).toBe('low');
    expect(params[1]!.messages[0]!.content).toContain('途中で切れました');
    expect(result.output.recommendations).toHaveLength(1);
  });

  it('不正JSON なら同じ予算で検証エラーを添えて再試行する', async () => {
    const { client, params, calls } = fakeClient([
      textResponse('not json at all'),
      textResponse(JSON.stringify(validOutput())),
    ]);
    await new AnthropicCoachGenerator(client, 'claude-opus-5', 'medium').generate(INPUT);

    expect(calls()).toBe(2);
    expect(params[1]!.max_tokens).toBe(32_000);
    expect(params[1]!.output_config.effort).toBe('medium');
    expect(params[1]!.messages[0]!.content).toContain('前回の出力には次の問題');
  });

  it('refusal は再試行せず即座に失敗する', async () => {
    const { client, calls } = fakeClient([{ stop_reason: 'refusal', content: [] }]);
    const generator = new AnthropicCoachGenerator(client, 'claude-opus-5', 'medium');

    await expect(generator.generate(INPUT)).rejects.toMatchObject({
      name: 'CoachGenerationError',
      reason: 'refusal',
      attempts: 1,
    });
    expect(calls()).toBe(1);
  });

  it('2回連続で無効なら CoachGenerationError', async () => {
    const { client, calls } = fakeClient([textResponse('bad'), textResponse('still bad')]);
    const generator = new AnthropicCoachGenerator(client, 'claude-opus-5', 'medium');

    await expect(generator.generate(INPUT)).rejects.toThrow(CoachGenerationError);
    expect(calls()).toBe(2);
  });
});

describe('AnthropicCoachGenerator 検証と修復', () => {
  it('存在しないevidence IDの提案だけ除外され、全滅時のみ再試行する', async () => {
    const { client, calls } = fakeClient([
      textResponse(JSON.stringify(validOutput(UNKNOWN_ID))),
      textResponse(JSON.stringify(validOutput())),
    ]);
    const result = await new AnthropicCoachGenerator(client, 'claude-opus-5', 'medium').generate(
      INPUT,
    );

    expect(result.output.recommendations[0]?.evidence_event_ids).toEqual([EVENT_ID]);
    expect(calls()).toBe(2);
  });

  it('非UUIDのevidence IDでも zod で全却下されず membership で除外される', async () => {
    const withBadId = validOutput();
    withBadId.recommendations[0]!.evidence_event_ids = ['not-a-uuid'];
    const { client, calls } = fakeClient([
      textResponse(JSON.stringify(withBadId)),
      textResponse(JSON.stringify(validOutput())),
    ]);
    const result = await new AnthropicCoachGenerator(client, 'claude-opus-5', 'medium').generate(
      INPUT,
    );

    // zod でパースは通り、membership 検証で落ちて再試行 → 2回目で成功
    expect(calls()).toBe(2);
    expect(result.output.recommendations[0]?.evidence_event_ids).toEqual([EVENT_ID]);
  });

  it('提案4件は3件に切り詰め、再試行しない (決定論的に直せる違反)', async () => {
    const four = validOutput();
    four.recommendations = Array.from({ length: 4 }, () => ({
      ...validOutput().recommendations[0]!,
    }));
    const { client, calls } = fakeClient([textResponse(JSON.stringify(four))]);
    const result = await new AnthropicCoachGenerator(client, 'claude-opus-5', 'medium').generate(
      INPUT,
    );

    expect(result.output.recommendations).toHaveLength(3);
    expect(calls()).toBe(1);
  });

  it('範囲外の deadline_days / priority はクランプされ、再試行しない', async () => {
    const outOfRange = validOutput();
    outOfRange.recommendations[0]!.deadline_days = 999;
    outOfRange.recommendations[0]!.priority = 9;
    const { client, calls } = fakeClient([textResponse(JSON.stringify(outOfRange))]);
    const result = await new AnthropicCoachGenerator(client, 'claude-opus-5', 'medium').generate(
      INPUT,
    );

    expect(result.output.recommendations[0]!.deadline_days).toBe(30);
    expect(result.output.recommendations[0]!.priority).toBe(3);
    expect(calls()).toBe(1);
  });
});
