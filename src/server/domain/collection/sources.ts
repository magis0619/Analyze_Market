/**
 * collection_runs.source に入る値。
 * 画面のラベルや予算集計がこの定数を参照するため、文字列リテラルを散らさない。
 */
export const PIPELINE_SOURCE = 'pipeline';
export const PLACES_SOURCE = 'google_places';
export const OWN_SALON_SOURCE = 'own_salon';
export const GBP_SOURCE = 'gbp';
export const AI_COACH_SOURCE = 'ai_coach';

/** データ鮮度・収集履歴に表示する順序 */
export const DISPLAY_SOURCES = [
  PLACES_SOURCE,
  OWN_SALON_SOURCE,
  AI_COACH_SOURCE,
  PIPELINE_SOURCE,
] as const;

export const SOURCE_LABELS: Record<string, string> = {
  [PLACES_SOURCE]: '競合データ',
  [OWN_SALON_SOURCE]: '自店舗データ',
  [GBP_SOURCE]: '自店舗データ (GBP)',
  [AI_COACH_SOURCE]: 'AIコーチ生成',
  [PIPELINE_SOURCE]: '差分・レポート生成',
};
