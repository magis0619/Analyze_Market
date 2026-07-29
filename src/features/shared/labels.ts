import type { ChangeEventType, RecommendationStatus, Severity } from '@/server/db/schema';

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'CRIT',
  high: 'HIGH',
  medium: 'MED',
  low: 'LOW',
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const SEVERITY_BADGE_CLASSES: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-800 border-red-300',
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-800 border-amber-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const RISK_LEVEL_LABELS: Record<string, string> = {
  low: 'リスク低',
  medium: 'リスク中',
  high: 'リスク高',
};

export const EVENT_TYPE_LABELS: Record<ChangeEventType, string> = {
  new_competitor: '新規競合',
  competitor_closed: '競合の閉店・消失',
  rating_change: '競合の評価変化',
  review_count_change: '競合の口コミ増加',
  own_low_rating_review: '自店舗の低評価口コミ',
  own_rating_change: '自店舗の評価変化',
  own_unreplied_review: '自店舗の未返信口コミ',
};

export const RECOMMENDATION_STATUS_LABELS: Record<RecommendationStatus, string> = {
  proposed: '提案中',
  accepted: '実施する',
  on_hold: '保留',
  rejected: '却下',
  completed: '完了',
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  low: 'かんたん',
  medium: 'ふつう',
  high: 'むずかしい',
};

export function formatDateTime(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value: string | Date | null): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value;
  return date.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** 数値変化のテキスト表現 (仕様07: 改善/悪化/変化なし/観測不足) */
export function trendLabel(delta: number | null): string {
  if (delta === null) return '観測不足';
  if (delta > 0) return '改善';
  if (delta < 0) return '悪化';
  return '変化なし';
}
