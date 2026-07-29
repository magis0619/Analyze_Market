/**
 * 鍵ローテーション後に、旧鍵で保存された認証情報を現行鍵で再暗号化する。
 *
 * 手順:
 *   1. 新鍵を生成: openssl rand -base64 32
 *   2. .env を `CREDENTIALS_ENC_KEYS=k2:<新鍵>,k1:<旧鍵>` に更新 (新鍵が先頭)
 *      → この時点で新規書き込みは k2、旧データの読み出しも継続して成功する
 *   3. npx tsx scripts/reencrypt-credentials.ts
 *   4. .env から k1 を削除
 *
 * 実行: npx tsx scripts/reencrypt-credentials.ts
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../src/server/db/client';
import { integrations } from '../src/server/db/schema';
import {
  credentialsAad,
  decryptSecret,
  encryptSecret,
  isEncryptedWithActiveKey,
} from '../src/server/crypto/secret-box';

async function main() {
  const rows = await db
    .select({
      id: integrations.id,
      salonId: integrations.salonId,
      provider: integrations.provider,
      encryptedCredentials: integrations.encryptedCredentials,
    })
    .from(integrations);

  let reencrypted = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.encryptedCredentials) {
      skipped += 1;
      continue;
    }
    if (isEncryptedWithActiveKey(row.encryptedCredentials)) {
      skipped += 1;
      continue;
    }
    const aad = credentialsAad(row.salonId, row.provider);
    try {
      const plaintext = decryptSecret(row.encryptedCredentials, aad);
      await db
        .update(integrations)
        .set({ encryptedCredentials: encryptSecret(plaintext, aad) })
        .where(eq(integrations.id, row.id));
      reencrypted += 1;
    } catch (error) {
      // 旧鍵が既に env から外れている場合はここに来る。該当行は再連携が必要。
      console.error(`再暗号化に失敗: integration=${row.id} provider=${row.provider}`, error);
      failed += 1;
    }
  }

  console.log(`再暗号化 ${reencrypted}件 / スキップ ${skipped}件 / 失敗 ${failed}件`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
