# データ管理・リセット戦略

**作成日**: 2025-01-23
**目的**: 結婚式本番前のデータリセットとイベント管理の運用方法を定義

---

## 1. 背景と課題

### 1.1 課題

結婚式本番でこのシステムを使用する際、以下の問題が発生する：

- **テストデータの混入**: 開発・テスト中に投稿されたデータが残っている
- **ランキングの汚染**: テストユーザーの画像が本番ランキングに表示される
- **混乱の原因**: 参列者がテスト画像を見て困惑する
- **再利用性**: 複数の結婚式で同じシステムを使い回したい

### 1.2 要件

- **本番前にクリーンな状態で開始**: テストデータを除外
- **データの保持**: テストデータは削除せず、将来的に参照可能
- **複数イベント対応**: 異なる結婚式で再利用可能
- **簡単な操作**: 管理者が簡単にリセット可能

---

## 2. アプローチの比較

### 2.1 オプション1: 論理削除フラグ

#### 概要

各ドキュメントに `is_deleted` フラグを追加し、クエリでフィルタリング

```typescript
{
  image_id: "img_001",
  user_id: "user_001",
  total_score: 389.3,
  is_deleted: false,  // 追加
  ...
}
```

#### メリット

- 実装が簡単
- データの完全性を保持

#### デメリット

- すべてのクエリに `is_deleted == false` 条件が必要
- 複数イベントの分離ができない
- テストデータと本番データの明確な区別がない

**評価**: ❌ 不採用（複数イベント対応が困難）

---

### 2.2 オプション2: イベントID分離（推奨）

#### 概要

各結婚式に一意の `event_id` を付与し、イベント単位でデータを管理

```typescript
{
  image_id: "img_001",
  user_id: "user_001",
  event_id: "wedding_20250315_tanaka",  // 追加
  total_score: 389.3,
  ...
}
```

#### メリット

- **複数イベント対応**: 異なる結婚式のデータを完全分離
- **テスト環境の明確化**: `event_id: "test"` でテスト専用
- **データ保持**: 過去のイベントデータを保持
- **簡単な切り替え**: フロントエンドで `event_id` を切り替えるだけ

#### デメリット

- スキーマ変更が必要
- 既存データのマイグレーション

**評価**: ✅ **推奨アプローチ**

---

### 2.3 オプション3: 環境分離

#### 概要

テスト用GCPプロジェクトと本番用GCPプロジェクトを完全分離

#### メリット

- 完全な分離
- 本番環境が汚れない

#### デメリット

- **コスト増**: 2つのプロジェクトを管理
- **デプロイの複雑化**: 2つの環境にデプロイ
- **テストの不完全性**: 本番環境と異なる可能性

**評価**: △ 採用可能だが、コストと運用負荷が高い

---

### 2.4 オプション4: 物理削除 + バックアップ

#### 概要

本番前にすべてのテストデータを物理削除し、バックアップを取得

```bash
# テストデータをエクスポート
gcloud firestore export gs://wedding-backup/test-data

# Firestoreをクリア
gcloud firestore databases delete --database=(default)
```

#### メリット

- 本番環境が完全にクリーン
- シンプル

#### デメリット

- **リスクが高い**: 削除操作のミスでデータ損失
- **復元が困難**: バックアップからのリストアに時間がかかる
- **複数イベント非対応**: 毎回削除が必要

**評価**: ❌ 不採用（リスクが高すぎる）

---

## 3. 推奨アプローチ: イベントID分離

### 3.1 設計

#### Firestoreスキーマ変更

**usersコレクション**:

```typescript
{
  user_id: "user_001",
  name: "山田太郎",
  line_user_id: "U1234567890abcdef",
  event_id: "wedding_20250315_tanaka",  // 追加
  created_at: Timestamp,
  total_uploads: 5,
  best_score: 389.3
}
```

**imagesコレクション**:

```typescript
{
  image_id: "img_001",
  user_id: "user_001",
  event_id: "wedding_20250315_tanaka",  // 追加
  storage_path: "original/user_001/20251118_103000_img001.jpg",
  upload_timestamp: Timestamp,
  smile_score: 458.0,
  ai_score: 85,
  total_score: 389.3,
  ...
}
```

**eventsコレクション（新規）**:

```typescript
{
  event_id: "wedding_20250315_tanaka",
  event_name: "田中太郎 & 花子 結婚式",
  event_date: "2025-03-15",
  status: "active",  // test | active | archived
  created_at: Timestamp,
  settings: {
    theme: "笑顔（Smile For You）",
    max_uploads_per_user: 10,
    similarity_threshold: 8
  }
}
```

