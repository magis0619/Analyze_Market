import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { integrations } from '@/server/db/schema';
import { credentialsAad, decryptSecret, encryptSecret } from '@/server/crypto/secret-box';
import type { GbpCredentials } from './types';

const PROVIDER = 'gbp' as const;

function aad(salonId: string): string {
  return credentialsAad(salonId, PROVIDER);
}

/**
 * 復号済み認証情報を返す。**この関数の戻り値を gbp/ の外へ出さないこと**
 * (画面表示には getGbpConnectionSummary を使う)。
 * 復号できない場合は null を返し、呼び出し側は再連携を促す。
 */
export async function loadGbpCredentials(salonId: string): Promise<GbpCredentials | null> {
  const [row] = await db
    .select({ encrypted: integrations.encryptedCredentials, status: integrations.status })
    .from(integrations)
    .where(and(eq(integrations.salonId, salonId), eq(integrations.provider, PROVIDER)))
    .limit(1);

  if (!row?.encrypted) return null;
  try {
    return JSON.parse(decryptSecret(row.encrypted, aad(salonId))) as GbpCredentials;
  } catch (error) {
    // 鍵ローテーションで旧鍵を外した後などに発生する。
    // 黙って無視すると原因不明の「データが来ない」状態になるのでログに残す。
    console.error(`GBP認証情報の復号に失敗しました (salon=${salonId}):`, error);
    return null;
  }
}

export async function saveGbpCredentials(
  salonId: string,
  credentials: GbpCredentials,
): Promise<void> {
  const encrypted = encryptSecret(JSON.stringify(credentials), aad(salonId));
  const [existing] = await db
    .select({ id: integrations.id })
    .from(integrations)
    .where(and(eq(integrations.salonId, salonId), eq(integrations.provider, PROVIDER)))
    .limit(1);

  if (existing) {
    await db
      .update(integrations)
      .set({ encryptedCredentials: encrypted, status: 'active' })
      .where(eq(integrations.id, existing.id));
    return;
  }
  await db
    .insert(integrations)
    .values({ salonId, provider: PROVIDER, status: 'active', encryptedCredentials: encrypted });
}

/** トークン失効時: 認証情報は残したまま status だけ error にして再連携を促す */
export async function markGbpRevoked(salonId: string): Promise<void> {
  await db
    .update(integrations)
    .set({ status: 'error' })
    .where(and(eq(integrations.salonId, salonId), eq(integrations.provider, PROVIDER)));
}

/** 連携解除: 認証情報を完全に削除する */
export async function clearGbpCredentials(salonId: string): Promise<void> {
  await db
    .update(integrations)
    .set({ encryptedCredentials: null, status: 'disconnected' })
    .where(and(eq(integrations.salonId, salonId), eq(integrations.provider, PROVIDER)));
}

export async function touchGbpSyncedAt(salonId: string): Promise<void> {
  await db
    .update(integrations)
    .set({ lastSyncedAt: new Date() })
    .where(and(eq(integrations.salonId, salonId), eq(integrations.provider, PROVIDER)));
}
