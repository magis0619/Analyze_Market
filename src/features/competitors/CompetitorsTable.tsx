'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  toggleExcludedAction,
  togglePriorityAction,
} from '@/server/domain/competitors/actions';
import type { CompetitorItem } from '@/server/queries/competitors';

type SortKey = 'distance' | 'rating' | 'reviewCount';

const SORT_LABELS: Record<SortKey, string> = {
  distance: '距離順',
  rating: '評価順',
  reviewCount: '口コミ数順',
};

function delta(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return '';
  const diff = current - previous;
  if (diff === 0) return '';
  const formatted = Number.isInteger(diff) ? String(Math.abs(diff)) : Math.abs(diff).toFixed(1);
  return diff > 0 ? ` (+${formatted})` : ` (-${formatted})`;
}

function statusLabel(status: string | null): string {
  switch (status) {
    case 'OPERATIONAL':
      return '営業中';
    case 'CLOSED_TEMPORARILY':
      return '一時休業';
    case 'CLOSED_PERMANENTLY':
      return '閉店';
    default:
      return '不明';
  }
}

export function CompetitorsTable({ competitors }: { competitors: CompetitorItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('distance');
  const [pending, startTransition] = useTransition();

  const { active, excluded } = useMemo(() => {
    const activeItems = competitors.filter((item) => !item.isExcluded);
    const excludedItems = competitors.filter((item) => item.isExcluded);
    const sorted = [...activeItems].sort((a, b) => {
      if (sortKey === 'distance') {
        return (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity);
      }
      if (sortKey === 'rating') {
        return (b.rating ?? -1) - (a.rating ?? -1);
      }
      return (b.reviewCount ?? -1) - (a.reviewCount ?? -1);
    });
    return { active: sorted, excluded: excludedItems };
  }, [competitors, sortKey]);

  const toggleExcluded = (entityId: string) =>
    startTransition(async () => {
      await toggleExcludedAction(entityId);
    });
  const togglePriority = (entityId: string) =>
    startTransition(async () => {
      await togglePriorityAction(entityId);
    });

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSortKey(key)}
            className={`rounded-full border px-3 py-1 text-xs ${
              sortKey === key
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {SORT_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="px-3 py-2 font-medium">店名</th>
              <th className="px-3 py-2 font-medium">距離</th>
              <th className="px-3 py-2 font-medium">評価</th>
              <th className="px-3 py-2 font-medium">口コミ数</th>
              <th className="px-3 py-2 font-medium">状態</th>
              <th className="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {active.map((item) => (
              <tr key={item.entityId} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <span className="font-medium">{item.name}</span>
                  {item.isNew ? (
                    <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                      新規
                    </span>
                  ) : null}
                  {item.isPriority ? (
                    <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                      重要競合
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {item.distanceM !== null ? `${item.distanceM}m` : '—'}
                </td>
                <td className="px-3 py-2">
                  {item.rating !== null ? `★${item.rating.toFixed(1)}` : '観測不足'}
                  <span className="text-xs text-slate-400">{delta(item.rating, item.ratingPrev)}</span>
                </td>
                <td className="px-3 py-2">
                  {item.reviewCount !== null ? `${item.reviewCount}件` : '観測不足'}
                  <span className="text-xs text-slate-400">
                    {delta(item.reviewCount, item.reviewCountPrev)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      item.businessStatus === 'OPERATIONAL' ? 'text-slate-600' : 'font-medium text-red-700'
                    }
                  >
                    {statusLabel(item.businessStatus)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => togglePriority(item.entityId)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {item.isPriority ? '重要解除' : '重要競合'}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => toggleExcluded(item.entityId)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      除外
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {active.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                  競合データがまだありません。「今すぐ収集」を実行してください。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {excluded.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-slate-500">
            除外済み ({excluded.length}件)
          </summary>
          <ul className="mt-2 space-y-1">
            {excluded.map((item) => (
              <li key={item.entityId} className="flex items-center gap-3 text-sm text-slate-400">
                <span>{item.name}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggleExcluded(item.entityId)}
                  className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                >
                  除外を解除
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
