# Admin Page 設計ドキュメント

## 概要

Wedding Smile Catcher の管理画面。イベント終了後やテスト時に、Firestoreに保存されたデータを選択して削除するためのシンプルなWebインターフェースを提供する。

## 目的

- **データクリーンアップ**: テストデータや不適切な投稿画像の削除
- **イベント管理**: 過去のイベントデータの整理
- **トラブルシューティング**: 問題のあるデータの手動削除

## 要件

### 機能要件

1. **削除対象データ**
   - 画像データ（`images` collection）
   - ユーザーデータ（`users` collection）
   - イベントデータ（`events` collection）

2. **認証**
   - シンプルなパスワード認証
   - パスワードは環境変数で管理（ハードコードしない）
   - セッション管理（localStorage利用）

3. **UI機能**
   - データ一覧表示（各コレクション別）
   - チェックボックスによる複数選択
   - 統計情報の表示（件数など）
   - 削除前の確認ダイアログ

4. **削除仕様**
   - Firestoreドキュメントのみ削除（Cloud Storageのファイルは残す）
   - バッチ削除対応（最大500件/バッチ）
   - 削除後のUI自動更新

### 非機能要件

- **デザイン**: シンプルで機能的なUI（装飾最小限）
- **レスポンシブ**: モバイルでも操作可能
- **パフォーマンス**: 大量データでも動作（ページネーション不要、制限500件）
- **セキュリティ**:
  - パスワード認証必須
  - Firestore Security Rulesで二重保護
  - 誤操作防止の確認ダイアログ

## UI設計

### 画面構成

```text
┌─────────────────────────────────────┐
│ Login Screen                        │
│  [Password Input]                   │
│  [Login Button]                     │
└─────────────────────────────────────┘

↓ ログイン後

┌─────────────────────────────────────┐
│ Admin Dashboard        [Logout]     │
├─────────────────────────────────────┤
│ Stats:                              │
│  [Total Images: 123]                │
│  [Total Users: 45]                  │
│  [Total Events: 2]                  │
├─────────────────────────────────────┤
│ [Images] [Users] [Events] ← Tabs   │
├─────────────────────────────────────┤
│ Images Management                   │
│  [Select All] [Delete Selected (3)] │
├─────────────────────────────────────┤
│ ☑ Image 1 - User: 太郎 - Score: 150│
│ ☑ Image 2 - User: 花子 - Score: 200│
│ ☐ Image 3 - User: 次郎 - Score: 180│
│ ...                                 │
└─────────────────────────────────────┘
```text

### タブ構造

1. **Images タブ**
   - 画像ID、ユーザー名、スコア、ステータス、アップロード日時を表示
   - サムネイル表示（オプション、後で追加可能）

2. **Users タブ**
   - ユーザーID、名前、総アップロード数、ベストスコアを表示

3. **Events タブ**
   - イベントID、イベント名、ステータス、作成日時を表示

### 操作フロー

```text
1. /admin にアクセス
   ↓
2. パスワード入力 → 認証
   ↓
3. ダッシュボード表示（統計情報自動取得）
   ↓
4. タブを選択（Images/Users/Events）
   ↓
5. データ一覧をFirestoreから取得
   ↓
6. チェックボックスで削除対象を選択
   ↓
7. "Delete Selected" ボタンをクリック
   ↓
8. 確認モーダル表示
   ↓
9. 確認後、Firestore削除実行
   ↓
10. UI自動更新（削除されたアイテムを非表示）
```text

## 技術仕様

### ファイル構成

```text
src/frontend/
├── admin.html          # 管理画面HTML
├── css/
│   └── admin.css       # 管理画面スタイル
├── js/
│   ├── admin.js        # 管理画面ロジック
│   └── config.js       # Firebase設定（既存、共有）
└── firebase.json       # ルーティング設定追加
```text

### フロントエンド技術スタック

- **Vanilla JavaScript** (ES6 modules)
- **Firebase SDK**: Firestore削除操作
- **CSS**: シンプルなグリッドレイアウト

### パスワード認証の実装

#### フロントエンド（admin.js）

```javascript
const ADMIN_PASSWORD_HASH = 'SHA-256 hash of password';

async function login(password) {
  const hash = await sha256(password);
  if (hash === ADMIN_PASSWORD_HASH) {
    sessionStorage.setItem('adminAuth', 'true');
    return true;
  }
  return false;
}

function checkAuth() {
  return sessionStorage.getItem('adminAuth') === 'true';
}
```text

**注意**: パスワードのハッシュ値はコード内にハードコードするが、実際のパスワードは別途管理。本番環境では環境変数やFirebase Remote Configに移行推奨。

#### 初期パスワード設定方法

```bash
# パスワードのSHA-256ハッシュ生成
echo -n "your-secure-password" | shasum -a 256
# → admin.jsのADMIN_PASSWORD_HASHに設定
```text

### Firestore削除ロジック

#### 単一削除

```javascript
async function deleteDocument(collectionName, docId) {
  await db.collection(collectionName).doc(docId).delete();
}
```text

