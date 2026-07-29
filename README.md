# Salon Area Coach AI

美容院向け「商圏監視＋経営コーチAI」SaaS。自店舗・競合・商圏の変化を定期収集し、根拠付きで「今週やるべき施策」を提案する経営支援 Web アプリです。

> 企画・仕様は `salon-area-coach-ai` 仕様書 (01〜09) に基づくコアMVP実装です。実装範囲外の機能は [BACKLOG.md](./BACKLOG.md) を参照してください。

## 主な機能

- **アカウント・店舗登録**: メール/パスワード認証、5ステップのオンボーディング (商圏半径 500m/1km、店舗プロフィール)
- **競合スナップショット**: Google Places (New) Nearby Search による商圏内美容院の収集。地図 (MapLibre + OpenStreetMap) と一覧、距離/評価/口コミ数ソート、除外・重要競合フラグ
- **自店舗データ**: デモ / 手入力 / **Googleビジネスプロフィール連携** (OAuth、評価・口コミ・返信状況)
- **差分検知エンジン**: 新規競合 / 閉店・消失 / 評価変化 / 口コミ急増 / 自店舗の低評価口コミ / 自店舗の評価変化 / **7日超の未返信口コミ** を重要度付きで検知
- **AI経営コーチ**: 検知した変化を根拠に「今週やること」を最大3件提案 (Anthropic API 構造化出力)。全提案に根拠イベントIDを付与し DB 側で実在検証。AI 不可時はルールベース生成にフォールバック
- **アクション管理**: 提案を 実施する/保留/却下/完了 (自己評価+メモ)。実施履歴は次回のAI生成に反映
- **手動収集**: 「今すぐ収集」ボタンでいつでもスナップショット更新 (週次cronは BACKLOG)

**APIキーが一切なくても全機能が動作します。** キー未設定時は決定論的なデモデータ (架空の商圏・競合・口コミ) に自動で切り替わり、収集のたびにシナリオが進行して差分・提案が生成されます。

## セットアップ

前提: Node.js 22+ / PostgreSQL 16

PostgreSQL のバイナリは Homebrew (Apple Silicon / Intel)、apt、yum、`PATH` の順に自動検出します。
見つからない場合は `PGBIN=$(dirname $(which initdb)) npm run dev` のように明示してください。

```bash
npm install
npm run dev        # predev で scripts/db-setup.sh が走り、DBを自動セットアップ
```

`scripts/db-setup.sh` は冪等で、以下を行います。

1. `initdb` (データディレクトリ: root なら `/var/lib/postgresql/...`、
   それ以外は `~/.local/share/salon-area-coach/pgdata16`。`PGDATA=` で上書き可)
2. PostgreSQL を `127.0.0.1:55432` で起動 (trust認証、ループバックのみ。**開発専用**)
3. `salon_area_coach` データベース作成
4. `.env` 生成 (`AUTH_SECRET` 自動発行)
5. Drizzle マイグレーション適用

root で実行された場合は `runuser -u postgres` 経由で PostgreSQL を操作します。DB停止は `bash scripts/db-setup.sh stop`。

## デモウォークスルー

1. http://localhost:3000 → 新規登録
2. オンボーディングで「**デモデータで試す**」→ そのまま進めて「登録して初回診断を開始」
3. ダッシュボードに初回診断 (競合10店の観測サマリ) が表示される
4. 「**今すぐ収集**」→ 新規競合「Lien hair design」出店、★2の未返信口コミなどを検知し、根拠付きの提案が3件生成される
5. 提案の「実施する」→ 完了 (自己評価+メモ) を記録。次回のAI生成に実施履歴が反映される
6. もう一度「今すぐ収集」→ 競合の一時休業、自店舗の評価低下を検知
7. 設定 → 自店舗データを「手入力」に切替えて ★1 口コミを登録 → 収集すると手入力データからも低評価イベントが発火

## 実APIへの切替

`.env` にキーを設定するだけでアダプタが自動で実APIに切り替わります (コード変更不要)。

**キーの取得手順は [docs/real-api-setup.md](./docs/real-api-setup.md) にまとめてあります。**
GBPだけはGoogleの審査に数日〜数週間かかるため、使う予定があれば申請だけ先に出してください。

