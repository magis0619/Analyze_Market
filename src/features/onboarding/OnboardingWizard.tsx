'use client';

import { useState, useTransition } from 'react';
import { createSalonAction, type CreateSalonInput } from '@/server/domain/salons/actions';

const STEPS = ['店舗情報', '商圏半径', '店舗プロフィール', '自店舗データ', '確認'] as const;

const SALON_TYPES = ['女性向け', 'メンズ', 'ファミリー', 'カラー特化', 'トータルビューティー'];

const DEMO_PREFILL = {
  name: 'ヘアサロン ルミエール',
  address: '東京都世田谷区太子堂2-99-9 (架空の住所)',
  latitude: '35.6467',
  longitude: '139.6533',
  salonType: '女性向け',
  targetCustomer: '30〜40代女性',
  priceBand: 'カット6,000円前後',
  strengths: 'カラーの発色と持ちの良さ、丁寧なカウンセリング',
};

interface ManualReviewForm {
  star: string;
  comment: string;
}

const inputClass =
  'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none';
const labelClass = 'mb-1 block text-sm font-medium';

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState<500 | 1000>(500);
  const [salonType, setSalonType] = useState(SALON_TYPES[0] ?? '女性向け');
  const [targetCustomer, setTargetCustomer] = useState('');
  const [priceBand, setPriceBand] = useState('');
  const [strengths, setStrengths] = useState('');
  const [dataMode, setDataMode] = useState<'demo' | 'manual'>('demo');
  const [manualRating, setManualRating] = useState('4.0');
  const [manualReviewCount, setManualReviewCount] = useState('0');
  const [manualReviews, setManualReviews] = useState<ManualReviewForm[]>([]);

  const applyDemoPrefill = () => {
    setName(DEMO_PREFILL.name);
    setAddress(DEMO_PREFILL.address);
    setLatitude(DEMO_PREFILL.latitude);
    setLongitude(DEMO_PREFILL.longitude);
    setSalonType(DEMO_PREFILL.salonType);
    setTargetCustomer(DEMO_PREFILL.targetCustomer);
    setPriceBand(DEMO_PREFILL.priceBand);
    setStrengths(DEMO_PREFILL.strengths);
    setDataMode('demo');
    setError(null);
  };

  const validateStep = (): string | null => {
    if (step === 0) {
      if (!name.trim()) return '店舗名を入力してください';
      if (!address.trim()) return '住所を入力してください';
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) return '緯度を正しく入力してください';
      if (!Number.isFinite(lng) || lng < -180 || lng > 180)
        return '経度を正しく入力してください';
    }
    if (step === 3 && dataMode === 'manual') {
      const rating = Number(manualRating);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5)
        return '現在の評価は1〜5で入力してください';
      const count = Number(manualReviewCount);
      if (!Number.isInteger(count) || count < 0) return '口コミ数を正しく入力してください';
      for (const review of manualReviews) {
        const star = Number(review.star);
        if (!Number.isInteger(star) || star < 1 || star > 5)
          return '口コミの評価は1〜5で入力してください';
        if (!review.comment.trim()) return '口コミ本文を入力してください';
      }
    }
    return null;
  };

  const next = () => {
    const validation = validateStep();
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const back = () => {
    setError(null);
    setStep((current) => Math.max(current - 1, 0));
  };

  const submit = () => {
    const input: CreateSalonInput = {
      name: name.trim(),
      address: address.trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
      tradeAreaRadiusM: radius,
      salonType,
      targetCustomer: targetCustomer.trim(),
      priceBand: priceBand.trim(),
      strengths: strengths.trim(),
      dataMode,
      manualKpi:
        dataMode === 'manual'
          ? {
              rating: Number(manualRating),
              reviewCount: Number(manualReviewCount),
              reviews: manualReviews.map((review) => ({
                star: Number(review.star),
                comment: review.comment.trim(),
              })),
            }
          : null,
    };
    startTransition(async () => {
      const result = await createSalonAction(input);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div>
      <ol className="mb-6 flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 ${
              index === step
                ? 'bg-slate-900 text-white'
                : index < step
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-slate-100 text-slate-400'
            }`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {error ? (
        <p role="alert" className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {step === 0 ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={applyDemoPrefill}
            className="w-full rounded border border-dashed border-slate-400 bg-slate-50 px-4 py-3 text-sm text-slate-700 hover:bg-slate-100"
          >
            🎈 デモデータで試す (架空の店舗情報を自動入力)
          </button>
          <div>
            <label className={labelClass} htmlFor="name">
              店舗名
            </label>
            <input id="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="address">
              住所
            </label>
            <input
              id="address"
              className={inputClass}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="lat">
                緯度
              </label>
              <input
                id="lat"
                className={inputClass}
                inputMode="decimal"
                placeholder="35.6467"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="lng">
                経度
              </label>
              <input
                id="lng"
                className={inputClass}
                inputMode="decimal"
                placeholder="139.6533"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            緯度経度は Google マップで店舗を右クリックするとコピーできます。
          </p>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">競合を監視する商圏の半径を選択してください。</p>
          {[500, 1000].map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-3 rounded border p-4 ${
                radius === value ? 'border-slate-900 bg-slate-50' : 'border-slate-200'
              }`}
            >
              <input
                type="radio"
                name="radius"
                checked={radius === value}
                onChange={() => setRadius(value as 500 | 1000)}
              />
              <span className="text-sm font-medium">{value === 500 ? '500m (徒歩約6分)' : '1km (徒歩約12分)'}</span>
            </label>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="salonType">
              店舗タイプ
            </label>
            <select
              id="salonType"
              className={inputClass}
              value={salonType}
              onChange={(e) => setSalonType(e.target.value)}
            >
              {SALON_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="target">
              主な客層
            </label>
            <input
              id="target"
              className={inputClass}
              placeholder="例: 30〜40代女性"
              value={targetCustomer}
              onChange={(e) => setTargetCustomer(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="price">
              価格帯
            </label>
            <input
              id="price"
              className={inputClass}
              placeholder="例: カット6,000円前後"
              value={priceBand}
              onChange={(e) => setPriceBand(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="strengths">
              強み
            </label>
            <textarea
              id="strengths"
              className={inputClass}
              rows={3}
              placeholder="例: カラーの発色、丁寧なカウンセリング"
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            自店舗の評価・口コミデータの取得方法を選択してください。Google ビジネスプロフィール連携は今後対応予定です。
          </p>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded border p-4 ${
              dataMode === 'demo' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'
            }`}
          >
            <input type="radio" name="dataMode" checked={dataMode === 'demo'} onChange={() => setDataMode('demo')} />
            <span>
              <span className="block text-sm font-medium">デモデータを使う</span>
              <span className="block text-xs text-slate-500">
                架空の評価・口コミで機能を試せます。収集のたびに変化が発生します。
              </span>
            </span>
          </label>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded border p-4 ${
              dataMode === 'manual' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'
            }`}
          >
            <input
              type="radio"
              name="dataMode"
              checked={dataMode === 'manual'}
              onChange={() => setDataMode('manual')}
            />
            <span>
              <span className="block text-sm font-medium">手入力する</span>
              <span className="block text-xs text-slate-500">
                現在の評価・口コミ数を自分で入力します。
              </span>
            </span>
          </label>

          {dataMode === 'manual' ? (
            <div className="space-y-3 rounded border border-slate-200 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="mrating">
                    現在の評価 (1〜5)
                  </label>
                  <input
                    id="mrating"
                    className={inputClass}
                    inputMode="decimal"
                    value={manualRating}
                    onChange={(e) => setManualRating(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="mcount">
                    口コミ数
                  </label>
                  <input
                    id="mcount"
                    className={inputClass}
                    inputMode="numeric"
                    value={manualReviewCount}
                    onChange={(e) => setManualReviewCount(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-slate-500">直近の口コミ (任意、最大3件)</p>
                {manualReviews.map((review, index) => (
                  <div key={index} className="flex gap-2">
                    <select
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                      value={review.star}
                      onChange={(e) =>
                        setManualReviews((current) =>
                          current.map((r, i) => (i === index ? { ...r, star: e.target.value } : r)),
                        )
                      }
                    >
                      {[1, 2, 3, 4, 5].map((star) => (
                        <option key={star} value={String(star)}>
                          ★{star}
                        </option>
                      ))}
                    </select>
                    <input
                      className={inputClass}
                      placeholder="口コミ本文"
                      value={review.comment}
                      onChange={(e) =>
                        setManualReviews((current) =>
                          current.map((r, i) =>
                            i === index ? { ...r, comment: e.target.value } : r,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="text-sm text-slate-400 hover:text-red-600"
                      onClick={() =>
                        setManualReviews((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      削除
                    </button>
                  </div>
                ))}
                {manualReviews.length < 3 ? (
                  <button
                    type="button"
                    className="text-sm text-slate-600 underline"
                    onClick={() =>
                      setManualReviews((current) => [...current, { star: '5', comment: '' }])
                    }
                  >
                    + 口コミを追加
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">以下の内容で登録し、初回診断を開始します。</p>
          <dl className="space-y-2 rounded border border-slate-200 p-4">
            {[
              ['店舗名', name],
              ['住所', address],
              ['位置', `${latitude}, ${longitude}`],
              ['商圏半径', radius === 500 ? '500m' : '1km'],
              ['店舗タイプ', salonType],
              ['主な客層', targetCustomer || '—'],
              ['価格帯', priceBand || '—'],
              ['強み', strengths || '—'],
              ['自店舗データ', dataMode === 'demo' ? 'デモデータ' : '手入力'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="shrink-0 text-slate-500">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-slate-500">
            登録すると競合スナップショットの初回収集が実行されます (数秒かかります)。
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex justify-between">
        <button
          type="button"
          onClick={back}
          disabled={step === 0 || pending}
          className="rounded border border-slate-300 px-4 py-2 text-sm disabled:opacity-40"
        >
          戻る
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="rounded bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            次へ
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? '初回診断を生成中…' : '登録して初回診断を開始'}
          </button>
        )}
      </div>
    </div>
  );
}