#### バッチ削除

```javascript
async function batchDelete(collectionName, docIds) {
  const batches = [];
  const chunkSize = 500; // Firestore batch limit

  for (let i = 0; i < docIds.length; i += chunkSize) {
    const batch = db.batch();
    const chunk = docIds.slice(i, i + chunkSize);

    chunk.forEach(docId => {
      const docRef = db.collection(collectionName).doc(docId);
      batch.delete(docRef);
    });

    batches.push(batch.commit());
  }

  await Promise.all(batches);
}
```text

### Firebase Hosting ルーティング設定

`src/frontend/firebase.json` に以下を追加:

```json
{
  "hosting": {
    "public": ".",
    "rewrites": [
      {
        "source": "/admin",
        "destination": "/admin.html"
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```text

**注意**: `/admin` のルールを `/` より先に配置することで、管理画面へのルーティングが優先される。

## データ取得仕様

### Images Collection

```javascript
const imagesQuery = db.collection('images')
  .orderBy('upload_timestamp', 'desc')
  .limit(500);

const snapshot = await imagesQuery.get();
```text

**表示項目**:

- `id`: ドキュメントID
- `user_id`: ユーザーID
- `total_score`: 総合スコア
- `status`: ステータス（pending/completed/error）
- `upload_timestamp`: アップロード日時

### Users Collection

```javascript
const usersQuery = db.collection('users')
  .orderBy('best_score', 'desc')
  .limit(500);
```text

**表示項目**:

- `id`: ドキュメントID（LINE user ID）
- `name`: ユーザー名
- `total_uploads`: 総アップロード数
- `best_score`: ベストスコア

### Events Collection

```javascript
const eventsQuery = db.collection('events')
  .orderBy('created_at', 'desc')
  .limit(500);
```text

**表示項目**:

- `id`: ドキュメントID
- `event_name`: イベント名
- `status`: ステータス（active/completed/archived）
- `created_at`: 作成日時

## セキュリティ考慮事項

### 1. フロントエンド認証

- パスワードのSHA-256ハッシュで検証
- セッション管理（ページリロード時も認証状態維持）
- ログアウト機能

### 2. Firestore Security Rules

現在のルールでは、認証されたユーザーのみがデータを削除可能。Admin Pageからの削除もこのルールに従う。

```javascript
// 現在のルール（変更不要）
match /images/{imageId} {
  allow delete: if request.auth != null;
}
```text

**推奨**: 本番環境では、特定のadminユーザーのみが削除可能なルールに変更。

```javascript
match /images/{imageId} {
  allow delete: if request.auth != null &&
    request.auth.token.admin == true;
}
```text

### 3. 削除確認ダイアログ

誤操作防止のため、削除実行前に必ず確認モーダルを表示:

```text
┌─────────────────────────────────┐
│ Confirm Deletion                │
├─────────────────────────────────┤
│ Are you sure you want to delete │
│ 5 images?                       │
│                                 │
│ This action cannot be undone.   │
├─────────────────────────────────┤
│  [Delete]      [Cancel]         │
└─────────────────────────────────┘
```text

### 4. パスワード管理

**開発環境**:

- コード内にハッシュ値をハードコード（初期実装）

**本番環境（推奨）**:

- Firebase Remote Configでハッシュ値を管理
- または、Firebase Authenticationでadminロールを設定

## デプロイ手順

### 1. ローカルテスト

```bash
cd src/frontend
python3 -m http.server 8000
# http://localhost:8000/admin にアクセス
```text

### 2. Firebase Hostingにデプロイ

```bash
cd src/frontend
firebase deploy --only hosting
```text

### 3. アクセス

本番URL: `https://wedding-smile-catcher.web.app/admin`

## 制限事項

### 現在の制限

1. **Cloud Storage削除なし**: 画像ファイルは削除されず、Firestoreのメタデータのみ削除
2. **最大500件表示**: パフォーマンス考慮で各コレクション500件まで表示
3. **リアルタイム更新なし**: データ変更時に手動リロードが必要

### 将来的な拡張案

1. **Cloud Storage連動削除**: 画像削除時にGCSファイルも自動削除
2. **ページネーション**: 大量データ対応
3. **検索機能**: ユーザー名やスコアでフィルタリング
4. **Firebase Authentication**: より堅牢な認証システム
5. **監査ログ**: 削除操作の履歴記録

## 実装タスク

- [ ] 設計ドキュメント作成（このファイル）
- [ ] `admin.html` 作成
- [ ] `css/admin.css` 作成
- [ ] `js/admin.js` 作成（認証、データ取得、削除ロジック）
- [ ] `firebase.json` ルーティング設定更新
- [ ] ローカルテスト
- [ ] Firebase Hostingデプロイ
- [ ] 本番環境での動作確認

## 参考資料

- [Firestore Batch Writes](https://firebase.google.com/docs/firestore/manage-data/transactions#batched-writes)
- [Firebase Hosting Rewrites](https://firebase.google.com/docs/hosting/full-config#rewrites)
- [Web Crypto API (SHA-256)](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest)
