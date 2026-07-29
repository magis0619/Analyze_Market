/**
 * 外部連携のモード判定を一元化する。
 * 各アダプタの factory と、UI のバッジ表示が同じ関数を参照することで
 * 「adapter は実APIなのにバッジはデモ」のような二重管理を防ぐ。
 */

export type PlacesMode = 'real' | 'mock';
export type AiMode = 'anthropic' | 'fallback';

export function getPlacesMode(): PlacesMode {
  return process.env.GOOGLE_MAPS_API_KEY ? 'real' : 'mock';
}

export function getAiMode(): AiMode {
  return process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'fallback';
}

/** データ鮮度パネルなどに出すソース表示ラベル */
export function getPlacesModeLabel(): string {
  return getPlacesMode() === 'real' ? 'Google Places API' : 'デモ';
}
