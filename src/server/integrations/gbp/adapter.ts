import 'server-only';
import type { DataSourceAdapter, NormalizedCollection } from '../types';
import { normalizeOwnSalonSnapshot } from '../own-salon/normalize';
import type { OwnSalonInput, OwnSalonSnapshot } from '../own-salon/types';
import { listReviews, type GbpCallStats } from './client';
import { normalizeGbpReviews } from './normalize';
import { GbpAuthRevokedError, refreshAccessToken } from './oauth';
import { markGbpRevoked, saveGbpCredentials, touchGbpSyncedAt } from './token-store';
import type { GbpCredentials, GbpReviewsResponse } from './types';
import fixtureReviews from './fixtures/reviews.page0.json';

/** 期限のこの秒数前になったら先回りして更新する */
const REFRESH_MARGIN_MS = 120_000;

/**
 * GBPのAPI割当承認を待たずに連携経路全体を動かすためのフィクスチャモード。
 * 同じ normalize 経路・同じ sourceName を通るので、設定UI・未返信検出・
 * ダッシュボード表示・劣化時の挙動まで承認前に検証できる。
 */
export function isGbpFixtureMode(): boolean {
  return process.env.GBP_FIXTURE_MODE === '1';
}

export class RealOwnSalonAdapter
  implements DataSourceAdapter<OwnSalonInput, OwnSalonSnapshot>
{
  readonly sourceName = 'gbp' as const;
  readonly mode = 'real' as const;

  private stats: GbpCallStats = { billableCalls: 0 };

  constructor(
    private readonly salonId: string,
    private readonly credentials: GbpCredentials,
  ) {}

  async collect(_input: OwnSalonInput): Promise<OwnSalonSnapshot> {
    void _input;
    this.stats = { billableCalls: 0 };

    if (isGbpFixtureMode()) {
      // フィクスチャでも同期時刻は記録する (設定画面の「最終同期」が空のままだと
      // 連携が動いているのか判断できない)
      await touchGbpSyncedAt(this.salonId);
      return normalizeGbpReviews(fixtureReviews as GbpReviewsResponse);
    }

    const accessToken = await this.ensureFreshAccessToken();
    const raw = await listReviews(
      accessToken,
      this.credentials.accountName as string,
      this.credentials.locationId as string,
      this.stats,
    );
    await touchGbpSyncedAt(this.salonId);
    return normalizeGbpReviews(raw);
  }

  normalize(raw: OwnSalonSnapshot): NormalizedCollection {
    const collection = normalizeOwnSalonSnapshot(raw, 'gbp');
    collection.costMetadata = {
      ...collection.costMetadata,
      billableCalls: this.stats.billableCalls,
    };
    return collection;
  }

  /** 期限が近ければ先回りで更新し、保存する */
  private async ensureFreshAccessToken(): Promise<string> {
    const expiresAt = Date.parse(this.credentials.accessTokenExpiresAt);
    if (Number.isFinite(expiresAt) && expiresAt - Date.now() > REFRESH_MARGIN_MS) {
      return this.credentials.accessToken;
    }

    try {
      const refreshed = await refreshAccessToken(this.credentials.refreshToken);
      const updated: GbpCredentials = {
        ...this.credentials,
        accessToken: refreshed.access_token,
        accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        // リフレッシュ応答に refresh_token は通常含まれないため、既存を維持する
        refreshToken: refreshed.refresh_token ?? this.credentials.refreshToken,
      };
      await saveGbpCredentials(this.salonId, updated);
      this.stats.billableCalls += 1;
      return updated.accessToken;
    } catch (error) {
      if (error instanceof GbpAuthRevokedError) {
        // status を error にして、設定画面に再連携バナーを出す
        await markGbpRevoked(this.salonId);
      }
      throw error;
    }
  }
}
