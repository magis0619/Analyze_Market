import { describe, expect, it } from 'vitest';
import { detectChanges } from './diff-engine';
import { severityFor } from './severity';
import { emptySnapshot, metricKeyOf, type DiffEntity, type Snapshot } from './types';

const COMPETITOR: DiffEntity = {
  entityId: 'ent-comp-1',
  entityType: 'competitor',
  name: 'hair make Bloom',
  isExcluded: false,
  isPriority: false,
  distanceM: 320,
};
const OWN: DiffEntity = {
  entityId: 'ent-own',
  entityType: 'own_salon',
  name: '自店舗',
  isExcluded: false,
  isPriority: false,
  distanceM: null,
};

let obsSeq = 0;
function snapshot(build: (s: Snapshot) => void): Snapshot {
  const s = emptySnapshot();
  build(s);
  return s;
}
function addMetric(s: Snapshot, entityId: string, metric: string, value: number): void {
  s.metrics.set(metricKeyOf(entityId, metric), {
    value,
    observationId: `obs-${++obsSeq}`,
    observedAt: new Date('2026-07-22T00:00:00Z'),
  });
  s.presentEntityIds.add(entityId);
}
function addStatus(s: Snapshot, entityId: string, status: string): void {
  s.statuses.set(entityId, { status, observationId: `obs-${++obsSeq}` });
  s.presentEntityIds.add(entityId);
}
function addReview(
  s: Snapshot,
  entityId: string,
  reviewId: string,
  star: number,
  replied = false,
): void {
  s.reviews.set(reviewId, {
    observationId: `obs-${++obsSeq}`,
    star,
    replied,
    comment: 'テスト口コミ',
  });
  s.presentEntityIds.add(entityId);
}

