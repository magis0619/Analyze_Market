# 実API接続の手順

モックのまま全機能が動くので、この作業は「本物のデータで動かしたくなったとき」に行います。
コード変更は不要で、`.env` にキーを入れるだけでアダプタが切り替わります。

**先に読むべき一文**: GBP (Googleビジネスプロフィール) だけは Google の審査があり、
**申請から利用開始まで数日〜数週間**かかります。GBPを使う予定があるなら、
他の作業より先に §3-1 の申請フォームだけ出しておいてください。

---

## 0. 全体像

| 連携 | 用意するもの | 所要時間 | 未設定時の挙動 |
|---|---|---|---|
| Google Places (競合データ) | APIキー1つ | 30分 | 決定論的なデモデータ |
| Anthropic (AIコーチ) | APIキー1つ + 前払いクレジット | 15分 | ルールベース生成 |
| GBP (自店舗の実データ) | OAuthクライアント + **API利用申請の承認** | 数日〜数週間 | デモ or 手入力 |

---

## 1. Google Places API (New)

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. **課金アカウントをリンク** (Places API は課金必須。無料枠のみでも登録は要る)
3. 「APIとサービス」→ ライブラリ → **「Places API (New)」を有効化**
   - ⚠️ 旧「Places API」とは**別物**です。新しい方を選んでください
4. 「認証情報」→ APIキーを作成
5. **キーを制限する** (重要)
   - 「APIの制限」→ 「Places API (New)」だけを許可
   - サーバーから呼ぶためHTTPリファラー制限は使えません。固定IPがあればIP制限、
     開発中は制限なしで運用しキーを外に出さない運用にします
6. **「割り当て」で1日の上限を設定し、予算アラートも作成** ← 暴走課金の唯一の歯止め
7. `.env` に設定

```bash
GOOGLE_MAPS_API_KEY=AIza...
```

**課金SKUについて**: このアプリが要求するフィールド (FieldMask) は
Nearby Search **Pro** SKU の範囲に収まるよう固定してあります
(`src/server/integrations/google-places/real.ts` の `FIELD_MASK`)。
営業時間などを足すと Enterprise SKU に上がり単価が数倍になるため、
追加するときは料金表を確認してください。テストで退行を防いでいます。

---

## 2. Anthropic API