#### イベントID命名規則

```
{event_type}_{yyyymmdd}_{identifier}

例:
- wedding_20250315_tanaka
- wedding_20250420_suzuki
- test
```

### 3.2 実装変更

#### Webhook Function

```python
# 環境変数から現在のイベントIDを取得
CURRENT_EVENT_ID = os.environ.get('CURRENT_EVENT_ID', 'test')

async def handle_text_message(event):
    user_id = event['source']['userId']
    text = event['message']['text']

    # ユーザー登録時にevent_idを付与
    user_ref = db.collection('users').document(user_id)
    user_ref.set({
        'name': text,
        'line_user_id': user_id,
        'event_id': CURRENT_EVENT_ID,  # 追加
        'created_at': firestore.SERVER_TIMESTAMP,
        'total_uploads': 0,
        'best_score': 0
    })
```

#### Scoring Function

```python
async def handle_image_message(event):
    user_id = event['source']['userId']
    message_id = event['message']['id']

    # Cloud Storageのパスにevent_idを含める（重要！）
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    storage_path = f"{CURRENT_EVENT_ID}/original/{user_id}/{timestamp}_{image_id}.jpg"  # 変更

    # 画像保存時にevent_idを付与
    image_ref = db.collection('images').document(image_id)
    image_ref.set({
        'user_id': user_id,
        'event_id': CURRENT_EVENT_ID,  # 追加
        'storage_path': storage_path,
        'upload_timestamp': firestore.SERVER_TIMESTAMP,
        'status': 'pending'
    })
```

#### Frontend (Next.js)

```typescript
// 環境変数から現在のイベントIDを取得
const CURRENT_EVENT_ID = process.env.NEXT_PUBLIC_CURRENT_EVENT_ID || 'test';

// Firestoreクエリにevent_idフィルタを追加
const q = query(
  collection(db, 'images'),
  where('event_id', '==', CURRENT_EVENT_ID),  // 追加
  where('status', '==', 'completed'),
  orderBy('total_score', 'desc'),
  limit(100)
);
```

### 3.3 Firestoreインデックス追加

```
Collection: images
Fields:
  - event_id (Ascending)
  - status (Ascending)
  - total_score (Descending)
```

```
Collection: users
Fields:
  - event_id (Ascending)
  - created_at (Descending)
```

---

## 4. 運用手順

### 4.1 テスト期間（開発中）

```bash
# テストイベントIDを使用
export CURRENT_EVENT_ID="test"

# Cloud Functionsにデプロイ
gcloud functions deploy webhook \
  --set-env-vars="CURRENT_EVENT_ID=test"

# Frontendにデプロイ
NEXT_PUBLIC_CURRENT_EVENT_ID=test npm run build
```

### 4.2 本番前の準備（1週間前）

#### ステップ1: 本番イベントの作成

```bash
# 管理CLIツール実行
python scripts/create_event.py \
  --event-id="wedding_20250315_tanaka" \
  --event-name="田中太郎 & 花子 結婚式" \
  --event-date="2025-03-15" \
  --status="active"
```

`scripts/create_event.py`:

```python
import argparse
from google.cloud import firestore

def create_event(event_id, event_name, event_date, status):
    db = firestore.Client()

    event_ref = db.collection('events').document(event_id)
    event_ref.set({
        'event_id': event_id,
        'event_name': event_name,
        'event_date': event_date,
        'status': status,
        'created_at': firestore.SERVER_TIMESTAMP,
        'settings': {
            'theme': '笑顔（Smile For You）',
            'max_uploads_per_user': 10,
            'similarity_threshold': 8
        }
    })

    print(f"✅ Event created: {event_id}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--event-id', required=True)
    parser.add_argument('--event-name', required=True)
    parser.add_argument('--event-date', required=True)
    parser.add_argument('--status', default='active')
    args = parser.parse_args()

    create_event(args.event_id, args.event_name, args.event_date, args.status)
```

#### ステップ2: 環境変数の更新

```bash
# Cloud Functionsの環境変数を更新
gcloud functions deploy webhook \
  --update-env-vars="CURRENT_EVENT_ID=wedding_20250315_tanaka"

gcloud functions deploy scoring \
  --update-env-vars="CURRENT_EVENT_ID=wedding_20250315_tanaka"

# Frontendを再デプロイ
NEXT_PUBLIC_CURRENT_EVENT_ID=wedding_20250315_tanaka npm run build
firebase deploy --only hosting
```

#### ステップ3: 動作確認

