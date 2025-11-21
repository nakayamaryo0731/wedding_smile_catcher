# Wedding Smile Ranking - Frontend

リアルタイム笑顔ランキング表示用のフロントエンドアプリケーション。

## 技術スタック

- **HTML5** - セマンティックマークアップ
- **Modern CSS** - Glassmorphism、グラデーション、アニメーション
- **Vanilla JavaScript (ES6 Modules)** - フレームワーク不要
- **Firebase SDK** - Firestoreリアルタイムリスナー
- **Firebase Hosting** - 静的サイトホスティング
- **Canvas Confetti** - 1位の祝福エフェクト

## 機能

- **リアルタイム更新**: Firestoreから自動で最新ランキングを取得
- **ユニークユーザー表示**: 同一ユーザーは1回のみ表示（Top 3）
- **モダンデザイン**:
  - グラデーション背景
  - Glassmorphismカード
  - スムーズなアニメーション
  - レスポンシブデザイン
- **紙吹雪エフェクト**: 1位が変わった時に自動発動
- **エラーハンドリング**: 接続エラー時の適切な表示

## セットアップ

### 1. Firebase設定の取得

Firebase Consoleから Web アプリの設定を取得：

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. プロジェクト選択: `wedding-smile-catcher`
3. プロジェクト設定 > マイアプリ > Webアプリを追加（まだの場合）
4. Firebase SDK snippet > 構成 をコピー

### 2. 設定ファイルの更新

`js/config.js` を開いて、Firebase設定を貼り付け：

```javascript
window.FIREBASE_CONFIG = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "wedding-smile-catcher.firebaseapp.com",
  projectId: "wedding-smile-catcher",
  storageBucket: "wedding-smile-images-wedding-smile-catcher",
  messagingSenderId: "YOUR_ACTUAL_SENDER_ID",
  appId: "YOUR_ACTUAL_APP_ID"
};
```

### 3. ローカルテスト

シンプルなHTTPサーバーで起動：

```bash
# Pythonの場合
python3 -m http.server 8000

# Node.jsの場合
npx http-server -p 8000

# VS Code Live Server拡張機能を使用
# index.htmlを開いて "Go Live" をクリック
```

ブラウザで <http://localhost:8000> にアクセス

### 4. Firebase Hostingにデプロイ

#### 初回セットアップ

```bash
# Firebase CLIインストール（初回のみ）
npm install -g firebase-tools

# Firebaseログイン
firebase login

# プロジェクト初期化（src/frontendディレクトリで実行）
cd src/frontend
firebase init hosting

# プロンプトの回答:
# - プロジェクト: wedding-smile-catcher を選択
# - Public directory: . (カレントディレクトリ)
# - Single-page app: Yes
# - GitHub Actions: No
# - Overwrite index.html: No
```

#### デプロイ

```bash
# src/frontendディレクトリから
firebase deploy --only hosting
```

デプロイ後、以下のURLでアクセス可能：

```text
https://wedding-smile-catcher.web.app
```

## ディレクトリ構造

```text
src/frontend/
├── index.html          # メインHTML
├── css/
│   └── style.css      # モダンスタイリング
├── js/
│   ├── config.js      # Firebase設定
│   └── app.js         # メインロジック
├── firebase.json       # Firebase Hosting設定
└── README.md          # このファイル
```

## 主要コンポーネント

### `index.html`

- セマンティックHTML5構造
- Google Fonts (Playfair Display, Noto Sans JP)
- Firebase SDK (ESM)
- Canvas Confetti ライブラリ

### `css/style.css`

- CSS Grid/Flexbox レイアウト
- CSS Variables (カラーパレット)
- Glassmorphism エフェクト
- キーフレームアニメーション
- レスポンシブデザイン (モバイル対応)

### `js/app.js`

- **Firestoreリアルタイムリスナー**:
  - `images` コレクションを `total_score` 降順でクエリ
  - Top 100件取得 → ユニークユーザーフィルタ → Top 3表示
- **ランキングロジック**:
  - 同一ユーザーは1回のみ表示
  - スコア順で自動ソート
- **アニメーション制御**:
  - カード表示のスタガーアニメーション
  - 1位変更時の紙吹雪エフェクト
- **エラーハンドリング**:
  - Firebase接続エラー
  - 設定ミス検出

### `js/config.js`

- Firebase Web SDK設定
- 環境変数対応（将来的に）

## デバッグ

ブラウザの Developer Tools > Console でログを確認：

```text
Initializing Wedding Smile Ranking app...
Setting up Firestore real-time listener...
Snapshot received: 15 documents
Received 15 images, filtering to unique users...
Top 3 unique users: [...]
Rank 1 changed! Triggering confetti...
```

## トラブルシューティング

### エラー: "Firebase not configured"

→ `js/config.js` のFirebase設定を確認

### エラー: "Missing or insufficient permissions"

→ Firestore Security Rulesを確認（`/firestore.rules`）

### 画像が表示されない

→ Cloud Storageバケットの公開設定を確認

### リアルタイム更新されない

→ ブラウザコンソールでエラーを確認

## パフォーマンス

- **初回ロード**: < 2秒
- **リアルタイム更新**: < 500ms
- **Lighthouseスコア**: 95+（予想）

## セキュリティ

- Firestore Security Rulesで読み取り専用アクセス
- APIキーはフロントエンド公開（Firebaseの仕様）
- CORS設定済み

## 今後の拡張

- [ ] 管理画面（ランキングリセット、画像削除）
- [ ] カスタムテーマ設定
- [ ] QRコード表示（LINE Bot URL）
- [ ] 統計表示（総投稿数、参加者数など）

## ライセンス

個人プロジェクト（結婚式用）
