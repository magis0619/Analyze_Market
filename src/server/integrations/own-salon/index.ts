import type { DataSourceAdapter } from '../types';
import { MockOwnSalonAdapter } from './mock';
import type { OwnSalonInput, OwnSalonSnapshot } from './types';

export type OwnSalonAdapter = DataSourceAdapter<OwnSalonInput, OwnSalonSnapshot>;

/**
 * 自店舗データのアダプタ選択。
 * - dataMode 'demo'   → モックアダプタ (GBP風のデモデータ)
 * - dataMode 'manual' → アダプタなし (オーナーの手入力が source='manual' の観測として保存される)
 * 実GBP OAuth 連携は BACKLOG.md 参照。実装時はここに real.ts を追加する。
 */
export function getOwnSalonAdapter(
  dataMode: 'demo' | 'manual',
  salonId: string,
  runIndex: number,
): OwnSalonAdapter | null {
  if (dataMode === 'manual') return null;
  return new MockOwnSalonAdapter(salonId, runIndex);
}

export { OWN_SALON_EXTERNAL_ID } from './normalize';
