/**
 * エラーメッセージから資格情報らしき文字列を除去する。
 * 外部APIのエラー本文にはトークンやキーが含まれうるため、
 * DB (collection_runs.error_summary) やログへ書く前に必ず通すこと。
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/\b(ya29|1\/\/)[\w./~+-]+/g, '[redacted]')
    .replace(/\bAIza[\w-]{10,}/g, '[redacted]')
    .replace(/\bsk-ant-[\w-]{10,}/g, '[redacted]')
    .replace(/"(access_token|refresh_token|client_secret)"\s*:\s*"[^"]*"/g, '"$1":"[redacted]"');
}
