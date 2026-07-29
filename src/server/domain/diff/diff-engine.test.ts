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
  // 既定は1日前。未返信検出(7日超)に引っかからない値にしておく
  createdAt: Date = new Date('2026-07-28T00:00:00Z'),
): void {
  s.reviews.set(reviewId, {
    observationId: `obs-${++obsSeq}`,
    star,
    replied,
    comment: 'テスト口コミ',
    createdAt,
  });
  s.presentEntityIds.add(entityId);
}

const NOW = new Date('2026-07-29T00:00:00Z');
/** 未返信判定が発火しない既定clock (since=now なので境界跨ぎが起きない) */
const CLOCK = { now: NOW, since: NOW, competitorDataFresh: true };

describe('detectChanges', () => {
  it('初回 (prevが空) は差分イベントを生成しない', () => {
    const curr = snapshot((s) => {
      addMetric(s, COMPETITOR.entityId, 'rating', 4.1);
      addStatus(s, COMPETITOR.entityId, 'OPERATIONAL');
    });
    expect(detectChanges([COMPETITOR], emptySnapshot(), curr, CLOCK)).toHaveLength(0);
  });

  it('new_competitor: 前回なし→今回あり (severity=high, evidence付き)', () => {
    const prev = snapshot((s) => addStatus(s, 'ent-other', 'OPERATIONAL'));
    const curr = snapshot((s) => {
      addMetric(s, COMPETITOR.entityId, 'rating', 4.9);
      addStatus(s, COMPETITOR.entityId, 'OPERATIONAL');
    });
    const events = detectChanges([COMPETITOR], prev, curr, CLOCK);
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
    expect(detectChanges([excluded], prev, curr, CLOCK)).toHaveLength(0);
  });

  it('competitor_closed: 営業状態がOPERATIONAL→CLOSED_TEMPORARILY', () => {
    const prev = snapshot((s) => addStatus(s, COMPETITOR.entityId, 'OPERATIONAL'));
    const curr = snapshot((s) => addStatus(s, COMPETITOR.entityId, 'CLOSED_TEMPORARILY'));
    const events = detectChanges([COMPETITOR], prev, curr, CLOCK);
    expect(events[0]).toMatchObject({ eventType: 'competitor_closed', severity: 'medium' });
  });

  it('competitor_closed: 検索結果から消失', () => {
    const prev = snapshot((s) => addStatus(s, COMPETITOR.entityId, 'OPERATIONAL'));
    const curr = snapshot((s) => addStatus(s, 'ent-other', 'OPERATIONAL'));
    const events = detectChanges([COMPETITOR], prev, curr, CLOCK);
    expect(events[0]?.eventType).toBe('competitor_closed');
    expect(events[0]?.title).toContain('消失');
  });

  describe('competitorDataFresh=false (Places未取得: API障害・予算上限・タイムアウト)', () => {
    const STALE = { ...CLOCK, competitorDataFresh: false };

    it('不在を閉店と解釈しない (全競合への偽イベント量産を防ぐ)', () => {
      const prev = snapshot((s) => {
        addStatus(s, COMPETITOR.entityId, 'OPERATIONAL');
        addMetric(s, COMPETITOR.entityId, 'rating', 4.1);
      });
      // 取得できなかった回は curr の presentEntityIds が空になる
      const curr = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'rating', 4.1));
      curr.presentEntityIds.clear();

      expect(detectChanges([COMPETITOR], prev, curr, STALE)).toHaveLength(0);
      // 同じ入力で fresh=true なら消失として検知される (この差が今回の防波堤)
      expect(detectChanges([COMPETITOR], prev, curr, CLOCK)[0]?.eventType).toBe(
        'competitor_closed',
      );
    });

    it('新規競合も出さない', () => {
      const prev = snapshot((s) => addStatus(s, 'ent-other', 'OPERATIONAL'));
      const curr = snapshot((s) => addStatus(s, COMPETITOR.entityId, 'OPERATIONAL'));
      expect(detectChanges([COMPETITOR], prev, curr, STALE)).toHaveLength(0);
    });

    it('評価変化は前回値同士の比較になるため差分0だが、実際に動いていれば検知する', () => {
      const prev = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'rating', 4.1));
      const same = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'rating', 4.1));
      expect(detectChanges([COMPETITOR], prev, same, STALE)).toHaveLength(0);

      const moved = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'rating', 4.4));
      const events = detectChanges([COMPETITOR], prev, moved, STALE);
      expect(events[0]?.eventType).toBe('rating_change');
    });
  });

  it('rating_change: |Δ|=0.09は検知せず、0.1で検知する (境界値)', () => {
    const prevA = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'rating', 4.1));
    const currA = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'rating', 4.19));
    expect(detectChanges([COMPETITOR], prevA, currA, CLOCK)).toHaveLength(0);

    const prevB = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'rating', 4.1));
    const currB = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'rating', 4.2));
    const events = detectChanges([COMPETITOR], prevB, currB, CLOCK);
    expect(events[0]).toMatchObject({ eventType: 'rating_change', severity: 'low' });
    expect(events[0]?.title).toContain('4.1→4.2');
    expect(events[0]?.evidenceObservationIds).toHaveLength(2);
  });

  it('review_count_change: 通常+5未満は検知せず、重要競合は+3で検知 (severity=high)', () => {
    const prev = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'review_count', 100));
    const curr = snapshot((s) => addMetric(s, COMPETITOR.entityId, 'review_count', 104));
    expect(detectChanges([COMPETITOR], prev, curr, CLOCK)).toHaveLength(0);

    const priority = { ...COMPETITOR, isPriority: true };
    const prevP = snapshot((s) => addMetric(s, priority.entityId, 'review_count', 100));
    const currP = snapshot((s) => addMetric(s, priority.entityId, 'review_count', 103));
    const events = detectChanges([priority], prevP, currP, CLOCK);
    expect(events[0]).toMatchObject({ eventType: 'review_count_change', severity: 'high' });
  });

  it('own_low_rating_review: 新規★2のみ検知し、既知の口コミは再検知しない', () => {
    const prev = snapshot((s) => addReview(s, OWN.entityId, 'r-known', 2));
    const curr = snapshot((s) => {
      addReview(s, OWN.entityId, 'r-known', 2);
      addReview(s, OWN.entityId, 'r-new', 1);
      addReview(s, OWN.entityId, 'r-good', 5);
    });
    const events = detectChanges([OWN], prev, curr, CLOCK);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventType: 'own_low_rating_review', severity: 'high' });
    expect(events[0]?.title).toContain('★1');
    expect(events[0]?.title).toContain('未返信');
  });

  it('own_rating_change: 低下はmedium、上昇はlow', () => {
    const prevDown = snapshot((s) => addMetric(s, OWN.entityId, 'rating', 4.2));
    const currDown = snapshot((s) => addMetric(s, OWN.entityId, 'rating', 4.1));
    const down = detectChanges([OWN], prevDown, currDown, CLOCK);
    expect(down[0]).toMatchObject({ eventType: 'own_rating_change', severity: 'medium' });

    const prevUp = snapshot((s) => addMetric(s, OWN.entityId, 'rating', 4.1));
    const currUp = snapshot((s) => addMetric(s, OWN.entityId, 'rating', 4.3));
    const up = detectChanges([OWN], prevUp, currUp, CLOCK);
    expect(up[0]).toMatchObject({ eventType: 'own_rating_change', severity: 'low' });
  });
});

