/**
 * 外部API呼び出し用の共通リトライ。
 * 一時障害 (429 / 5xx / ネットワーク) のみ再試行し、それ以外の4xxは即座に失敗させる
 * (リクエストが誤っている場合に再試行しても課金が増えるだけのため)。
 */

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export function isRetryableError(error: unknown): boolean {
  if (error instanceof HttpError) return RETRYABLE_STATUSES.has(error.status);
  // ネットワーク断・タイムアウトは再試行対象
  if (error instanceof DOMException && error.name === 'TimeoutError') return true;
  if (error instanceof TypeError) return true;
  return false;
}

/** Retry-After ヘッダ (秒 or HTTP-date) をミリ秒に変換する */
export function parseRetryAfter(headerValue: string | null, now: number = Date.now()): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(headerValue);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

export interface RetryOptions {
  retries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * fn を最大 (retries + 1) 回実行する。
 * 呼び出し回数は onAttempt で通知し、呼び出し側が課金カウントに反映できるようにする。
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions & { onAttempt?: () => void } = {},
): Promise<T> {
  const {
    retries = 2,
    baseBackoffMs = 500,
    maxBackoffMs = 4000,
    sleep = defaultSleep,
    onAttempt,
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    onAttempt?.();
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryableError(error)) throw error;
      const retryAfter = error instanceof HttpError ? error.retryAfterMs : null;
      const backoff = retryAfter ?? Math.min(baseBackoffMs * 2 ** attempt, maxBackoffMs);
      await sleep(backoff);
    }
  }
  throw lastError;
}
