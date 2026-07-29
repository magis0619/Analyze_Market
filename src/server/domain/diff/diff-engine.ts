import { severityFor } from './severity';
import {
  metricKeyOf,
  type ChangeEventDraft,
  type DiffEntity,
  type Snapshot,
} from './types';

const RATING_CHANGE_THRESHOLD = 0.1;
const REVIEW_COUNT_THRESHOLD = 5;
const REVIEW_COUNT_THRESHOLD_PRIORITY = 3;
const LOW_RATING_STAR = 2;

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
): ChangeEventDraft[] {
  const drafts: ChangeEventDraft[] = [];
  const isFirstRun = prev.presentEntityIds.size === 0 && prev.reviews.size === 0;
  if (isFirstRun) return drafts;

  for (const entity of entities) {
    if (entity.entityType === 'competitor') {
      if (entity.isExcluded) continue;
      detectCompetitorChanges(entity, prev, curr, drafts);
    } else if (entity.entityType === 'own_salon') {
      detectOwnSalonChanges(entity, prev, curr, drafts);
    }
  }

  return drafts;
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
  drafts: ChangeEventDraft[],
): void {
  const wasPresent = prev.presentEntityIds.has(entity.entityId);
  const isPresent = curr.presentEntityIds.has(entity.entityId);

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
