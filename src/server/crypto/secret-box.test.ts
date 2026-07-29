import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  credentialsAad,
  decryptSecret,
  encryptSecret,
  isEncryptedWithActiveKey,
  SecretConfigError,
  SecretDecryptError,
} from './secret-box';

const KEY_1 = Buffer.alloc(32, 1).toString('base64');
const KEY_2 = Buffer.alloc(32, 2).toString('base64');
const AAD = credentialsAad('salon-1', 'gbp');

function useKeys(value: string) {
  vi.stubEnv('CREDENTIALS_ENC_KEYS', value);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('encryptSecret / decryptSecret', () => {
  it('往復して同じ平文に戻る', () => {
    useKeys(`k1:${KEY_1}`);
    const payload = encryptSecret('refresh-token-value', AAD);
    expect(decryptSecret(payload, AAD)).toBe('refresh-token-value');
  });

  it('暗号文に平文が現れない', () => {
    useKeys(`k1:${KEY_1}`);
    expect(encryptSecret('super-secret', AAD)).not.toContain('super-secret');
  });

  it('形式は v1.<kid>.<iv>.<ct>.<tag>', () => {
    useKeys(`k1:${KEY_1}`);
    const parts = encryptSecret('x', AAD).split('.');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('v1');
    expect(parts[1]).toBe('k1');
  });

  it('同じ平文でも毎回異なる暗号文 (IVがランダム)', () => {
    useKeys(`k1:${KEY_1}`);
    expect(encryptSecret('same', AAD)).not.toBe(encryptSecret('same', AAD));
  });
});

describe('改竄・誤用の検出', () => {
  it('AADが違うと復号できない (別サロンへのコピー再利用を防ぐ)', () => {
    useKeys(`k1:${KEY_1}`);
    const payload = encryptSecret('token', credentialsAad('salon-1', 'gbp'));
    expect(() => decryptSecret(payload, credentialsAad('salon-2', 'gbp'))).toThrow(
      SecretDecryptError,
    );
  });

  it('暗号文を改竄すると復号できない', () => {
    useKeys(`k1:${KEY_1}`);
    const parts = encryptSecret('token', AAD).split('.');
    parts[3] = Buffer.from('tampered-ciphertext').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), AAD)).toThrow(SecretDecryptError);
  });

  it('未知の鍵IDは明示的に失敗する', () => {
    useKeys(`k1:${KEY_1}`);
    const payload = encryptSecret('token', AAD);
    useKeys(`k9:${KEY_2}`);
    expect(() => decryptSecret(payload, AAD)).toThrow(/未知の鍵ID/);
  });

  it('形式不正なペイロードを弾く', () => {
    useKeys(`k1:${KEY_1}`);
    expect(() => decryptSecret('not-a-payload', AAD)).toThrow(SecretDecryptError);
  });

  it('未対応バージョンを弾く', () => {
    useKeys(`k1:${KEY_1}`);
    const parts = encryptSecret('token', AAD).split('.');
    parts[0] = 'v2';
    expect(() => decryptSecret(parts.join('.'), AAD)).toThrow(/未対応の暗号バージョン/);
  });
});

describe('鍵ローテーション', () => {
  it('新鍵で書きつつ旧鍵の暗号文も読める', () => {
    useKeys(`k1:${KEY_1}`);
    const oldPayload = encryptSecret('old-token', AAD);

    // k2 を先頭に追加 (k1 は復号用に残す)
    useKeys(`k2:${KEY_2},k1:${KEY_1}`);
    const newPayload = encryptSecret('new-token', AAD);

    expect(newPayload.split('.')[1]).toBe('k2');
    expect(decryptSecret(newPayload, AAD)).toBe('new-token');
    // 旧鍵の暗号文も引き続き読める = 無停止で移行できる
    expect(decryptSecret(oldPayload, AAD)).toBe('old-token');
  });

  it('isEncryptedWithActiveKey で再暗号化対象を判別できる', () => {
    useKeys(`k1:${KEY_1}`);
    const oldPayload = encryptSecret('token', AAD);

    useKeys(`k2:${KEY_2},k1:${KEY_1}`);
    expect(isEncryptedWithActiveKey(oldPayload)).toBe(false);
    expect(isEncryptedWithActiveKey(encryptSecret('token', AAD))).toBe(true);
  });
});

describe('鍵設定の検証', () => {
  it('未設定なら SecretConfigError', () => {
    vi.stubEnv('CREDENTIALS_ENC_KEYS', '');
    expect(() => encryptSecret('x', AAD)).toThrow(SecretConfigError);
  });

  it('32バイト未満の鍵を弾く', () => {
    useKeys(`k1:${Buffer.alloc(16, 1).toString('base64')}`);
    expect(() => encryptSecret('x', AAD)).toThrow(/32バイト/);
  });

  it('鍵IDの重複を弾く', () => {
    useKeys(`k1:${KEY_1},k1:${KEY_2}`);
    expect(() => encryptSecret('x', AAD)).toThrow(/重複/);
  });

  it("鍵IDに '.' を許さない (ペイロード区切りと衝突するため)", () => {
    useKeys(`k.1:${KEY_1}`);
    expect(() => encryptSecret('x', AAD)).toThrow(/'\.' は使えません/);
  });

  it('形式不正 (コロンなし) を弾く', () => {
    useKeys(KEY_1);
    expect(() => encryptSecret('x', AAD)).toThrow(/形式が不正/);
  });
});
