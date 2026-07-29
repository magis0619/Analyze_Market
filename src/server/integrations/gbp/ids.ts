/**
 * GBP の ID 形式不一致を吸収する防火壁。
 *
 * Business Information API v1 は `locations/456` を返すが、
 * 口コミを返す My Business API v4 は `accounts/123/locations/456` を要求する。
 * ここを間違えると 404 が返り、それが権限エラーに見えるため
 * 「API割当の承認がまだ下りていないのでは」と誤診して時間を溶かす。
 *
 * そのため accountName と locationId は**常に別々に保持**し、
 * v4 のパスはこの関数でのみ組み立てる。
 */

const ACCOUNT_NAME_PATTERN = /^accounts\/[^/]+$/;
const V1_LOCATION_NAME_PATTERN = /^locations\/([^/]+)$/;

export class GbpIdFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GbpIdFormatError';
  }
}

/** v1 の "locations/456" から "456" を取り出す。v4形式の入力は弾く */
export function parseLocationName(v1Name: string): string {
  const match = V1_LOCATION_NAME_PATTERN.exec(v1Name);
  if (!match?.[1]) {
    throw new GbpIdFormatError(
      `Business Information v1 の location name 形式ではありません: ${v1Name}`,
    );
  }
  return match[1];
}

/** v4 の口コミエンドポイント用パス "accounts/123/locations/456" を組み立てる */
export function toV4LocationPath(accountName: string, locationId: string): string {
  if (!ACCOUNT_NAME_PATTERN.test(accountName)) {
    throw new GbpIdFormatError(`account name 形式ではありません: ${accountName}`);
  }
  if (!locationId || locationId.includes('/')) {
    throw new GbpIdFormatError(`location id 形式ではありません: ${locationId}`);
  }
  return `${accountName}/locations/${locationId}`;
}
