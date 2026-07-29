import { severityFor } from './severity';
import {
  metricKeyOf,
  type ChangeEventDraft,
  type DiffClock,
  type DiffEntity,
  type Snapshot,
} from './types';

const RATING_CHANGE_THRESHOLD = 0.1;
const REVIEW_COUNT_THRESHOLD = 5;
const REVIEW_COUNT_THRESHOLD_PRIORITY = 3;
const LOW_RATING_STAR = 2;
/** 仕様04: この日数を超えて未返信の口コミは高重要度 */
const UNREPLIED_THRESHOLD_DAYS = 7;
const UNREPLIED_THRESHOLD_MS = UNREPLIED_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
/**
 * 1回の収集で出す未返信イベントの上限。
 * GBP初回連携で過去の未返信口コミが大量に流入した場合に、
 * 変化フィード (= AIコーチの根拠) が溢れるのを防ぐ。
 */
const MAX_UNREPLIED_EVENTS_PER_RUN = 3;

function formatDistance(distanceM: number | null): string {
  if (distanceM === null) return '';
  return `(約${distanceM}m)`;
}

function formatRating(value: number): string {
  return value.toFixed(1);
}

/**
 * 前回スナップショットと今回スナップショットを比較し、change_event ドラフトを生成する純関数。
 * 除外設定された競合はイベントを生成しない。prev が空 (初回) の場合、差分イベントは出さない。
 */
export function detectChanges(
  entities: DiffEntity[],
  prev: Snapshot,
  curr: Snapshot,
  clock: DiffClock,
): ChangeEventDraft[] {
  const drafts: ChangeEventDraft[] = [];
  const isFirstRun = prev.presentEntityIds.size === 0 && prev.reviews.size === 0;
  if (isFirstRun) return drafts;

  for (const entity of entities) {
    if (entity.entityType === 'competitor') {
      if (entity.isExcluded) continue;
      detectCompetitorChanges(entity, prev, curr, clock, drafts);
    } else if (entity.entityType === 'own_salon') {
      detectOwnSalonChanges(entity, prev, curr, drafts);
      detectUnrepliedReviews(entity, prev, curr, clock, drafts);
    }
  }

  return drafts;
}

/**
 * 7日超の未返信口コミを検知する (仕様04)。
 *
 * 差分エンジンは状態を持たないため、単純に「未返信かつ7日超」で判定すると
 * 毎回同じ口コミが再発火してしまう。以下のいずれかに限って発火させる:
 *  a. 7日境界を (since, now] の間に跨いだ → 初めて古くなった回に1度だけ
 *  b. prev に存在せず、観測時点で既に7日超 → GBP初回連携の過去分バックフィル
 */
function detectUnrepliedReviews(
  entity: DiffEntity,
  prev: Snapshot,
  curr: Snapshot,
  clock: DiffClock,
  drafts: ChangeEventDraft[],
): void {
  const nowMs = clock.now.getTime();
  const sinceMs = clock.since?.getTime() ?? null;

  const candidates: { reviewId: string; createdAt: Date; observationId: string; star: number }[] =
    [];

  for (const [reviewId, review] of curr.reviews) {
    if (review.replied) continue;
    const staleAtMs = review.createdAt.getTime() + UNREPLIED_THRESHOLD_MS;
    if (staleAtMs > nowMs) continue; // まだ7日経っていない

    const crossedThisRun = sinceMs !== null && staleAtMs > sinceMs;
    const backfilled = !prev.reviews.has(reviewId);
    if (!crossedThisRun && !backfilled) continue;

    candidates.push({
      reviewId,
      createdAt: review.createdAt,
      observationId: review.observationId,
      star: review.star,
    });
  }

  // 新しいものから上限件数まで
  candidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const candidate of candidates.slice(0, MAX_UNREPLIED_EVENTS_PER_RUN)) {
    const days = Math.floor((nowMs - candidate.createdAt.getTime()) / (24 * 60 * 60 * 1000));
    drafts.push({
      entityId: entity.entityId,
      eventType: 'own_unreplied_review',
      severity: severityFor('own_unreplied_review'),
      title: `★${candidate.star}の口コミが${days}日間未返信です`,
      description:
        '未返信の口コミは検索結果でそのまま見え続けます。事実確認のうえ、丁寧な返信を投稿してください。',
      evidenceObservationIds: [candidate.observationId],
    });
  }
}

