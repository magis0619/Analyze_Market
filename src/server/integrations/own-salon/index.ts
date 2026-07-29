import type { OwnSalonDataMode } from '@/server/db/schema';
import type { DataSourceAdapter } from '../types';
import { MockOwnSalonAdapter } from './mock';
import type { OwnSalonInput, OwnSalonSnapshot } from './types';

export type OwnSalonAdapter = DataSourceAdapter<OwnSalonInput, OwnSalonSnapshot>;

export interface OwnSalonAdapterContext {
  dataMode: OwnSalonDataMode;
  salonId: string;
  /** モックのシナリオ進行に使う。demo 以外では参照されない */
  runIndex: number;
}

export interface OwnSalonAdapterSelection {
  /** null = このモードではアダプタ収集を行わない (手入力・連携切れ) */
  adapter: OwnSalonAdapter | null;
  /** AIコーチとダッシュボードに渡すデータ出所の説明 */
  note: string;
}

/**
 * 自店舗データのアダプタ選択。
 * - 'demo'   → モックアダプタ (GBP風のデモデータ)
 * - 'manual' → アダプタなし (オーナーの手入力が source='manual' の観測として保存される)
 * - 'gbp'    → GBP連携アダプタ (未接続・トークン失効時は null + 再連携を促すnote)
 */
export async function getOwnSalonAdapter(
  ctx: OwnSalonAdapterContext,
): Promise<OwnSalonAdapterSelection> {
  if (ctx.dataMode === 'manual') {
    return { adapter: null, note: '自店舗データはオーナーの手入力値です。' };
  }

  if (ctx.dataMode === 'gbp') {
    // GBPアダプタ本体は real.ts (C13-C14)。未接続・トークン失効時は
    // アダプタなし + 再連携を促す note を返し、パイプラインは前回値で継続する。
    const { createGbpOwnSalonAdapter } = await import('./real');
    return createGbpOwnSalonAdapter(ctx.salonId);
  }

  return {
    adapter: new MockOwnSalonAdapter(ctx.salonId, ctx.runIndex),
    note: '自店舗データはデモデータです。',
  };
}

export { OWN_SALON_EXTERNAL_ID } from './normalize';
