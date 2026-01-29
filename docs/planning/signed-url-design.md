# 署名付きURL設計書

## 概要

Cloud Storage画像アクセスを署名付きURLに変更し、顔写真（生体データ）を保護する。

## 現状

- 画像は `{event_id}/original/{user_id}/{timestamp}_{image_id}.jpg` パスでGCSに保存
- Firestoreの`images`コレクションに`storage_path`フィールドあり
- フロントエンドは既に`storage_url`フィールドを優先チェック（未設定時は公開URLにフォールバック）
- 現在はバケットが公開設定で直接URLアクセス可能

## 方針

**ハイブリッドアプローチ**を採用:
1. スコアリング関数で署名付きURL生成 + Firestoreに保存
2. Cloud Schedulerで期限切れ間近のURLを定期更新
3. フロントエンドは既存のリアルタイムリスナーで自動更新を受信

**理由**:
- 既存の`storage_url`フィールドを活用（フロントエンド変更最小）
- スコアリング完了時にURL即座に利用可能
- リアルタイムリスナーとの相性が良い

## 変更ファイル

| ファイル | 操作 | 内容 |
|---------|------|------|
| `src/functions/scoring/main.py` | 変更 | 署名付きURL生成ロジック追加 |
| `src/functions/webhook/main.py` | 変更 | アップロード時にも署名付きURL生成（即時表示用） |
| `src/functions/url_refresh/main.py` | 新規 | 期限切れURL更新関数 |
| `src/functions/url_refresh/requirements.txt` | 新規 | 依存関係 |
| `src/frontend/js/app.js` | 変更 | 公開URL構築ロジック削除、署名付きURL必須化 |
| `src/frontend/js/admin.js` | 変更 | 同上 |
| `terraform/scheduler.tf` | 変更 | Cloud Scheduler設定追加 |
| `terraform/functions.tf` | 変更 | url_refresh関数デプロイ設定 |
| `docs/planning/release-todo.md` | 変更 | 5.2を完了にマーク |

## 技術設計

### 1. 署名付きURL生成関数（共通）

```python
from datetime import datetime, timedelta
from google.cloud import storage

def generate_signed_url(storage_client, bucket_name: str, storage_path: str,
                        expiration_hours: int = 1) -> tuple[str, datetime]:
    """署名付きURLを生成"""
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(storage_path)

    expiration = timedelta(hours=expiration_hours)
    expiration_time = datetime.utcnow() + expiration

    url = blob.generate_signed_url(
        version="v4",
        expiration=expiration,
        method="GET",
    )
    return url, expiration_time
```

### 2. Firestoreスキーマ変更

`images`コレクションに追加:

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `storage_url` | string | 署名付きURL |
| `storage_url_expires_at` | timestamp | URL有効期限 |

### 3. スコアリング関数変更

`_update_image_and_user_stats`の更新内容に追加:
```python
signed_url, expiration = generate_signed_url(storage_client, STORAGE_BUCKET, storage_path)
transaction.update(image_ref, {
    # 既存フィールド...
    "storage_url": signed_url,
    "storage_url_expires_at": expiration,
})
```

### 4. URL更新関数

```python
@functions_framework.http
def refresh_signed_urls(request):
    """30分以内に期限切れになるURLを更新"""
    refresh_threshold = datetime.utcnow() + timedelta(minutes=30)

    expiring = db.collection("images") \
        .where("storage_url_expires_at", "<=", refresh_threshold) \
        .where("status", "==", "completed") \
        .limit(500).stream()

    # バッチ更新...
```

### 5. Cloud Scheduler設定

```hcl
resource "google_cloud_scheduler_job" "refresh_signed_urls" {
  name     = "refresh-signed-urls"
  schedule = "*/30 * * * *"  # 30分ごと
  # ...
}
```

### 6. フロントエンド変更

```javascript
function getImageUrl(imageData) {
  // 署名付きURLを使用（必須）
  if (imageData.storage_url) {
    return imageData.storage_url;
  }
  // 署名付きURLがない場合はプレースホルダー
  console.warn(`No signed URL for image: ${imageData.id}`);
  return "";
}
```

## 実装順序

1. scoring/main.py に署名付きURL生成追加
2. webhook/main.py にアップロード時のURL生成追加
3. url_refresh 関数を新規作成
4. Terraform設定更新（関数デプロイ + Scheduler）
5. フロントエンド更新（app.js, admin.js）- 公開URL構築ロジック削除
6. 既存テストデータ削除（Firestore + Cloud Storage）
7. バケットの公開アクセスを無効化

## 検証

- 新規画像アップロード → Firestoreに`storage_url`と`storage_url_expires_at`が保存されること
- ランキング画面で署名付きURLから画像が表示されること
- 1時間後にURLが期限切れになること（手動テスト）
- Cloud Scheduler実行後、期限切れ間近のURLが更新されること
- バケット公開アクセス無効化後も画像が正常に表示されること

## やらないこと

- 既存画像のバックフィル（テストデータは削除して署名付きURLありの状態で再作成）
- 5.3のURL リフレッシュ頻度検討（本PRのScheduler設定で対応済み）

## 注意事項

- Cloud Functions サービスアカウントに `roles/iam.serviceAccountTokenCreator` 権限が必要
- Firestoreインデックス追加が必要（`storage_url_expires_at` + `status`の複合インデックス）
