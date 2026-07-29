import 'server-only';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { collectionRuns, type OwnSalonDataMode } from '@/server/db/schema';
import { getAiMode, getPlacesMode, isGbpFixtureMode } from '@/server/integrations/modes';
import {
  evaluateBudget,
  getBudgetLimits,
  jstMonthStart,
  type BudgetVerdict,
  type CostBucket,
} from './budget';
import { PIPELINE_SOURCE } from './sources';

/**
 * budget.ts の純粋関数にDBの行を渡す薄いラッパ。
 * 判定ロジックは budget.ts 側にあり、ここはクエリと文言だけを持つ。
 */

export interface BudgetGate {
  verdict: BudgetVerdict;
  /** 課金される連携が1つでも有効か。全てモック/フィクスチャなら false */
  billableActive: boolean;
  /** 最小実行間隔により次に実行できる時刻。制限なしなら null */
  nextAllowedAt: Date | null;
  /** 収集パイプラインを開始してよいか */
  allowed: boolean;
  /** allowed=false のとき画面に出す文言 */
  reason: string | null;
}

/**
 * 実際に課金が発生する経路が有効かどうか。
 * 全てモックなら実行間隔で縛る理由がないため、デモ体験を損ねないよう制限しない。
 */
export function hasBillableIntegration(dataMode: OwnSalonDataMode): boolean {
  if (getPlacesMode() === 'real') return true;
  if (getAiMode() === 'anthropic') return true;
  if (dataMode === 'gbp' && !isGbpFixtureMode()) return true;
  return false;
}

function formatJstTime(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * 当月分の collection_runs を集計して予算判定を返す。
 * `(salon_id, started_at DESC)` の既存インデックスがそのまま効く1本のクエリ。
 */
export async function checkBudget(
  salonId: string,
  dataMode: OwnSalonDataMode,
  now: Date = new Date(),
): Promise<BudgetGate> {
  const limits = getBudgetLimits();

  const rows = await db
    .select({
      source: collectionRuns.source,
      startedAt: collectionRuns.startedAt,
      costMetadata: collectionRuns.costMetadata,
    })
    .from(collectionRuns)
    .where(
      and(
        eq(collectionRuns.salonId, salonId),
        gte(collectionRuns.startedAt, jstMonthStart(now)),
      ),
    );

  const verdict = evaluateBudget(rows, now, limits);
  const billableActive = hasBillableIntegration(dataMode);

  // 最小実行間隔。既存の5分ガードは同時実行しか防げないので、
  // 「今すぐ収集」の連打による課金を止めるのはこちらの役目。
  let nextAllowedAt: Date | null = null;
  if (billableActive && limits.minIntervalMinutes > 0) {
    const [last] = await db
      .select({ startedAt: collectionRuns.startedAt })
      .from(collectionRuns)
      .where(
        and(
          eq(collectionRuns.salonId, salonId),
          eq(collectionRuns.source, PIPELINE_SOURCE),
          inArray(collectionRuns.status, ['success', 'partial']),
        ),
      )
      .orderBy(desc(collectionRuns.startedAt))
      .limit(1);
    if (last) {
      const candidate = new Date(last.startedAt.getTime() + limits.minIntervalMinutes * 60_000);
      if (candidate > now) nextAllowedAt = candidate;
    }
  }

  let reason: string | null = null;
  if (nextAllowedAt) {
    reason = `前回の収集から${limits.minIntervalMinutes}分は再実行できません (次回 ${formatJstTime(nextAllowedAt)} 以降)。`;
  } else if (verdict.message) {
    reason = verdict.message;
  }

  return { verdict, billableActive, nextAllowedAt, allowed: reason === null, reason };
}

/** 収集中に停止したバケットを利用者へ説明する一文 */
export function blockedBucketNote(bucket: CostBucket): string {
  switch (bucket) {
    case 'places':
      return '競合データはAPI利用上限に達したため今回は取得していません (前回値を使用)。';
    case 'gbp':
      return '自店舗データはAPI利用上限に達したため今回は取得していません (前回値を使用)。';
    case 'ai':
      return 'AI生成の上限に達したため、今回のレポートは簡易生成です。';
  }
}
