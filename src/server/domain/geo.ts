export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_M = 6371000;

/** 2点間の距離 (メートル、haversine) */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
}

/** 中心と半径から円ポリゴン (GeoJSON座標列 [lng, lat]) を生成。地図の商圏円表示用 */
export function circlePolygon(center: LatLng, radiusM: number, points = 64): [number, number][] {
  const coords: [number, number][] = [];
  const latRad = (center.latitude * Math.PI) / 180;
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dLat = ((radiusM * Math.cos(angle)) / EARTH_RADIUS_M) * (180 / Math.PI);
    const dLng =
      ((radiusM * Math.sin(angle)) / (EARTH_RADIUS_M * Math.cos(latRad))) * (180 / Math.PI);
    coords.push([center.longitude + dLng, center.latitude + dLat]);
  }
  return coords;
}