```bash
# テストユーザーで画像投稿
# → 新しいevent_idで保存されることを確認

# Firestoreで確認
gcloud firestore databases query \
  --collection=images \
  --where="event_id==wedding_20250315_tanaka"
```

### 4.3 本番当日

#### 事前チェックリスト

- [ ] 環境変数 `CURRENT_EVENT_ID` が本番イベントIDになっているか確認
- [ ] Frontendで本番イベントIDのデータのみ表示されるか確認
- [ ] テストデータが表示されていないか確認
- [ ] LINEボットで新規投稿がテストできるか確認

#### 緊急時の対応

**誤ってテストイベントIDで起動した場合**:

```bash
# 1. 即座に環境変数を修正
gcloud functions deploy webhook \
  --update-env-vars="CURRENT_EVENT_ID=wedding_20250315_tanaka"

# 2. 誤投稿データを確認
gcloud firestore databases query \
  --collection=images \
  --where="event_id==test" \
  --where="upload_timestamp>=2025-03-15T00:00:00Z"

# 3. 必要に応じて手動でevent_idを修正
python scripts/migrate_event_id.py \
  --from-event="test" \
  --to-event="wedding_20250315_tanaka" \
  --date-range="2025-03-15T00:00:00Z"
```

### 4.4 本番後のアーカイブとダウンロード

#### ステップ1: イベントをアーカイブ

```bash
# イベントをアーカイブ状態に変更
python scripts/archive_event.py \
  --event-id="wedding_20250315_tanaka"
```

#### ステップ2: Firestoreデータのバックアップ

```bash
# Firestoreデータをエクスポート
gcloud firestore export gs://wedding-backup/wedding_20250315_tanaka
```

#### ステップ3: Cloud Storageの画像ダウンロード

**重要**: Cloud Storageの画像は物理削除せず、イベント終了後にダウンロード可能

```bash
# イベント全体の画像をダウンロード
gsutil -m cp -r gs://wedding-smile-images/wedding_20250315_tanaka ./downloads/

# または特定のユーザーのみダウンロード
gsutil -m cp -r gs://wedding-smile-images/wedding_20250315_tanaka/original/user_001 ./downloads/

# ZIPアーカイブを作成
cd downloads
zip -r wedding_20250315_tanaka.zip wedding_20250315_tanaka/
```

#### ステップ4: データ保持ポリシー

**推奨**: 物理削除せず、長期保存用ストレージクラスに移行

```json
{
  "lifecycle": {
    "rule": [
      {
        "action": {
          "type": "SetStorageClass",
          "storageClass": "ARCHIVE"
        },
        "condition": {
          "age": 90,
          "matchesPrefix": ["wedding_"]
        }
      }
    ]
  }
}
```

**注意**: 自動削除ルールは設定しない（データを永続保持）

#### ステップ5: 新郎新婦への納品

```bash
# 1. 全画像をダウンロード
gsutil -m cp -r gs://wedding-smile-images/wedding_20250315_tanaka ./wedding_tanaka/

# 2. Firestoreデータ（スコア情報）をJSON出力
python scripts/export_event_data.py wedding_20250315_tanaka

# 3. ZIPアーカイブ作成
zip -r wedding_tanaka_all_data.zip wedding_tanaka/

# 4. Google DriveまたはUSBで納品
```

---

## 5. 管理ツール

### 5.1 イベント一覧表示

`scripts/list_events.py`:

```python
from google.cloud import firestore

def list_events():
    db = firestore.Client()
    events = db.collection('events').order_by('event_date', direction=firestore.Query.DESCENDING).stream()

    print("📅 イベント一覧")
    print("-" * 80)
    for event in events:
        data = event.to_dict()
        print(f"ID: {data['event_id']}")
        print(f"  名前: {data['event_name']}")
        print(f"  日付: {data['event_date']}")
        print(f"  状態: {data['status']}")
        print("-" * 80)

if __name__ == "__main__":
    list_events()
```

### 5.2 イベント切り替えスクリプト

`scripts/switch_event.sh`:

```bash
#!/bin/bash
set -e

EVENT_ID=$1

if [ -z "$EVENT_ID" ]; then
  echo "使い方: ./switch_event.sh <event_id>"
  exit 1
fi

echo "🔄 イベントを切り替え中: $EVENT_ID"

# Cloud Functions
gcloud functions deploy webhook \
  --update-env-vars="CURRENT_EVENT_ID=$EVENT_ID" \
  --quiet

gcloud functions deploy scoring \
  --update-env-vars="CURRENT_EVENT_ID=$EVENT_ID" \
  --quiet

# Frontend
cd src/frontend
NEXT_PUBLIC_CURRENT_EVENT_ID=$EVENT_ID npm run build
firebase deploy --only hosting --quiet

echo "✅ イベント切り替え完了: $EVENT_ID"
```

