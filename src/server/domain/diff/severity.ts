import type { ChangeEventType, Severity } from '@/server/db/schema';

export interface SeverityContext {
  isPriority?: boolean;
  /** 数値変化の方向。rating_change / own_rating_change で使う */
  delta?: number;
}

/** 仕様04「重要イベント判定例」に基づく重要度ルール */
export function severityFor(eventType: ChangeEventType, ctx: SeverityContext = {}): Severity {
  switch (eventType) {
    case 'new_competitor':
      return 'high';
    case 'own_low_rating_review':
      return 'high';
    case 'own_unreplied_review':
      // 仕様04: 7日超の未返信は高。検索閲覧者に見え続けるため
      return 'high';
    case 'own_rating_change':
      return (ctx.delta ?? 0) < 0 ? 'medium' : 'low';
    case 'competitor_closed':
      return 'medium';
    case 'rating_change':
      return ctx.isPriority ? 'medium' : 'low';
    case 'review_count_change':
      return ctx.isPriority ? 'high' : 'medium';
  }
}