describe('own_unreplied_review (7日超の未返信)', () => {
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

  it('7日境界を跨いだ回に1度だけ発火し、次の収集では発火しない', () => {
    // 8日前の未返信口コミ。前回実行は2日前 → 7日境界 (1日前) を跨いでいる
    const prev = snapshot((s) => addReview(s, OWN.entityId, 'r-1', 3, false, daysAgo(8)));
    const curr = snapshot((s) => addReview(s, OWN.entityId, 'r-1', 3, false, daysAgo(8)));

    const first = detectChanges([OWN], prev, curr, { now: NOW, since: daysAgo(2), competitorDataFresh: true });
    const unreplied = first.filter((e) => e.eventType === 'own_unreplied_review');
    expect(unreplied).toHaveLength(1);
    expect(unreplied[0]?.severity).toBe('high');
    expect(unreplied[0]?.title).toContain('8日間未返信');

    // 次の収集: 既に境界を跨ぎ済みなので再発火しない (エンジンは状態を持たないため重要)
    const second = detectChanges([OWN], prev, curr, { now: NOW, since: daysAgo(0.5), competitorDataFresh: true });
    expect(second.filter((e) => e.eventType === 'own_unreplied_review')).toHaveLength(0);
  });

  it('7日未満なら発火しない', () => {
    const prev = snapshot((s) => addReview(s, OWN.entityId, 'r-1', 3, false, daysAgo(6)));
    const curr = snapshot((s) => addReview(s, OWN.entityId, 'r-1', 3, false, daysAgo(6)));
    const events = detectChanges([OWN], prev, curr, { now: NOW, since: daysAgo(2), competitorDataFresh: true });
    expect(events.filter((e) => e.eventType === 'own_unreplied_review')).toHaveLength(0);
  });

  it('返信済みなら経過日数によらず発火しない', () => {
    const prev = snapshot((s) => addReview(s, OWN.entityId, 'r-1', 3, true, daysAgo(30)));
    const curr = snapshot((s) => addReview(s, OWN.entityId, 'r-1', 3, true, daysAgo(30)));
    const events = detectChanges([OWN], prev, curr, { now: NOW, since: daysAgo(2), competitorDataFresh: true });
    expect(events.filter((e) => e.eventType === 'own_unreplied_review')).toHaveLength(0);
  });

  it('prevに無い既に古い口コミ (GBP初回のバックフィル) は発火する', () => {
    const prev = snapshot((s) => addReview(s, OWN.entityId, 'r-existing', 5, true, daysAgo(1)));
    const curr = snapshot((s) => {
      addReview(s, OWN.entityId, 'r-existing', 5, true, daysAgo(1));
      addReview(s, OWN.entityId, 'r-backfilled', 3, false, daysAgo(60));
    });
    const events = detectChanges([OWN], prev, curr, { now: NOW, since: daysAgo(2), competitorDataFresh: true });
    expect(events.filter((e) => e.eventType === 'own_unreplied_review')).toHaveLength(1);
  });

  it('大量バックフィルでも1回の収集で最大3件に制限される', () => {
    const prev = snapshot((s) => addReview(s, OWN.entityId, 'seed', 5, true, daysAgo(1)));
    const curr = snapshot((s) => {
      addReview(s, OWN.entityId, 'seed', 5, true, daysAgo(1));
      for (let i = 0; i < 10; i++) {
        addReview(s, OWN.entityId, `old-${i}`, 3, false, daysAgo(10 + i));
      }
    });
    const events = detectChanges([OWN], prev, curr, { now: NOW, since: daysAgo(2), competitorDataFresh: true });
    expect(events.filter((e) => e.eventType === 'own_unreplied_review')).toHaveLength(3);
  });

  it('初回実行 (prevが空) では発火しない', () => {
    const curr = snapshot((s) => addReview(s, OWN.entityId, 'r-1', 3, false, daysAgo(30)));
    const events = detectChanges([OWN], emptySnapshot(), curr, { now: NOW, since: null, competitorDataFresh: true });
    expect(events).toHaveLength(0);
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
