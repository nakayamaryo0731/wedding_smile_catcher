# Event ID 実装ガイド

## 概要

Wedding Smile Catcherにイベント分離機能を実装しました。これにより、複数の結婚式のデータを同一のシステム内で完全に分離して管理できます。

## 実装された変更

### 1. 環境変数の追加

**Cloud Functions (webhook & scoring)**:

```bash
CURRENT_EVENT_ID=test  # デフォルト値
```

この環境変数により、どのイベントが現在アクティブかを制御します。

### 2. データベーススキーマの変更

#### usersコレクション

新規フィールド追加:

- `event_id` (string, required): ユーザーが登録されたイベントID

#### imagesコレクション

新規フィールド追加:

- `event_id` (string, required): 画像が投稿されたイベントID

#### Cloud Storage パス構造

変更前:

```
original/{user_id}/{timestamp}_{image_id}.jpg
```

変更後:

```
{event_id}/original/{user_id}/{timestamp}_{image_id}.jpg
```

### 3. コード変更一覧

#### `src/functions/webhook/main.py`

**変更箇所1**: 環境変数の追加 (line 48)

```python
CURRENT_EVENT_ID = os.environ.get("CURRENT_EVENT_ID", "test")
```

**変更箇所2**: ユーザー登録時にevent_idを追加 (line 177)

```python
user_ref.set({
    "name": text,
    "line_user_id": user_id,
    "event_id": CURRENT_EVENT_ID,  # 追加
    "created_at": firestore.SERVER_TIMESTAMP,
    "total_uploads": 0,
    "best_score": 0,
})
```

**変更箇所3**: Cloud Storageパスにevent_idを追加 (line 340)

```python
storage_path = f"{CURRENT_EVENT_ID}/original/{user_id}/{timestamp}_{image_id}.jpg"
```

**変更箇所4**: 画像ドキュメントにevent_idを追加 (line 354)

```python
image_ref.set({
    "user_id": user_id,
    "event_id": CURRENT_EVENT_ID,  # 追加
    "storage_path": storage_path,
    "upload_timestamp": firestore.SERVER_TIMESTAMP,
    "status": "pending",
    "line_message_id": message_id,
})
```

**変更箇所5**: ランキング取得時にevent_idでフィルタ (line 249)

```python
top_images = (
    db.collection("images")
    .where("event_id", "==", CURRENT_EVENT_ID)  # 追加
    .where("status", "==", "completed")
    .order_by("total_score", direction=firestore.Query.DESCENDING)
    .limit(10)
    .get()
)
```

#### `src/functions/scoring/main.py`

**変更箇所1**: 環境変数の追加 (line 49)

```python
CURRENT_EVENT_ID = os.environ.get("CURRENT_EVENT_ID", "test")
```

**変更箇所2**: 類似画像判定でevent_idでフィルタ (line 415)

```python
images_query = (
    db.collection("images")
    .where("event_id", "==", CURRENT_EVENT_ID)  # 追加
    .where("user_id", "==", user_id)
    .where("status", "==", "completed")
    .get()
)
```

#### `src/frontend/js/config.js`

**追加**: イベントID設定 (line 13)

```javascript
// Current Event ID (change this to switch between events)
window.CURRENT_EVENT_ID = "test";
```

#### `src/frontend/js/app.js`

**変更箇所1**: where関数のインポート追加 (line 1)

```javascript
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from '...';
```

**変更箇所2**: ランキング取得時にevent_idでフィルタ (line 168)

```javascript
const q = query(
  imagesRef,
  where('event_id', '==', window.CURRENT_EVENT_ID),  // 追加
  orderBy('total_score', 'desc'),
  limit(100)
);
```

## 必要なFirestoreインデックス

以下のコンポジットインデックスを作成する必要があります：

### 1. images - イベント別スコア順取得（最重要）

```
Collection: images
Fields:
  - event_id (Ascending)
  - status (Ascending)
  - total_score (Descending)
```

**作成コマンド**:

```bash
gcloud firestore indexes composite create \
  --collection-group=images \
  --field-config field-path=event_id,order=ascending \
  --field-config field-path=status,order=ascending \
  --field-config field-path=total_score,order=descending
```

### 2. images - イベント&ユーザー別類似判定用

```
Collection: images
Fields:
  - event_id (Ascending)
  - user_id (Ascending)
  - status (Ascending)
```

**作成コマンド**:

```bash
gcloud firestore indexes composite create \
  --collection-group=images \
  --field-config field-path=event_id,order=ascending \
  --field-config field-path=user_id,order=ascending \
  --field-config field-path=status,order=ascending
```

### 3. users - イベント別総投稿数順

```
Collection: users
Fields:
  - event_id (Ascending)
  - total_uploads (Descending)
```

**作成コマンド**:

```bash
gcloud firestore indexes composite create \
  --collection-group=users \
  --field-config field-path=event_id,order=ascending \
  --field-config field-path=total_uploads,order=descending
```

## デプロイ手順

### 1. Firestore インデックスの作成

まず、上記のインデックスを作成します（インデックス作成には数分かかる場合があります）：

```bash
# インデックス1: イベント別スコア順（最重要）
gcloud firestore indexes composite create \
  --collection-group=images \
  --field-config field-path=event_id,order=ascending \
  --field-config field-path=status,order=ascending \
  --field-config field-path=total_score,order=descending

# インデックス2: イベント&ユーザー別
gcloud firestore indexes composite create \
  --collection-group=images \
  --field-config field-path=event_id,order=ascending \
  --field-config field-path=user_id,order=ascending \
  --field-config field-path=status,order=ascending

# インデックス作成状態を確認
gcloud firestore indexes composite list
```

