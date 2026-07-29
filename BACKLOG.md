# バックログ

コアスコープ外として後回しにした機能の一覧。各項目に仕様の参照先と、現在のコードへのフック位置を記す。

## Google Business Profile OAuth連携 (仕様: 02 §2, 04, 09 Phase 4)

自店舗の口コミ・返信状況・パフォーマンス指標を GBP API から取得する。
現状は `salon_profile.dataMode` の「デモ」(モックアダプタ) と「手入力」で代替している。
フック位置: `src/server/integrations/own-salon/` に `real.ts` を追加し、`integrations` テーブルに `gbp` 行(OAuth token 暗号化保存)を持たせる。未返信口コミ検知(7日超)は返信データが取れるようになった時点で差分エンジンに検出器を追加する。

## OSM/RESAS 商圏プロフィール (仕様: 02 §4, 04, 09 Phase 6)

駅・駐車場・学校・保育施設等(Overpass)と地域統計(RESAS/e-Stat)を月次キャッシュで取得し、商圏プロフィール画面を作る。
フック位置: `src/server/integrations/` に `openstreetmap/`・`resas/` アダプタを追加(`DataSourceAdapter` 準拠)。entities の `entity_type: 'facility' | 'region'` はスキーマ上すでに許容している。

## 週次cronスケジューラ (仕様: 05 週次監視, 09 Phase 7)

現状は「今すぐ収集」ボタンとオンボーディング時の初回実行のみ。
フック位置: `src/server/domain/collection/run-collection.ts` をそのまま呼ぶ cron エンドポイント(GitHub Actions / Supabase Cron / Cloud Run Jobs)を追加する。idempotency key と週次重複ガードは同関数内の実行中ガード+期間置換で下地あり。

## メール通知 (Resend) (仕様: 02 §8, 09 Phase 7)

週次レポート要点メールと重大競合出店の即時メール。
フック位置: レポート生成後(`src/server/domain/coaching/generate-report.ts` の末尾)に通知アダプタを差し込む。

## 課金 (Stripe) (仕様: 01 §8, 09 Phase 8)

Trial/Solo/Pro/Chain プラン。`organizations.plan` カラムはスキーマに存在(既定 `trial`)。
フック位置: Stripe Checkout + webhook で `plan` を更新し、収集頻度・店舗数の上限を plan で制御する。

## PDF出力 (仕様: 07 Weekly Report)

週次レポートのPDFエクスポート。フック位置: `/reports/[id]` のデータ取得関数を再利用。

## メール認証 (仕様: 02 §1)

現状はメール+パスワードのみで確認メールなし。Resend 導入時に signup フローへ追加する。

## データ削除・退会 / 連携解除 (仕様: 05 セキュリティ)

設定画面にUIプレースホルダあり。organization 配下の全データの cascade 削除を実装する。

## Supabase 移行 / Row Level Security (仕様: 05 セキュリティ)

現在はローカル PostgreSQL + 独自認証。`src/server/auth/session.ts` が認証の単一シームなので、Supabase Auth への差し替えはここと `users` テーブルの対応付けで行う。RLS はマルチテナント公開前に必須。

## 多店舗ダッシュボード / 権限管理 (仕様: 01 将来ターゲット)

`organizations` / `organization_members`(role) はスキーマ済み。UI は1店舗前提。

## 天気アダプタ (仕様: 04 気象庁)

天候に応じた提案の材料。`DataSourceAdapter` 準拠で `weather/` を追加する。
