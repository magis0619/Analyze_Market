import 'server-only';
import type { OwnSalonAdapterSelection } from './index';

/**
 * GBP連携による自店舗データ取得。
 *
 * 現時点では接続状態の判定のみを行い、実際のGBP API呼び出しは
 * gbp/ 配下のクライアント実装で差し込む。
 * 未接続・トークン失効時はアダプタを返さず、パイプラインは前回値のまま継続する
 * (仕様05 障害設計: 取得失敗で画面全体を落とさない)。
 */
export async function createGbpOwnSalonAdapter(
  salonId: string,
): Promise<OwnSalonAdapterSelection> {
  const { loadGbpCredentials } = await import('@/server/integrations/gbp/token-store');
  const { RealOwnSalonAdapter } = await import('@/server/integrations/gbp/adapter');

  const credentials = await loadGbpCredentials(salonId);
  if (!credentials) {
    return {
      adapter: null,
      note: '自店舗データ: GBP連携が切れています。設定から再連携してください。',
    };
  }
  if (!credentials.accountName || !credentials.locationId) {
    return {
      adapter: null,
      note: '自店舗データ: GBPの対象店舗が未選択です。設定から店舗を選択してください。',
    };
  }

  return {
    adapter: new RealOwnSalonAdapter(salonId, credentials),
    note: '自店舗データはGoogleビジネスプロフィールから取得しています。',
  };
}
