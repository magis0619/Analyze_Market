'use client';

import { useEffect, useRef } from 'react';
import type { CompetitorItem } from '@/server/queries/competitors';

interface Props {
  salon: { name: string; latitude: number; longitude: number; radiusM: number };
  competitors: CompetitorItem[];
}

/** 中心と半径から円ポリゴン座標列を生成 (商圏円の表示用) */
function circleCoordinates(
  latitude: number,
  longitude: number,
  radiusM: number,
): [number, number][] {
  const coords: [number, number][] = [];
  const latRad = (latitude * Math.PI) / 180;
  for (let i = 0; i <= 64; i++) {
    const angle = (i / 64) * 2 * Math.PI;
    const dLat = ((radiusM * Math.cos(angle)) / 6371000) * (180 / Math.PI);
    const dLng = ((radiusM * Math.sin(angle)) / (6371000 * Math.cos(latRad))) * (180 / Math.PI);
    coords.push([longitude + dLng, latitude + dLat]);
  }
  return coords;
}

function markerColor(competitor: CompetitorItem): string {
  if (competitor.isExcluded) return '#94a3b8';
  if (competitor.isPriority) return '#d97706';
  if (competitor.isNew) return '#dc2626';
  return '#4f46e5';
}

/**
 * MapLibre GL による競合マップ。SSRを避けるため useEffect 内で動的 import する。
 * タイル取得に失敗しても画面は落とさない (テーブルが主要な情報面)。
 */
export function CompetitorsMap({ salon, competitors }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let map: import('maplibre-gl').Map | null = null;

    (async () => {
      try {
        const maplibre = await import('maplibre-gl');
        // @ts-expect-error CSSファイルの型定義はない
        await import('maplibre-gl/dist/maplibre-gl.css');
        if (disposed || !containerRef.current) return;

        map = new maplibre.Map({
          container: containerRef.current,
          style: {
            version: 8,
            sources: {
              osm: {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                attribution: '© OpenStreetMap contributors',
              },
            },
            layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
          },
          center: [salon.longitude, salon.latitude],
          zoom: salon.radiusM === 500 ? 14.5 : 13.5,
          attributionControl: { compact: false },
        });
        map.on('error', () => {
          // タイル取得失敗などは無視する (オフライン環境でもページを落とさない)
        });

        map.on('load', () => {
          if (!map) return;
          map.addSource('trade-area', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [circleCoordinates(salon.latitude, salon.longitude, salon.radiusM)],
              },
            },
          });
          map.addLayer({
            id: 'trade-area-fill',
            type: 'fill',
            source: 'trade-area',
            paint: { 'fill-color': '#4f46e5', 'fill-opacity': 0.06 },
          });
          map.addLayer({
            id: 'trade-area-line',
            type: 'line',
            source: 'trade-area',
            paint: { 'line-color': '#4f46e5', 'line-width': 1.5, 'line-dasharray': [2, 2] },
          });
        });

        // 自店舗マーカー
        const ownElement = document.createElement('div');
        ownElement.style.cssText =
          'width:18px;height:18px;border-radius:50%;background:#0f172a;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)';
        ownElement.title = `${salon.name} (自店舗)`;
        new maplibre.Marker({ element: ownElement })
          .setLngLat([salon.longitude, salon.latitude])
          .addTo(map);

        // 競合マーカー
        for (const competitor of competitors) {
          if (competitor.latitude === null || competitor.longitude === null) continue;
          const element = document.createElement('div');
          element.style.cssText = `width:14px;height:14px;border-radius:50%;background:${markerColor(competitor)};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);cursor:pointer`;
          element.title = `${competitor.name}${competitor.isNew ? ' (新規)' : ''}${competitor.isExcluded ? ' (除外済み)' : ''}`;
          new maplibre.Marker({ element })
            .setLngLat([competitor.longitude, competitor.latitude])
            .setPopup(
              new maplibre.Popup({ offset: 12 }).setText(
                `${competitor.name} ★${competitor.rating?.toFixed(1) ?? '—'} (${competitor.reviewCount ?? '—'}件)`,
              ),
            )
            .addTo(map);
        }
      } catch (error) {
        console.error('地図の初期化に失敗しました:', error);
      }
    })();

    return () => {
      disposed = true;
      map?.remove();
    };
  }, [salon, competitors]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div ref={containerRef} className="h-72 w-full bg-slate-100 md:h-96" />
      <div className="flex flex-wrap gap-3 border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        <span>● 自店舗</span>
        <span className="text-indigo-600">● 競合</span>
        <span className="text-red-600">● 新規</span>
        <span className="text-amber-600">● 重要競合</span>
        <span className="text-slate-400">● 除外済み</span>
      </div>
    </div>
  );
}