describe('detectChanges', () => {
  it('初回 (prevが空) は差分イベントを生成しない', () => {
    const curr = snapshot((s) => {
      addMetric(s, COMPETITOR.entityId, 'rating', 4.1);
      addStatus(s, COMPETITOR.entityId, 'OPERATIONAL');
    });
    expect(detectChanges([COMPETITOR], emptySnapshot(), curr)).toHaveLength(0);
  });

  it('new_competitor: 前回なし→今回あり (severity=high, evidence付き)', () => {
    const prev = snapshot((s) => addStatus(s, 'ent-other', 'OPERATIONAL'));
    const curr = snapshot((s) => {
      addMetric(s, COMPETITOR.entityId, 'rating', 4.9);
      addStatus(s, COMPETITOR.entityId, 'OPERATIONAL');
    });
    const events = detectChanges([COMPETITOR], prev, curr);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: 'new_competitor', severity: 'high' });
    expect(events[0]?.title).toContain('hair make Bloom');
    expect(events[0]?.title).toContain('320m');
    expect(events[0]?.evidenceObservationIds.length).toBeGreaterThanOrEqual(1);
  });

  it('除外済み競合はイベントを生成しない', () => {
    const excluded = { ...COMPETITOR, isExcluded: true };
    const prev = snapshot((s) => addStatus(s, 'ent-other', 'OPERATIONAL'));
    const curr = snapshot((s) => addStatus(s, excluded.entityId, 'OPERATIONAL'));
    expect(detectChanges([excluded], prev, curr)).toHaveLength(0);
  });

  it('competitor_closed: 営業状態がOPERATIONAL→CLOSED_TEMPORARILY', () => {
    const prev = snapshot((s) => addStatus(s, COMPETITOR.entityId, 'OPERATIONAL'));
    const curr = snapshot((s) => addStatus(s, COMPETITOR.entityId, 'CLOSED_TEMPORARILY'));
    const events = detectChanges([COMPETITOR], prev, curr);
    expect(events[0]).toMatchObject({ eventType: 'competitor_closed', severity: 'medium' });
  });

  it('competitor_closed: 検索結果から消失', () => {
    const prev = snapshot((s) => addStatus(s, COMPETITOR.entityId, 'OPERATIONAL'));
    const curr = snapshot((s) => addStatus(s, 'ent-other', 'OPERATIONAL'));
    const events = detectChanges([COMPETITOR], prev, curr);
    expect(events[0]?.eventType).toBe('competitor_closed');
    expect(events[0]?.title).toContain('消失');
  });

  it('rating_change: |Δ|=0.09は検知せず、0.1で検知する (境界値)', () => {
    const prevA = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'rating', 4.1));
    const currA = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'rating', 4.19));
    expect(detectChanges([COMPETITOR], prevA, currA)).toHaveLength(0);

    const prevB = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'rating', 4.1));
    const currB = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'rating', 4.2));
    const events = detectChanges([COMPETITOR], prevB, currB);
    expect(events[0]).toMatchObject({ eventType: 'rating_change', severity: 'low' });
    expect(events[0]?.title).toContain('4.1→4.2');
    expect(events[0]?.evidenceObservationIds).toHaveLength(2);
  });

  it('review_count_change: 通常+5未満は検知せず、重要競合は+3で検知 (severity=high)', () => {
    const prev = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'review_count', 100));
    const curr = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'review_count', 104));
    expect(detectChanges([COMPETITOR], prev, curr)).toHaveLength(0);

    const priority = { ...COMPETITOR, isPriority: true };
    const prevP = snapshot((s) => addMetric(s, priority.entityId, 'review_count', 100));
    const currP = snapshot((s) => addMetric(s, priority.entityId, 'review_count', 103));
    const events = detectChanges([priority], prevP, currP);
    expect(events[0]).toMatchObject({ eventType: 'review_count_change', severity: 'high' });
  });

  it('own_low_rating_review: 新規★2のみ検知し、既知の口コミは再検知しない', () => {
    const prev = snapshot((s) => addReview(s, OWN.entityId, 'r-known', 2));
    const curr = snapshot((s) => {
      addReview(s, OWN.entityId, 'r-known', 2);
      addReview(s, OWN.entityId, 'r-new', 1);
      addReview(s, OWN.entityId, 'r-good', 5);
    });
    const events = detectChanges([OWN], prev, curr);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: 'own_low_rating_review', severity: 'high' });
    expect(events[0]?.title).toContain('★1');
    expect(events[0]?.title).toContain('未返信');
  });

  it('own_rating_change: 低下はmedium、上昇はlow', () => {
    const prevDown = snapshot((s) => addMetric(s, OWN.entityId, 'rating', 4.2));
    const currDown = snapshot((s) => addMetric(s, OWN.entityId, 'rating', 4.1));
    const down = detectChanges([OWN], prevDown, currDown);
    expect(down[0]).toMatchObject({ eventType: 'own_rating_change', severity: 'medium' });

    const prevUp = snapshot((s) => addMetric(s, OWN.entityId, 'rating', 4.1));
    const currUp = snapshot((s) => addMetric(s, OWN.entityId, 'rating', 4.3));
    const up = detectChanges([OWN], prevUp, currUp);
    expect(up[0]).toMatchObject({ eventType: 'own_rating_change', severity: 'low' });
  });
});

describe('severityFor', () => {
  it('仕様04の重要度表に従う', () => {
    expect(severityFor('new_competitor')).toBe('high');
    expect(severityFor('own_low_rating_review')).toBe('high');
    expect(severityFor('own_rating_change', { delta: -0.2 })).toBe('medium');
    expect(severityFor('own_rating_change', { delta: 0.2 })).toBe('low');
    expect(severityFor('competitor_closed')).toBe('medium');
    expect(severityFor('rating_change', {})).toBe('low');
    expect(severityFor('rating_change', { isPriority: true })).toBe('medium');
    expect(severityFor('review_count_change', {})).toBe('medium');
    expect(severityFor('review_count_change', { isPriority: true })).toBe('high');
  });
});
