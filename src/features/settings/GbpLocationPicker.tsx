'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { selectGbpLocationAction } from '@/server/domain/integrations/actions';

export interface PickerLocation {
  /** "accounts/123" */
  accountName: string;
  /** "locations/456" (v1形式のまま渡す。IDの切り出しはサーバ側で行う) */
  v1LocationName: string;
  title: string;
  address: string;
}

interface Props {
  salonId: string;
  locations: PickerLocation[];
  currentLocationTitle: string | null;
}

export function GbpLocationPicker({ salonId, locations, currentLocationTitle }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(
    locations.find((l) => l.title === currentLocationTitle)?.v1LocationName ??
      locations[0]?.v1LocationName ??
      '',
  );

  const submit = () => {
    const location = locations.find((l) => l.v1LocationName === selected);
    if (!location) {
      setError('店舗を選択してください');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await selectGbpLocationAction(
        salonId,
        location.accountName,
        location.v1LocationName,
        location.title,
      );
      if (result.error) setError(result.error);
      else router.push('/settings?gbp=connected');
    });
  };

  if (locations.length === 0) {
    return (
      <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        連携したGoogleアカウントに、管理権限のある店舗が見つかりませんでした。
        Googleビジネスプロフィールで店舗が認証済みかご確認ください。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <ul className="space-y-2">
        {locations.map((location) => (
          <li key={location.v1LocationName}>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded border p-4 ${
                selected === location.v1LocationName
                  ? 'border-slate-900 bg-slate-50'
                  : 'border-slate-200'
              }`}
            >
              <input
                type="radio"
                name="gbp-location"
                className="mt-1"
                checked={selected === location.v1LocationName}
                onChange={() => setSelected(location.v1LocationName)}
              />
              <span>
                <span className="block text-sm font-medium">{location.title}</span>
                <span className="block text-xs text-slate-500">{location.address}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? '保存中…' : 'この店舗を連携する'}
      </button>
    </div>
  );
}