| 環境変数 | 効果 |
|---|---|
| `GOOGLE_MAPS_API_KEY` | 競合収集が Google Places API (New) Nearby Search になる |
| `ANTHROPIC_API_KEY` | 提案生成が Anthropic API (構造化出力) になる。失敗時はルールベースへフォールバック |
| `ANTHROPIC_MODEL` / `ANTHROPIC_COACH_EFFORT` | 使用モデル (既定 `claude-opus-5`) と推論の深さ (既定 `medium`) |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` + `CREDENTIALS_ENC_KEYS` | 自店舗データをGBPから取得する (設定画面から連携) |
| `GBP_FIXTURE_MODE=1` | GBPの審査を待つ間、記録済み応答で連携経路を通しで動かす |

### コストの安全弁

上限はサーバ側で強制され、既定値は保守的です。現在値は **設定 → API利用状況** に出ます。

- データ種別 (競合 / 自店舗 / AI) ごとに独立して停止。片方が上限でも他方は動く
- 上限に達した種別はスキップして前回値を表示。**取得できなかったことを「閉店」と誤検知しない**
- AIが上限でもレポートは作る (ルールベースに切替え、その旨を明示)
- `COLLECTION_MIN_INTERVAL_MINUTES` (既定60) で「今すぐ収集」の連打を防止。
  課金される連携が1つも有効でない場合は適用しない

## アーキテクチャ

```text
src/
  app/                  # Next.js App Router (ログイン/オンボーディング/ダッシュボード/競合/レポート/設定)
  features/             # クライアントコンポーネント
  server/
    auth/               # 独自認証 (bcryptjs + jose セッションCookie)。Supabase Auth への差替えシーム
    db/                 # Drizzle ORM クライアント + スキーマ (11テーブル)
    integrations/       # 外部APIアダプタ層 (collect=wire取得 / normalize=共通Observation化)
      google-places/    #   実API + 決定論的モック (シナリオステップ式)
      own-salon/        #   自店舗データ (デモモック / 手入力 / GBP)
      gbp/              #   GBP OAuth + My Business v4 クライアント + フィクスチャ
      modes.ts          #   モード判定の一元化 (バッジとfactoryが同じ関数を見る)
      http.ts           #   共有リトライ (429/5xxのみ、Retry-After尊重)
    crypto/             # OAuthトークンの保存時暗号化 (AES-256-GCM + 鍵ローテーション)
    ai/                 # AIコーチ (zodスキーマ / 入力builder / Anthropic / ルールベースfallback)
    domain/
      collection/       # 収集パイプライン (予算判定→実行ガード→収集→差分→レポート生成)
      diff/             # 純関数の差分エンジン + severity ルール
      coaching/         # コーチ入力組み立てとレポート永続化
    queries/            # 画面用リードクエリ
```

設計原則 (仕様 CLAUDE.md / 05 準拠):

- 外部APIは必ず `src/server/integrations` のアダプタ経由。ワイヤ型とドメイン型を分離
- 観測データは取得日時・出典・元IDを保持 (`observations` / `entities`)
- AI提案には必ず根拠イベントIDが付き、存在しないIDの提案は破棄→1回だけ再生成→失敗時はルールベース
- ソース単位の障害分離。取得失敗時は前回値と「最終更新」を表示し画面を落とさない
- **取得できなかったことを変化として扱わない**。データが無い回は存在ベースの差分判定を行わない
  (これをしないとAPI障害・上限到達のたびに全競合へ「消失」イベントが立ち、それがAIの根拠になる)
- 実API経路の失敗は必ず表面化させる (収集履歴の行 + ダッシュボードの赤バナー)。
  「壊れているのに正常に見える」状態を作らない
- 数値状態は 改善/悪化/変化なし/観測不足 のテキスト表示 (色だけに依存しない)

## 開発コマンド

```bash
npm run dev         # 開発サーバー (DB自動セットアップ込み)
npm run build       # 本番ビルド
npm test            # vitest (差分エンジン/severity/モック決定論性/AI検証など)
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run db:generate # スキーマ変更時のマイグレーション生成
npm run db:migrate  # マイグレーション適用
```

## ライセンス・出典表示

- 地図データ: © OpenStreetMap contributors (ODbL)
- Google Places データを利用する場合は Google Maps Platform 利用規約 (保存・キャッシュ・Attribution) に従ってください
- AI提案は経営判断の補助であり、経営成果を保証するものではありません
