import type { OwnSalonReview, OwnSalonSnapshot } from '../own-salon/types';
import type { GbpReviewsResponse, GbpStarRating } from './types';

const STAR_RATING_VALUES: Record<GbpStarRating, number | null> = {
  STAR_RATING_UNSPECIFIED: null,
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export class GbpNormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GbpNormalizeError';
  }
}

/**
 * v4 の口コミレスポンスを共通の OwnSalonSnapshot に変換する。
 * これにより normalizeOwnSalonSnapshot をそのまま再利用でき、
 * デモ→手入力→GBP を跨いでもエンティティ同一性が保たれる。
 */
export function normalizeGbpReviews(raw: GbpReviewsResponse): OwnSalonSnapshot {
  // ページ内平均で代用してはいけない。
  // normalizeOwnSalonSnapshot は無条件に rating 観測を出すため、
  // ページ内平均だと実際には変化していない評価が変化したように見え、
  // 偽の own_rating_change を生む。
  if (typeof raw.averageRating !== 'number') {
    throw new GbpNormalizeError(
      'GBPレスポンスに averageRating が含まれていません (評価を推定すると偽の変化を生むため中断します)',
    );
  }

  const reviews: OwnSalonReview[] = [];
  for (const review of raw.reviews ?? []) {
    const star = STAR_RATING_VALUES[review.starRating];
    // 星が不明な口コミは評価としても未返信判定としても扱えないので除外する
    if (star === null || star === undefined) continue;
    reviews.push({
      reviewId: review.reviewId,
      star,
      // comment は省略されうる (星のみの口コミ)。空文字だと画面・イベント文が崩れる
      comment: review.comment ?? '(コメントなし)',
      createdAt: review.createTime,
      replied: review.reviewReply != null,
    });
  }

  return {
    rating: raw.averageRating,
    reviewCount: raw.totalReviewCount ?? reviews.length,
    reviews,
  };
}
