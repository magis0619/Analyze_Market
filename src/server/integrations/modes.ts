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

/**
 * GBPのAPI割当承認を待たずに連携経路全体を動かすためのフィクスチャモード。
 * 同じ normalize 経路・同じ sourceName を通るので、設定UI・未返信検出・
 * ダッシュボード表示・劣化時の挙動まで承認前に検証できる。
 *
 * 予算判定もこれを見る (フィクスチャは課金しないため、実行間隔で縛らない)。
 */
export function isGbpFixtureMode(): boolean {
  return process.env.GBP_FIXTURE_MODE === '1';
}
