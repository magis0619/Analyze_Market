import { fnv1a, mulberry32 } from '../rng';
import type { DataSourceAdapter, NormalizedCollection } from '../types';
import { normalizeOwnSalonSnapshot } from './normalize';
import type { OwnSalonInput, OwnSalonReview, OwnSalonSnapshot } from './types';

/**
 * 自店舗データのモック (GBP連携の代替。実連携は BACKLOG)。
 *
 * シナリオステップ (runIndex):
 * - step 0: 評価4.2 / 口コミ38件 / 直近3件 (全て返信済み)
 * - step 1: ★2の未返信口コミが1件届く (+★5が1件) → own_low_rating_review の検知対象
 * - step 2: 評価が 4.2 → 4.1 に低下 → own_rating_change の検知対象
 * - step 3+: 口コミ数が少しずつ増える有界ドリフト
 */

const BASE_REVIEWS: readonly OwnSalonReview[] = [
  {
    reviewId: 'demo-r-101',
    star: 5,
    comment: 'カラーの仕上がりがとても良かったです。また伺います。',
    createdAt: '2026-07-05T10:00:00+09:00',
    replied: true,
  },
  {
    reviewId: 'demo-r-102',
    star: 4,
    comment: '落ち着いた雰囲気で丁寧に対応してもらえました。',
    createdAt: '2026-07-12T14:30:00+09:00',
    replied: true,
  },
  {
    reviewId: 'demo-r-103',
    star: 5,
    comment: 'ショートカットのセンスが抜群です。',
    createdAt: '2026-07-18T11:15:00+09:00',
    replied: true,
  },
];

const STEP1_REVIEWS: readonly OwnSalonReview[] = [
  {
    reviewId: 'demo-r-104',
    star: 2,
    comment: '予約時間に案内されず30分待ちました。仕上がりは普通でした。',
    createdAt: '2026-07-22T18:00:00+09:00',
    replied: false,
  },
  {
    reviewId: 'demo-r-105',
    star: 5,
    comment: 'トリートメントメニューが充実していて満足です。',
    createdAt: '2026-07-23T12:00:00+09:00',
    replied: true,
  },
];

const STEP2_REVIEWS: readonly OwnSalonReview[] = [
  {
    reviewId: 'demo-r-106',
    star: 4,
    comment: '安定のクオリティでした。',
    createdAt: '2026-07-26T16:00:00+09:00',
    replied: false,
  },
];

function countDrift(seed: number, runIndex: number): number {
  let total = 0;
  for (let k = 3; k <= runIndex; k++) {
    const rng = mulberry32((seed ^ Math.imul(k, 0x85ebca6b)) >>> 0);
    total += Math.floor(rng() * 2);
  }
  return total;
}

export function buildMockOwnSalonSnapshot(salonId: string, runIndex: number): OwnSalonSnapshot {
  const seed = fnv1a(salonId);
  const step = Math.min(runIndex, 3);

  const reviews: OwnSalonReview[] = [...BASE_REVIEWS];
  let rating = 4.2;
  let reviewCount = 38;

  if (step >= 1) {
    reviews.push(...STEP1_REVIEWS);
    reviewCount += STEP1_REVIEWS.length;
  }
  if (step >= 2) {
    reviews.push(...STEP2_REVIEWS);
    reviewCount += STEP2_REVIEWS.length;
    rating = 4.1;
  }
  reviewCount += countDrift(seed, runIndex);

  return { rating, reviewCount, reviews };
}

export class MockOwnSalonAdapter implements DataSourceAdapter<OwnSalonInput, OwnSalonSnapshot> {
  readonly sourceName = 'own_salon_mock' as const;
  readonly mode = 'mock' as const;

  constructor(
    private readonly salonId: string,
    private readonly runIndex: number,
  ) {}

  async collect(input: OwnSalonInput): Promise<OwnSalonSnapshot> {
    void input;
    return buildMockOwnSalonSnapshot(this.salonId, this.runIndex);
  }

  normalize(raw: OwnSalonSnapshot): NormalizedCollection {
    return normalizeOwnSalonSnapshot(raw, 'own_salon_mock');
  }
}