### 2. Cloud Functions の更新

Webhook関数とScoring関数をデプロイ（環境変数付き）：

```bash
# Webhook関数
gcloud functions deploy webhook \
  --gen2 \
  --runtime=python311 \
  --region=asia-northeast1 \
  --source=src/functions/webhook \
  --entry-point=webhook \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars="CURRENT_EVENT_ID=test"

# Scoring関数
gcloud functions deploy scoring \
  --gen2 \
  --runtime=python311 \
  --region=asia-northeast1 \
  --source=src/functions/scoring \
  --entry-point=scoring \
  --trigger-http \
  --set-env-vars="CURRENT_EVENT_ID=test"
```

### 3. Frontend の更新

Frontendをビルド＆デプロイ：

```bash
cd src/frontend

# config.js の CURRENT_EVENT_ID を確認
# （必要に応じて変更）

# Firebase Hostingにデプロイ
firebase deploy --only hosting
```

## 使い方

### テストイベントで開発

デフォルトの`CURRENT_EVENT_ID=test`を使用:

```bash
# Cloud Functionsはすでにtest設定
# Frontendもtest設定（config.js）

# 開発中はこのままでOK
```

### 本番イベントへの切り替え

#### 方法1: 管理スクリプトを使用（推奨）

```bash
# 新しいイベントを作成
python scripts/create_event.py \
  --event-id="wedding_20250315_tanaka" \
  --event-name="田中太郎 & 花子 結婚式" \
  --event-date="2025-03-15"

# イベントを切り替え（Cloud Functions + Frontend）
./scripts/switch_event.sh wedding_20250315_tanaka

# 統計を確認
python scripts/event_stats.py wedding_20250315_tanaka
```

#### 方法2: 手動で切り替え

```bash
# Cloud Functionsの環境変数を更新
gcloud functions deploy webhook \
  --update-env-vars="CURRENT_EVENT_ID=wedding_20250315_tanaka"

gcloud functions deploy scoring \
  --update-env-vars="CURRENT_EVENT_ID=wedding_20250315_tanaka"

# Frontendの設定を更新
# src/frontend/js/config.js を編集:
# window.CURRENT_EVENT_ID = "wedding_20250315_tanaka";

# Frontendを再デプロイ
cd src/frontend
firebase deploy --only hosting
```

### イベント終了後

```bash
# イベントをアーカイブ
python scripts/archive_event.py wedding_20250315_tanaka

# 全データをダウンロード
./scripts/download_event_images.sh wedding_20250315_tanaka

# テストイベントに戻す
./scripts/switch_event.sh test
```

## 既存データの移行

既にデータが存在する場合、event_idフィールドを追加する必要があります：

```python
from google.cloud import firestore

db = firestore.Client()

# 全ユーザーにevent_id='test'を追加
users = db.collection('users').stream()
for user in users:
    if 'event_id' not in user.to_dict():
        user.reference.update({'event_id': 'test'})
        print(f"Updated user: {user.id}")

# 全画像にevent_id='test'を追加
images = db.collection('images').stream()
for image in images:
    if 'event_id' not in image.to_dict():
        image.reference.update({'event_id': 'test'})
        print(f"Updated image: {image.id}")

print("Migration completed!")
```

## トラブルシューティング

### エラー: "Requires index"

**症状**:

```
google.api_core.exceptions.FailedPrecondition: 400 The query requires an index
```

**原因**: Firestoreコンポジットインデックスが作成されていない

**解決方法**:

1. エラーメッセージに表示されるリンクをクリック（自動的にインデックス作成ページに移動）
2. または、上記の`gcloud firestore indexes`コマンドを実行
3. インデックス作成完了まで待機（通常数分）

### 別イベントのデータが表示される

**原因**: Cloud FunctionsとFrontendのCURRENT_EVENT_IDが一致していない

**確認方法**:

```bash
# Cloud Functionsの設定を確認
gcloud functions describe webhook \
  --format="value(environmentVariables.CURRENT_EVENT_ID)"

# Frontendの設定を確認
cat src/frontend/js/config.js | grep CURRENT_EVENT_ID
```

**解決方法**: `./scripts/switch_event.sh`で両方を一度に更新

### Cloud Storageに古いパス構造の画像がある

**症状**: event_id導入前の画像が`original/{user_id}/...`に存在

**対処**:

- 既存画像は移動不要（アクセスできる限り問題なし）
- 新規画像は`{event_id}/original/{user_id}/...`に保存される
- 必要に応じてgsutilで移動可能

## まとめ

この実装により、以下が可能になりました：

✅ **複数イベントの完全分離**: 各結婚式のデータが完全に独立
✅ **簡単な切り替え**: 環境変数1つでイベント切り替え
✅ **データ保持**: 全イベントのデータを永続的に保存
✅ **運用の簡素化**: 管理スクリプトで容易に操作
✅ **後方互換性**: 既存データは`event_id='test'`で管理可能

詳細な運用手順については、以下のドキュメントを参照してください：

- [データ管理ガイド](DATA_MANAGEMENT.md)
- [式当日の運用ガイド](WEDDING_DAY_OPERATIONS.md)
- [スクリプト使い方](../../scripts/README.md)
