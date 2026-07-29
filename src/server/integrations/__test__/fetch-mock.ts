import { vi } from 'vitest';

export interface RecordedCall {
  url: string;
  init: RequestInit;
}

export interface MockResponseSpec {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/**
 * グローバル fetch を差し替え、呼び出し内容を記録する。
 * responses は順に消費され、尽きたら最後のものを繰り返す。
 * 各テストの afterEach で vi.unstubAllGlobals() を呼ぶこと。
 */
export function installFetchMock(responses: MockResponseSpec[]) {
  const calls: RecordedCall[] = [];
  let index = 0;

  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const spec = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    return new Response(JSON.stringify(spec.body), {
      status: spec.status,
      headers: { 'content-type': 'application/json', ...spec.headers },
    });
  });

  vi.stubGlobal('fetch', fn);
  return { calls, fn };
}

/** 記録された呼び出しのリクエストボディをJSONとして読む */
export function bodyOf(call: RecordedCall): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

/** 記録された呼び出しのヘッダを読む (init.headers はプレーンオブジェクト前提) */
export function headerOf(call: RecordedCall, name: string): string | undefined {
  const headers = call.init.headers as Record<string, string> | undefined;
  if (!headers) return undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}
