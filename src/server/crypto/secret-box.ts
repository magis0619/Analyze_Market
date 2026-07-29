import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * 保存時暗号化 (AES-256-GCM)。OAuth トークンなどを DB の text 列に安全に格納する。
 *
 * ペイロード形式: `v1.<kid>.<iv>.<ciphertext>.<tag>` (いずれも base64url)
 * - 自己記述的なので、復号側は鍵IDを見て正しい鍵を選べる
 * - 鍵IDを持つことで**無停止の鍵ローテーション**が設定変更だけで済む
 *
 * AAD には `${salonId}:${provider}` を渡すこと。暗号文が行に束縛されるため、
 * 別サロンの integrations 行へコピーしても復号できない。
 */

const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

export class SecretDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretDecryptError';
  }
}

export class SecretConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretConfigError';
  }
}

interface KeyEntry {
  kid: string;
  key: Buffer;
}

function b64u(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function unb64u(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

/**
 * CREDENTIALS_ENC_KEYS="<kid>:<base64 32B>[,<kid>:<base64 32B>...]"
 * 先頭が現行鍵 (新規書き込みに使う)。以降は復号専用の旧鍵。
 */
function loadKeys(): KeyEntry[] {
  const raw = process.env.CREDENTIALS_ENC_KEYS;
  if (!raw) {
    throw new SecretConfigError(
      'CREDENTIALS_ENC_KEYS が未設定です。`k1:$(openssl rand -base64 32)` の形式で設定してください',
    );
  }

  const entries: KeyEntry[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(':');
    if (separator <= 0) {
      throw new SecretConfigError('CREDENTIALS_ENC_KEYS の形式が不正です (kid:base64key)');
    }
    const kid = trimmed.slice(0, separator);
    const keyMaterial = trimmed.slice(separator + 1);
    // ペイロードの区切り文字と衝突させない
    if (kid.includes('.')) {
      throw new SecretConfigError(`鍵ID "${kid}" に '.' は使えません`);
    }
    if (seen.has(kid)) {
      throw new SecretConfigError(`鍵ID "${kid}" が重複しています`);
    }
    const key = Buffer.from(keyMaterial, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new SecretConfigError(`鍵 "${kid}" は32バイトである必要があります (現在 ${key.length})`);
    }
    seen.add(kid);
    entries.push({ kid, key });
  }

  if (entries.length === 0) {
    throw new SecretConfigError('CREDENTIALS_ENC_KEYS に有効な鍵がありません');
  }
  return entries;
}

/** 現行鍵で暗号化する */
export function encryptSecret(plaintext: string, aad: string): string {
  const active = loadKeys()[0]!;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', active.key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, active.kid, b64u(iv), b64u(ciphertext), b64u(cipher.getAuthTag())].join('.');
}

/** 鍵IDを見て適切な鍵で復号する。改竄・AAD不一致・未知の鍵IDは例外 */
export function decryptSecret(payload: string, aad: string): string {
  const parts = payload.split('.');
  if (parts.length !== 5) {
    throw new SecretDecryptError('暗号ペイロードの形式が不正です');
  }
  const [version, kid, iv, ciphertext, tag] = parts as [string, string, string, string, string];
  if (version !== VERSION) {
    throw new SecretDecryptError(`未対応の暗号バージョンです: ${version}`);
  }

  const entry = loadKeys().find((candidate) => candidate.kid === kid);
  if (!entry) {
    // 鍵をローテーションで外した後に古い暗号文が残っているケース。
    // 黙って失敗させず、再連携を促せるよう明示的に落とす。
    throw new SecretDecryptError(`未知の鍵IDです: ${kid}`);
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', entry.key, unb64u(iv));
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(unb64u(tag));
    return Buffer.concat([decipher.update(unb64u(ciphertext)), decipher.final()]).toString('utf8');
  } catch {
    // AAD不一致・改竄・鍵違いはすべてここに来る (詳細は攻撃者に返さない)
    throw new SecretDecryptError('復号に失敗しました (鍵違い・改竄・AAD不一致)');
  }
}

/** 暗号文が現行鍵で書かれているか (再暗号化が必要かの判定に使う) */
export function isEncryptedWithActiveKey(payload: string): boolean {
  const kid = payload.split('.')[1];
  if (!kid) return false;
  const active = loadKeys()[0]!;
  const a = Buffer.from(kid);
  const b = Buffer.from(active.kid);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** integrations 行に束縛するための AAD */
export function credentialsAad(salonId: string, provider: string): string {
  return `${salonId}:${provider}`;
}
