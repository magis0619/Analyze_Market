'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateSalonAction } from '@/server/domain/salons/actions';

interface Props {
  salonId: string;
  initial: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    googlePlaceId: string | null;
    tradeAreaRadiusM: number;
    salonType: string;
    targetCustomer: string;
    priceBand: string;
    strengths: string;
  };
}

const inputClass =
  'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none';
const labelClass = 'mb-1 block text-sm font-medium';

export function SalonSettingsForm({ salonId, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [form, setForm] = useState({
    name: initial.name,
    address: initial.address,
    latitude: String(initial.latitude),
    longitude: String(initial.longitude),
    googlePlaceId: initial.googlePlaceId ?? '',
    tradeAreaRadiusM: initial.tradeAreaRadiusM === 1000 ? 1000 : 500,
    salonType: initial.salonType,
    targetCustomer: initial.targetCustomer,
    priceBand: initial.priceBand,
    strengths: initial.strengths,
  });

  const set = (key: keyof typeof form, value: string | number) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = () => {
    setMessage(null);
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setMessage('緯度経度を正しく入力してください');
      setIsError(true);
      return;
    }
    startTransition(async () => {
      const result = await updateSalonAction(salonId, {
        name: form.name.trim(),
        address: form.address.trim(),
        latitude,
        longitude,
        googlePlaceId: form.googlePlaceId.trim() || undefined,
        tradeAreaRadiusM: form.tradeAreaRadiusM as 500 | 1000,
        salonType: form.salonType,
        targetCustomer: form.targetCustomer.trim(),
        priceBand: form.priceBand.trim(),
        strengths: form.strengths.trim(),
      });
      setMessage(result.error ?? '保存しました');
      setIsError(result.error !== null);
      if (!result.error) router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {message ? (
        <p
          role="status"
          className={`rounded border p-3 text-sm ${
            isError
              ? 'border-red-300 bg-red-50 text-red-800'
              : 'border-emerald-300 bg-emerald-50 text-emerald-800'
          }`}
        >
          {message}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>店舗名</label>
          <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>店舗タイプ</label>
          <input
            className={inputClass}
            value={form.salonType}
            onChange={(e) => set('salonType', e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>住所</label>
        <input className={inputClass} value={form.address} onChange={(e) => set('address', e.target.value)} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className={labelClass}>緯度</label>
          <input
            className={inputClass}
            inputMode="decimal"
            value={form.latitude}
            onChange={(e) => set('latitude', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>経度</label>
          <input
            className={inputClass}
            inputMode="decimal"
            value={form.longitude}
            onChange={(e) => set('longitude', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>商圏半径</label>
          <select
            className={inputClass}
            value={form.tradeAreaRadiusM}
            onChange={(e) => set('tradeAreaRadiusM', Number(e.target.value))}
          >
            <option value={500}>500m</option>
            <option value={1000}>1km</option>
          </select>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelClass}>主な客層</label>
          <input
            className={inputClass}
            value={form.targetCustomer}
            onChange={(e) => set('targetCustomer', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>価格帯</label>
          <input
            className={inputClass}
            value={form.priceBand}
            onChange={(e) => set('priceBand', e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>強み</label>
        <textarea
          className={inputClass}
          rows={2}
          value={form.strengths}
          onChange={(e) => set('strengths', e.target.value)}
        />
      </div>
      <div>
        <label className={labelClass}>Google Place ID (任意)</label>
        <input
          className={inputClass}
          value={form.googlePlaceId}
          onChange={(e) => set('googlePlaceId', e.target.value)}
        />
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? '保存中…' : '保存'}
      </button>
    </div>
  );
}
