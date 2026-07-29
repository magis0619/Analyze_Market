/** 自店舗データのワイヤ形式 (GBP風)。実GBP連携は BACKLOG.md 参照 */

export interface OwnSalonReview {
  reviewId: string;
  star: number;
  comment: string;
  createdAt: string;
  replied: boolean;
}

export interface OwnSalonSnapshot {
  rating: number;
  reviewCount: number;
  reviews: OwnSalonReview[];
}

export interface OwnSalonInput {
  salonName: string;
}
