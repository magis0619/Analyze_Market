import { AI_COACH_SOURCE, GBP_SOURCE, OWN_SALON_SOURCE, PLACES_SOURCE } from './sources';

/**
 * 外部API利用量の上限管理。
 *
 * 純粋関数 evaluateBudget と、DBから行を取ってくる薄いラッパに分離してある。
 * 集計窓は日本時間固定 (日本向けプロダクトで、JSTにDSTはない)。
 */

export type CostBucket = 'places' | 'gbp' | 'ai';

export const COST_BUCKETS = ['places', 'gbp', 'ai'] as const;

export const BUCKET_LABELS: Record<CostBucket, string> = {
  places: '競合データ (Places API)',
  gbp: '自店舗データ (GBP)',
  ai: 'AIコーチ生成',
};

const SOURCE_TO_BUCKET: Record<string, CostBucket | undefined> = {
  [PLACES_SOURCE]: 'places',
  [GBP_SOURCE]: 'gbp',
  [OWN_SALON_SOURCE]: 'gbp',
  [AI_COACH_SOURCE]: 'ai',
};

export interface BudgetLimits {
  dailyCalls: Record<CostBucket, number>;
  monthlyCalls: Record<CostBucket, number>;
  dailyAiTokens: number;
  /** 前回成功からこの分数が経過するまで再実行を許さない */
  minIntervalMinutes: number;
}

export interface BudgetUsage {
  daily: Record<CostBucket, number>;
  monthly: Record<CostBucket, number>;
  dailyAiTokens: number;
}

export interface BudgetVerdict {
  usage: BudgetUsage;
  limits: BudgetLimits;
  /** 上限に達したバケット。空なら全て実行可能 */
  blocked: CostBucket[];
  /** 全バケットが使えない場合に呼び出し側へ返すメッセージ */
  message: string | null;
}

export interface BudgetRunRow {
  source: string;
  startedAt: Date;
  costMetadata: Record<string, number> | null;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** JSTでの当日0時 (UTC Date として返す) */
export function jstDayStart(now: Date): Date {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const startJst = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate());
  return new Date(startJst - JST_OFFSET_MS);
}

/** JSTでの当月1日0時 */
export function jstMonthStart(now: Date): Date {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const startJst = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1);
  return new Date(startJst - JST_OFFSET_MS);
}

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** 既定は保守的な値。初週の請求で驚かないことを優先する */
export function getBudgetLimits(): BudgetLimits {
  return {
    dailyCalls: {
      places: envInt('PLACES_DAILY_CALL_LIMIT', 20),
      gbp: envInt('GBP_DAILY_CALL_LIMIT', 50),
      ai: envInt('AI_DAILY_CALL_LIMIT', 10),
    },
    monthlyCalls: {
      places: envInt('PLACES_MONTHLY_CALL_LIMIT', 200),
      gbp: envInt('GBP_MONTHLY_CALL_LIMIT', 500),
      ai: envInt('AI_MONTHLY_CALL_LIMIT', 100),
    },
    dailyAiTokens: envInt('AI_DAILY_TOKEN_LIMIT', 500_000),
    minIntervalMinutes: envInt('COLLECTION_MIN_INTERVAL_MINUTES', 60),
  };
}

const EMPTY_USAGE = (): Record<CostBucket, number> => ({ places: 0, gbp: 0, ai: 0 });

/**
 * 純粋関数。collection_runs の行から使用量を集計し、上限と突き合わせる。
 * billableCalls を持たない行 (旧データ・モック) は0として扱う。
 */
export function evaluateBudget(
  rows: BudgetRunRow[],
  now: Date,
  limits: BudgetLimits,
): BudgetVerdict {
  const dayStart = jstDayStart(now);
  const monthStart = jstMonthStart(now);

  const usage: BudgetUsage = { daily: EMPTY_USAGE(), monthly: EMPTY_USAGE(), dailyAiTokens: 0 };

  for (const row of rows) {
    const bucket = SOURCE_TO_BUCKET[row.source];
    if (!bucket) continue;
    if (row.startedAt < monthStart) continue;

    const calls = row.costMetadata?.billableCalls ?? 0;
    usage.monthly[bucket] += calls;

    if (row.startedAt >= dayStart) {
      usage.daily[bucket] += calls;
      if (bucket === 'ai') {
        usage.dailyAiTokens +=
          (row.costMetadata?.inputTokens ?? 0) + (row.costMetadata?.outputTokens ?? 0);
      }
    }
  }

  const blocked: CostBucket[] = [];
  for (const bucket of COST_BUCKETS) {
    const overDaily = usage.daily[bucket] >= limits.dailyCalls[bucket];
    const overMonthly = usage.monthly[bucket] >= limits.monthlyCalls[bucket];
    const overTokens = bucket === 'ai' && usage.dailyAiTokens >= limits.dailyAiTokens;
    if (overDaily || overMonthly || overTokens) blocked.push(bucket);
  }

  const allBlocked = blocked.length === COST_BUCKETS.length;
  return {
    usage,
    limits,
    blocked,
    message: allBlocked
      ? 'API利用上限に達したため収集を停止しています。日本時間の翌0時にリセットされます。'
      : null,
  };
}