1. [console.anthropic.com](https://console.anthropic.com/) でアカウント作成
2. Billing でクレジットを購入 (前払い制)
3. API Keys → キーを発行
4. `.env` に設定

```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-5      # 既定値。変更不要
ANTHROPIC_COACH_EFFORT=medium      # コストと品質の主要な調整弁
```

`ANTHROPIC_COACH_EFFORT` が最も効く調整弁です。入力はサーバ側で要約済みの
小さなJSON (イベント20件・KPI16点) なので `medium` で十分機能します。
提案の質が物足りなければ `high` に上げてください。

---

## 3. Googleビジネスプロフィール (GBP) 連携

自店舗の**実際の**評価・口コミ・返信状況を取得します。承認ゲートが2つあります。

### 3-1. API利用申請 (最初にやる / 数日〜数週間)

[Business Profile API のアクセス申請フォーム](https://developers.google.com/my-business/content/prereqs)
を提出します。**これが通るまで割り当ては 0 QPM で、全ての呼び出しが失敗します。**
前提として、対象のビジネスプロフィールが**認証済み**かつ**作成から60日以上**経過している必要があります。

### 3-2. APIの有効化

同じGCPプロジェクトで以下を有効化します。

- My Business Account Management API
- My Business Business Information API
- **Google My Business API (v4)** ← 口コミと返信状態はこの**レガシーAPIだけ**が返します
- (任意) Business Profile Performance API

### 3-3. OAuth同意画面

- スコープ: `https://www.googleapis.com/auth/business.manage`
- ⚠️ **公開ステータスが `テスト中` の間、リフレッシュトークンは7日で失効します。**
  週に一度「再連携」が必要になりますが、設定画面に赤いバナーとワンクリックの
  再連携ボタンが出るので、原因不明の不具合にはなりません。
  本番公開には機微スコープの審査 (約10日 + デモ動画) が必要です

### 3-4. OAuthクライアントID

「認証情報」→ OAuth 2.0 クライアントID → **ウェブアプリケーション**

**承認済みのリダイレクトURI** に以下を**完全一致**で登録します。

```
http://localhost:3000/api/integrations/gbp/callback     # ローカル開発
https://<本番ドメイン>/api/integrations/gbp/callback    # 本番
```

### 3-5. `.env`

```bash
GOOGLE_OAUTH_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
APP_URL=http://localhost:3000
# トークンの保存時暗号化キー (必須)
CREDENTIALS_ENC_KEYS=k1:$(openssl rand -base64 32)
```

`CREDENTIALS_ENC_KEYS` は先頭が現行鍵で、以降は復号専用の旧鍵です。
ローテーションは `k2:<新>,k1:<旧>` に書き換えて再暗号化スクリプトを流すだけで、
DBマイグレーションもダウンタイムも不要です。

### 3-6. 接続する

設定 → Googleビジネスプロフィール連携 → 「連携する」 → Googleで認可 →
戻ってきたら店舗を選択。以降の収集で自店舗データがGBP由来になります。

### 3-7. 承認を待つ間に動かす

```bash
GBP_FIXTURE_MODE=1
```

記録済みのv4応答フィクスチャで連携経路を動かせます。**同じ正規化経路・同じ
`source='gbp'`** を通るので、設定UI・店舗選択・未返信口コミ検出・ダッシュボード
表示・トークン失効時の劣化挙動まで、承認前に一通り確認できます。

---

## 4. コストの安全弁

上限はサーバ側で強制され、既定値はキー投入初日でも驚かない保守的な値です。
現在の使用量は **設定 → API利用状況** で確認できます。

```bash
PLACES_DAILY_CALL_LIMIT=20          # 日次 (JSTの0時にリセット)
PLACES_MONTHLY_CALL_LIMIT=200
AI_DAILY_CALL_LIMIT=10
AI_DAILY_TOKEN_LIMIT=500000
COLLECTION_MIN_INTERVAL_MINUTES=60  # 「今すぐ収集」の連打を防ぐ
```

挙動:

- **データ種別ごとに独立**して止まります。競合データが上限でも自店舗データは動きます
- 上限に達した種別は収集を**スキップ**し、前回値を表示します
  (取得できなかったことを「閉店」と誤検知しないよう、差分エンジン側でも守っています)
- AIが上限に達した場合はレポートを空にせず、**ルールベース生成に切り替えて明示**します
- 最小実行間隔は、課金される連携が1つも有効でないとき (全てデモ) は適用されません

---

## 5. 切替後の確認

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

画面で確認すること:

1. ダッシュボード → データ鮮度の競合データが「デモ」から **「Google Places API」** に変わる
2. 「今すぐ収集」→ 設定 → 収集履歴 に成功行が並ぶ
3. レポート詳細の生成方式が `anthropic:claude-opus-5` になる
4. `ANTHROPIC_API_KEY` をわざと無効な値にして収集 → ダッシュボードに
   **赤い「AI生成に失敗」バナー**が出て、収集履歴に `AIコーチ生成` の失敗行が残る
   (キーがあるのに黙ってルールベースに落ちる、という状態を作らないための確認)
5. `PLACES_DAILY_CALL_LIMIT=0` にして収集 → 琥珀色のバナーが出て競合データがスキップされ、
   **偽の「消失」イベントが1件も出ない**

---

## トラブルシューティング

| 症状 | 原因 |
|---|---|
| GBPで404が返る | ID形式の不一致が最有力です。v1は `locations/456` を返し、v4は `accounts/123/locations/456` を要求します。権限エラーに見えますが割り当て承認の問題ではありません (`src/server/integrations/gbp/ids.ts` に隔離済み) |
| GBPの全呼び出しが失敗する | §3-1 の利用申請がまだ承認されていない (割り当てが 0 QPM) |
| 週に一度GBPが切れる | OAuth同意画面が `テスト中` のため。リフレッシュトークンが7日で失効します |
| 収集のたびに競合の出入りが大量に出る | 商圏内の美容院が取得上限(20件)を超えています。ダッシュボードにその旨の注記が出ます。商圏半径を小さくしてください |
| `今すぐ収集` が押せない | 最小実行間隔か日次上限です。ボタンの左に理由が出ます |