function evidenceFor(entityId: string, snapshot: Snapshot): string[] {
  const ids: string[] = [];
  for (const metric of ['rating', 'review_count'] as const) {
    const point = snapshot.metrics.get(metricKeyOf(entityId, metric));
    if (point) ids.push(point.observationId);
  }
  const status = snapshot.statuses.get(entityId);
  if (status) ids.push(status.observationId);
  return ids;
}

function detectCompetitorChanges(
  entity: DiffEntity,
  prev: Snapshot,
  curr: Snapshot,
  clock: DiffClock,
  drafts: ChangeEventDraft[],
): void {
  const wasPresent = prev.presentEntityIds.has(entity.entityId);
  const isPresent = curr.presentEntityIds.has(entity.entityId);

  // 今回 Places を取得できていない場合、curr には誰も居ないので
  // 「不在」は閉店の証拠にならない。存在ベースの判定を一切行わない
  // (評価・口コミ数の比較は前回値同士になり差分0なので安全に通す)。
  if (!clock.competitorDataFresh) {
    detectCompetitorMetricChanges(entity, prev, curr, drafts);
    return;
  }

  // 新規競合: 前回存在せず今回存在
  if (!wasPresent && isPresent) {
    drafts.push({
      entityId: entity.entityId,
      eventType: 'new_competitor',
      severity: severityFor('new_competitor'),
      title: `新しい美容院「${entity.name}」を検知${formatDistance(entity.distanceM)}`,
      description:
        '商圏内で新たに検知された美容院です。メニュー・価格帯・営業時間を確認し、必要なら重要競合に設定してください。',
      evidenceObservationIds: evidenceFor(entity.entityId, curr),
    });
    return;
  }

  // 閉店/消失: 前回存在し、今回消失または営業状態が非OPERATIONALに変化
  const prevStatus = prev.statuses.get(entity.entityId);
  const currStatus = curr.statuses.get(entity.entityId);
  if (wasPresent && !isPresent) {
    drafts.push({
      entityId: entity.entityId,
      eventType: 'competitor_closed',
      severity: severityFor('competitor_closed'),
      title: `競合「${entity.name}」が検索結果から消失`,
      description: '閉店または情報削除の可能性があります。次回の収集で継続確認してください。',
      evidenceObservationIds: prevStatus ? [prevStatus.observationId] : [],
    });
    return;
  }
  if (
    wasPresent &&
    isPresent &&
    prevStatus?.status === 'OPERATIONAL' &&
    currStatus &&
    currStatus.status !== 'OPERATIONAL'
  ) {
    drafts.push({
      entityId: entity.entityId,
      eventType: 'competitor_closed',
      severity: severityFor('competitor_closed'),
      title: `競合「${entity.name}」が営業停止状態に変化`,
      description: `営業ステータスが ${currStatus.status} に変わりました。一時休業または閉店の可能性があります。`,
      evidenceObservationIds: [currStatus.observationId],
    });
  }

  detectCompetitorMetricChanges(entity, prev, curr, drafts);
}

/**
 * 評価・口コミ数の比較。存在判定に依存しないため、
 * 今回 Places を取得できなかった場合でも安全に通せる (前回値同士の比較になり差分0)。
 */
