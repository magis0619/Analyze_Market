import 'server-only';

/**
 * アプリの公開URL。OAuth のリダイレクトURI生成に使う。
 *
 * **リクエストの Host ヘッダから導出してはならない** — 攻撃者が Host を
 * 差し替えることで認可コードを任意のホストへ飛ばせてしまう (host header injection)。
 * 必ず設定値から組み立てる。
 */
export function getAppUrl(): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_URL (または NEXT_PUBLIC_APP_URL) が未設定です');
  }
  return 'http://localhost:3000';
}

/**
 * GBP OAuth のコールバックURI。
 * Google Cloud の「承認済みリダイレクトURI」に**完全一致**で登録すること。
 */
export function getGbpRedirectUri(): string {
  return `${getAppUrl()}/api/integrations/gbp/callback`;
}
