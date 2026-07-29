import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { integrations } from '@/server/db/schema';
import { loadGbpCredentials } from '@/server/integrations/gbp/token-store';

/**
 * 画面表示用のGBP連携状態。
 * **トークンを構造上持てない**形にしてあり、これが設定UIに渡る唯一の型。
 * 復号済み認証情報を gbp/ の外へ返す関数を他に作らないこと。
 */
export interface GbpConnectionSummary {
  connected: boolean;
  /** 連携済みだが対象店舗が未選択 */
  needsLocation: boolean;
  /** 連携済み かつ 店舗選択済み = 収集に使える */
  ready: boolean;
  accountName: string | null;
  locationTitle: string | null;
  status: 'active' | 'error' | 'disconnected' | 'not_connected';
  lastSyncedAt: Date | null;
}

export async function getGbpConnectionSummary(salonId: string): Promise<GbpConnectionSummary> {
  const [row] = await db
    .select({ status: integrations.status, lastSyncedAt: integrations.lastSyncedAt })
    .from(integrations)
    .where(and(eq(integrations.salonId, salonId), eq(integrations.provider, 'gbp')))
    .limit(1);

  const credentials = await loadGbpCredentials(salonId);
  const connected = credentials !== null;
  const needsLocation = connected && (!credentials.accountName || !credentials.locationId);

  return {
    connected,
    needsLocation,
    ready: connected && !needsLocation,
    accountName: credentials?.accountName ?? null,
    locationTitle: credentials?.locationTitle ?? null,
    status: !row ? 'not_connected' : row.status,
    lastSyncedAt: row?.lastSyncedAt ?? null,
  };
}
