import { describe, expect, it } from 'vitest';
import {
  evaluateBudget,
  jstDayStart,
  jstMonthStart,
  type BudgetLimits,
  type BudgetRunRow,
} from './budget';
import { AI_COACH_SOURCE, GBP_SOURCE, PIPELINE_SOURCE, PLACES_SOURCE } from './sources';

const LIMITS: BudgetLimits = {
  dailyCalls: { places: 3, gbp: 3, ai: 2 },
  monthlyCalls: { places: 10, gbp: 10, ai: 10 },
  dailyAiTokens: 1_000,
  minIntervalMinutes: 60,
};

/** 2026-03-10 12:00 JST = 2026-03-10 03:00 UTC */
const NOW = new Date('2026-03-10T03:00:00.000Z');

function run(source: string, startedAt: string, cost?: Record<string, number>): BudgetRunRow {
  return { source, startedAt: new Date(startedAt), costMetadata: cost ?? null };
}

describe('JST 集計窓', () => {
  it('日境界は前日の 15:00 UTC', () => {
    expect(jstDayStart(NOW).toISOString()).toBe('2026-03-09T15:00:00.000Z');
  });

  it('JST 0:05 (= 前日 15:05 UTC) はその日の窓に入る', () => {
    const justAfterMidnightJst = new Date('2026-03-09T15:05:00.000Z');
    expect(jstDayStart(justAfterMidnightJst).toISOString()).toBe('2026-03-09T15:00:00.000Z');
  });

  it('JST 23:59 (= 同日 14:59 UTC) はまだ前の窓', () => {
    const justBeforeMidnightJst = new Date('2026-03-09T14:59:00.000Z');
    expect(jstDayStart(justBeforeMidnightJst).toISOString()).toBe('2026-03-08T15:00:00.000Z');
  });

  it('月境界は前月末日の 15:00 UTC', () => {
    expect(jstMonthStart(NOW).toISOString()).toBe('2026-02-28T15:00:00.000Z');
  });
});

describe('evaluateBudget', () => {
  it('billableCalls を持たない行は 0 として数える', () => {
    const verdict = evaluateBudget(
      [
        run(PLACES_SOURCE, '2026-03-10T02:00:00Z'),
        run(PLACES_SOURCE, '2026-03-10T02:10:00Z', { placesReturned: 12 }),
      ],
      NOW,
      LIMITS,
    );
    expect(verdict.usage.daily.places).toBe(0);
    expect(verdict.blocked).toEqual([]);
  });

  it('日次上限に達したバケットだけを blocked にする', () => {
    const verdict = evaluateBudget(
      [
        run(PLACES_SOURCE, '2026-03-10T02:00:00Z', { billableCalls: 3 }),
        run(GBP_SOURCE, '2026-03-10T02:00:00Z', { billableCalls: 1 }),
      ],
      NOW,
      LIMITS,
    );
    expect(verdict.blocked).toEqual(['places']);
    // 全滅ではないので収集自体は続行させる
    expect(verdict.message).toBeNull();
  });

  it('前日の利用は日次に含めず月次にだけ含める', () => {
    // 2026-03-09 23:00 JST = 2026-03-09 14:00 UTC (当日の窓の外)
    const verdict = evaluateBudget(
      [run(PLACES_SOURCE, '2026-03-09T14:00:00Z', { billableCalls: 5 })],
      NOW,
      LIMITS,
    );
    expect(verdict.usage.daily.places).toBe(0);
    expect(verdict.usage.monthly.places).toBe(5);
    expect(verdict.blocked).toEqual([]);
  });

  it('前月の行は月次にも含めない', () => {
    const verdict = evaluateBudget(
      [run(PLACES_SOURCE, '2026-02-20T02:00:00Z', { billableCalls: 99 })],
      NOW,
      LIMITS,
    );
    expect(verdict.usage.monthly.places).toBe(0);
  });

  it('月次上限は日次に余裕があっても blocked にする', () => {
    const verdict = evaluateBudget(
      [
        run(PLACES_SOURCE, '2026-03-02T02:00:00Z', { billableCalls: 9 }),
        run(PLACES_SOURCE, '2026-03-10T02:00:00Z', { billableCalls: 1 }),
      ],
      NOW,
      LIMITS,
    );
    expect(verdict.usage.daily.places).toBe(1);
    expect(verdict.usage.monthly.places).toBe(10);
    expect(verdict.blocked).toEqual(['places']);
  });

  it('AIはトークン上限でも blocked になる', () => {
    const verdict = evaluateBudget(
      [
        run(AI_COACH_SOURCE, '2026-03-10T02:00:00Z', {
          billableCalls: 1,
          inputTokens: 800,
          outputTokens: 300,
        }),
      ],
      NOW,
      LIMITS,
    );
    expect(verdict.usage.dailyAiTokens).toBe(1_100);
    expect(verdict.blocked).toEqual(['ai']);
  });

  it('pipeline など課金しないソースは無視する', () => {
    const verdict = evaluateBudget(
      [run(PIPELINE_SOURCE, '2026-03-10T02:00:00Z', { billableCalls: 100 })],
      NOW,
      LIMITS,
    );
    expect(verdict.usage.daily).toEqual({ places: 0, gbp: 0, ai: 0 });
    expect(verdict.blocked).toEqual([]);
  });

  it('全バケットが上限なら停止メッセージを返す', () => {
    const verdict = evaluateBudget(
      [
        run(PLACES_SOURCE, '2026-03-10T02:00:00Z', { billableCalls: 3 }),
        run(GBP_SOURCE, '2026-03-10T02:00:00Z', { billableCalls: 3 }),
        run(AI_COACH_SOURCE, '2026-03-10T02:00:00Z', { billableCalls: 2 }),
      ],
      NOW,
      LIMITS,
    );
    expect(verdict.blocked).toEqual(['places', 'gbp', 'ai']);
    expect(verdict.message).toContain('上限');
  });
});