function detectCompetitorMetricChanges(
  entity: DiffEntity,
  prev: Snapshot,
  curr: Snapshot,
  drafts: ChangeEventDraft[],
): void {
  // 評価変化
  const prevRating = prev.metrics.get(metricKeyOf(entity.entityId, 'rating'));
  const currRating = curr.metrics.get(metricKeyOf(entity.entityId, 'rating'));
  if (prevRating && currRating) {
    const delta = currRating.value - prevRating.value;
    if (Math.abs(delta) >= RATING_CHANGE_THRESHOLD) {
      const direction = delta > 0 ? '上昇' : '低下';
      drafts.push({
        entityId: entity.entityId,
        eventType: 'rating_change',
        severity: severityFor('rating_change', { isPriority: entity.isPriority }),
        title: `競合「${entity.name}」の評価が${formatRating(prevRating.value)}→${formatRating(currRating.value)}に${direction}`,
        description: `${entity.isPriority ? '重要競合' : '競合'}の評価が${direction}しました。`,
        evidenceObservationIds: [prevRating.observationId, currRating.observationId],
      });
    }
  }

  // 口コミ数の増加
  const prevCount = prev.metrics.get(metricKeyOf(entity.entityId, 'review_count'));
  const currCount = curr.metrics.get(metricKeyOf(entity.entityId, 'review_count'));
  if (prevCount && currCount) {
    const delta = currCount.value - prevCount.value;
    const threshold = entity.isPriority ? REVIEW_COUNT_THRESHOLD_PRIORITY : REVIEW_COUNT_THRESHOLD;
    if (delta >= threshold) {
      drafts.push({
        entityId: entity.entityId,
        eventType: 'review_count_change',
        severity: severityFor('review_count_change', { isPriority: entity.isPriority }),
        title: `競合「${entity.name}」の口コミ数が${prevCount.value}件→${currCount.value}件に増加`,
        description: `${entity.isPriority ? '重要競合' : '競合'}の口コミが${delta}件増えています。集客活動が活発になっている可能性があります。`,
        evidenceObservationIds: [prevCount.observationId, currCount.observationId],
      });
    }
  }
}

function detectOwnSalonChanges(
  entity: DiffEntity,
  prev: Snapshot,
  curr: Snapshot,
  drafts: ChangeEventDraft[],
): void {
  // 低評価口コミ: 今回新たに観測された★2以下の口コミ
  for (const [reviewId, review] of curr.reviews) {
    if (review.star > LOW_RATING_STAR) continue;
    if (prev.reviews.has(reviewId)) continue;
    drafts.push({
      entityId: entity.entityId,
      eventType: 'own_low_rating_review',
      severity: severityFor('own_low_rating_review'),
      title: `自店舗に★${review.star}の口コミを検知${review.replied ? '' : '(未返信)'}`,
      description: `「${review.comment.slice(0, 60)}${review.comment.length > 60 ? '…' : ''}」— 早期の返信と原因確認を推奨します。`,
      evidenceObservationIds: [review.observationId],
    });
  }

  // 自店舗の評価変化
  const prevRating = prev.metrics.get(metricKeyOf(entity.entityId, 'rating'));
  const currRating = curr.metrics.get(metricKeyOf(entity.entityId, 'rating'));
  if (prevRating && currRating) {
    const delta = currRating.value - prevRating.value;
    if (Math.abs(delta) >= RATING_CHANGE_THRESHOLD) {
      const direction = delta > 0 ? '上昇' : '低下';
      drafts.push({
        entityId: entity.entityId,
        eventType: 'own_rating_change',
        severity: severityFor('own_rating_change', { delta }),
        title: `自店舗の評価が${formatRating(prevRating.value)}→${formatRating(currRating.value)}に${direction}`,
        description:
          delta < 0
            ? '直近の口コミ内容を確認し、原因の把握と改善を検討してください。'
            : '評価が改善しています。この調子で口コミ返信・接客品質を維持してください。',
        evidenceObservationIds: [prevRating.observationId, currRating.observationId],
      });
    }
  }
}