### 5.3 データ統計表示

`scripts/event_stats.py`:

```python
from google.cloud import firestore

def show_stats(event_id):
    db = firestore.Client()

    # ユーザー数
    users = db.collection('users').where('event_id', '==', event_id).stream()
    user_count = sum(1 for _ in users)

    # 画像数
    images = db.collection('images').where('event_id', '==', event_id).stream()
    image_count = sum(1 for _ in images)

    print(f"📊 イベント統計: {event_id}")
    print("-" * 40)
    print(f"ユーザー数: {user_count}人")
    print(f"投稿画像数: {image_count}枚")
    print("-" * 40)

if __name__ == "__main__":
    import sys
    event_id = sys.argv[1] if len(sys.argv) > 1 else "test"
    show_stats(event_id)
```

---

## 6. ベストプラクティス

### 6.1 イベントID命名規則

```
推奨:
  wedding_20250315_tanaka     ✅ 日付と識別子が明確
  wedding_20250420_suzuki     ✅

非推奨:
  event1                      ❌ 識別子が不明確
  tanaka                      ❌ 日付がない
  2025-03-15                  ❌ タイプがない
```

### 6.2 テストイベント

```
test                          ✅ 開発・テスト全般
test_integration              ✅ 統合テスト専用
test_e2e                      ✅ E2Eテスト専用
```

### 6.3 環境変数の管理

**開発環境** (`.env.local`):

```bash
CURRENT_EVENT_ID=test
```

**本番環境** (Cloud Functions環境変数):

```bash
CURRENT_EVENT_ID=wedding_20250315_tanaka
```

---

## 7. トラブルシューティング

### Q1: テストデータが本番に表示されている

**原因**: 環境変数が更新されていない

**対処**:

```bash
# 現在の環境変数を確認
gcloud functions describe webhook --format="value(environmentVariables.CURRENT_EVENT_ID)"

# 修正
gcloud functions deploy webhook \
  --update-env-vars="CURRENT_EVENT_ID=wedding_20250315_tanaka"
```

### Q2: 過去のイベントデータが見たい

**対処**:

```bash
# Frontendのクエリを一時的に変更
NEXT_PUBLIC_CURRENT_EVENT_ID=wedding_20250220_old npm run dev

# または管理画面を作成して、event_idを選択できるようにする
```

### Q3: 誤って別のイベントIDで投稿してしまった

**対処**:

```python
# scripts/migrate_event_id.py
from google.cloud import firestore

def migrate_event_id(image_ids, new_event_id):
    db = firestore.Client()

    for image_id in image_ids:
        image_ref = db.collection('images').document(image_id)
        image_ref.update({'event_id': new_event_id})

        # 対応するユーザーも更新
        image_data = image_ref.get().to_dict()
        user_id = image_data['user_id']
        user_ref = db.collection('users').document(user_id)
        user_ref.update({'event_id': new_event_id})

    print(f"✅ {len(image_ids)}件のデータを {new_event_id} に移行しました")
```

---

## 8. 代替案: 管理画面（Phase 2）

### 8.1 概要

Web UIで簡単にイベントを管理できる管理画面を作成

### 8.2 機能

- イベント一覧表示
- 新規イベント作成
- イベント切り替え（環境変数の自動更新）
- データ統計表示
- データエクスポート

### 8.3 技術スタック

- Next.js Admin Dashboard
- Firebase Admin SDK
- Cloud Functions (管理API)

**注**: Phase 1ではCLIツールで十分。必要に応じてPhase 2で実装。

---

## 9. まとめ

### 推奨アプローチ

**イベントID分離** を採用することで：

- ✅ テストデータと本番データを完全分離
- ✅ 複数の結婚式で再利用可能
- ✅ データの完全性を保持（物理削除不要）
- ✅ 簡単な切り替え（環境変数の変更のみ）

### 本番前チェックリスト

- [ ] 本番イベントを作成（`scripts/create_event.py`）
- [ ] 環境変数 `CURRENT_EVENT_ID` を更新
- [ ] Cloud Functions再デプロイ
- [ ] Frontend再デプロイ
- [ ] テスト投稿で確認
- [ ] テストデータが表示されないことを確認

### 次のステップ

1. イベント管理スクリプトの実装（`scripts/`）
2. Firestoreスキーマのマイグレーション
3. 既存コードへの `event_id` フィルタ追加
4. ドキュメント更新（API仕様、セットアップガイド）

---

**最終更新**: 2025-01-23
