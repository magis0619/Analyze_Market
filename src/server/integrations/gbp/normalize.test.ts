import { describe, expect, it } from 'vitest';
import { GbpNormalizeError, normalizeGbpReviews } from './normalize';
import type { GbpReviewsResponse } from './types';
import fixture from './fixtures/reviews.page0.json';

const RAW = fixture as GbpReviewsResponse;

describe('normalizeGbpReviews', () => {
  it('店舗全体の averageRating / totalReviewCount をKPIに使う', () => {
    const snapshot = normalizeGbpReviews(RAW);
    expect(snapshot.rating).toBe(4.2);
    // ページ内の件数(5)ではなく店舗全体の件数を使う
    expect(snapshot.reviewCount).toBe(41);
  });

  it('starRating の enum を数値に変換する', () => {
    const snapshot = normalizeGbpReviews(RAW);
    const byId = new Map(snapshot.reviews.map((r) => [r.reviewId, r]));
    expect(byId.get('AbFvOqk_fixture_0001')?.star).toBe(5);
    expect(byId.get('AbFvOqk_fixture_0003')?.star).toBe(2);
  });

  it('reviewReply の有無を replied にマップする', () => {
    const snapshot = normalizeGbpReviews(RAW);
    const byId = new Map(snapshot.reviews.map((r) => [r.reviewId, r]));
    expect(byId.get('AbFvOqk_fixture_0001')?.replied).toBe(true);
    // 返信なし = 未返信。7日超なら own_unreplied_review の対象になる
    expect(byId.get('AbFvOqk_fixture_0003')?.replied).toBe(false);
  });

  it('comment 省略 (星のみの口コミ) を空文字にせずプレースホルダにする', () => {
    const snapshot = normalizeGbpReviews(RAW);
    const starOnly = snapshot.reviews.find((r) => r.reviewId === 'AbFvOqk_fixture_0004');
    expect(starOnly?.comment).toBe('(コメントなし)');
  });

  it('STAR_RATING_UNSPECIFIED は除外する', () => {
    const snapshot = normalizeGbpReviews(RAW);
    expect(snapshot.reviews.find((r) => r.reviewId === 'AbFvOqk_fixture_0005')).toBeUndefined();
    expect(snapshot.reviews).toHaveLength(4);
  });

  it('createTime をそのまま createdAt に渡す', () => {
    const snapshot = normalizeGbpReviews(RAW);
    const first = snapshot.reviews.find((r) => r.reviewId === 'AbFvOqk_fixture_0001');
    expect(first?.createdAt).toBe('2026-07-05T01:00:00Z');
  });

  it('averageRating 欠落時は throw する (ページ内平均で代用すると偽の評価変化を生むため)', () => {
    const withoutAverage: GbpReviewsResponse = { reviews: RAW.reviews, totalReviewCount: 41 };
    expect(() => normalizeGbpReviews(withoutAverage)).toThrow(GbpNormalizeError);
  });

  it('口コミ0件でも averageRating があれば通る', () => {
    const empty: GbpReviewsResponse = { averageRating: 5, totalReviewCount: 0 };
    const snapshot = normalizeGbpReviews(empty);
    expect(snapshot.rating).toBe(5);
    expect(snapshot.reviews).toHaveLength(0);
  });
});
