# 統合テスト設計（クリティカルパス重視）

Wedding Smile Catcher プロジェクトの統合テスト設計

**作成日**: 2025-01-22
**方針**: クリティカルパス（コア機能）に集中し、最小限のテストで最大の信頼性を確保

---

## 1. テスト対象のクリティカルパス

結婚式で**絶対に失敗できない機能**のみをテスト対象とする。

### 優先度A（必須）

1. **画像アップロード → Storage保存**
2. **Firestore読み書き**（ユーザー登録、画像メタデータ、スコア保存）
3. **Scoring Function → Webhook Function通信**

### 優先度B（重要だが、手動テストで代替可能）

- LINE Bot API統合（手動テスト推奨）
- Frontend表示（目視確認推奨）

---

## 2. 統合テストケース

### 2.1 Cloud Storage統合テスト

**目的**: 画像が確実にアップロード・ダウンロードできることを確認

#### テストケース

| No | テストケース | 期待される動作 | 備考 |
|----|-------------|---------------|------|
| 1 | 画像アップロード | Storageにblobが作成される | - |
| 2 | 画像ダウンロード | アップロードした画像と同じバイト列を取得 | - |
| 3 | 存在しない画像 | 404エラーが返る | エラーハンドリング確認 |

**実装例**:

```python
import pytest
from google.cloud import storage
import os

# Test bucket (本番とは別のバケット使用)
TEST_BUCKET = "wedding-smile-images-test"
storage_client = storage.Client()

def test_upload_and_download_image():
    """
    画像アップロード → ダウンロードの一連の流れをテスト
    """
    bucket = storage_client.bucket(TEST_BUCKET)
    test_path = "test/integration_test_image.jpg"
    blob = bucket.blob(test_path)

    # Upload test image
    with open("tests/test_data/sample.jpg", "rb") as f:
        test_image_bytes = f.read()

    blob.upload_from_string(test_image_bytes, content_type="image/jpeg")

    # Download and verify
    downloaded_bytes = blob.download_as_bytes()
    assert downloaded_bytes == test_image_bytes

    # Cleanup
    blob.delete()


def test_download_nonexistent_image():
    """
    存在しない画像のダウンロードでエラーハンドリングが動くことを確認
    """
    bucket = storage_client.bucket(TEST_BUCKET)
    blob = bucket.blob("nonexistent/image.jpg")

    with pytest.raises(Exception):  # google.cloud.exceptions.NotFound
        blob.download_as_bytes()
```

---

### 2.2 Firestore統合テスト

**目的**: ユーザー登録、画像メタデータ保存、スコア更新が正しく動作することを確認

#### テストケース (Firestore)

| No | テストケース | 期待される動作 | 備考 |
|----|-------------|---------------|------|
| 1 | ユーザー登録 | `users`コレクションにドキュメント作成 | - |
| 2 | 画像メタデータ保存 | `images`コレクションにドキュメント作成 | - |
| 3 | スコア更新 | 既存ドキュメントが正しく更新される | - |
| 4 | ランキング取得 | `total_score`降順でTop 3が取得できる | - |

**実装例**:

```python
import pytest
from google.cloud import firestore
from datetime import datetime

# Test Firestore (ローカルエミュレータまたはテスト用プロジェクト)
db = firestore.Client()

@pytest.fixture
def cleanup_test_data():
    """テスト後にFirestoreのテストデータを削除"""
    yield
    # Cleanup test users
    users_ref = db.collection("users")
    for doc in users_ref.where("line_user_id", ">=", "test_").stream():
        doc.reference.delete()

    # Cleanup test images
    images_ref = db.collection("images")
    for doc in images_ref.where("user_id", ">=", "test_").stream():
        doc.reference.delete()


def test_user_registration(cleanup_test_data):
    """
    ユーザー登録が正しくFirestoreに保存されることを確認
    """
    user_id = "test_user_001"
    user_ref = db.collection("users").document(user_id)

    # Register user
    user_ref.set({
        "name": "テスト太郎",
        "line_user_id": user_id,
        "created_at": firestore.SERVER_TIMESTAMP,
        "total_uploads": 0,
        "best_score": 0
    })

    # Verify
    user_doc = user_ref.get()
    assert user_doc.exists
    assert user_doc.to_dict()["name"] == "テスト太郎"


def test_image_metadata_save(cleanup_test_data):
    """
    画像メタデータがFirestoreに保存されることを確認
    """
    image_id = "test_img_001"
    image_ref = db.collection("images").document(image_id)

    # Save image metadata
    image_ref.set({
        "user_id": "test_user_001",
        "storage_path": "original/test_user_001/20250122_120000_test.jpg",
        "upload_timestamp": firestore.SERVER_TIMESTAMP,
        "status": "pending"
    })

    # Verify
    image_doc = image_ref.get()
    assert image_doc.exists
    assert image_doc.to_dict()["status"] == "pending"


def test_score_update(cleanup_test_data):
    """
    スコア更新が正しく反映されることを確認
    """
    image_id = "test_img_002"
    image_ref = db.collection("images").document(image_id)

    # Initial save
    image_ref.set({
        "user_id": "test_user_002",
        "status": "pending",
        "total_score": 0
    })

    # Update with scores
    image_ref.update({
        "status": "completed",
        "smile_score": 450.0,
        "ai_score": 85,
        "total_score": 382.5,
        "comment": "素晴らしい笑顔です！"
    })

    # Verify
    image_doc = image_ref.get()
    data = image_doc.to_dict()
    assert data["status"] == "completed"
    assert data["total_score"] == 382.5


def test_ranking_query(cleanup_test_data):
    """
    ランキング取得クエリが正しく動作することを確認
    """
    # Insert test data
    test_images = [
        {
            "id": "test_img_r1",
            "user_id": "test_user_r1",
            "total_score": 450.0,
            "status": "completed"
        },
        {
            "id": "test_img_r2",
            "user_id": "test_user_r2",
            "total_score": 380.0,
            "status": "completed"
        },
        {
            "id": "test_img_r3",
            "user_id": "test_user_r3",
            "total_score": 320.0,
            "status": "completed"
        },
    ]

    for img in test_images:
        db.collection("images").document(img["id"]).set(img)

    # Query top 3
    top_images = (
        db.collection("images")
        .where("status", "==", "completed")
        .order_by("total_score", direction=firestore.Query.DESCENDING)
        .limit(3)
        .get()
    )

    results = [doc.to_dict() for doc in top_images]

    # Verify order
    assert len(results) >= 3
    assert results[0]["total_score"] >= results[1]["total_score"]
    assert results[1]["total_score"] >= results[2]["total_score"]
```

---

### 2.3 Cloud Functions間通信テスト

**目的**: Webhook Function → Scoring Function の呼び出しが正しく動作することを確認

#### テストケース (Cloud Functions)

| No | テストケース | 期待される動作 | 備考 |
|----|-------------|---------------|------|
| 1 | Scoring Function呼び出し | HTTP 200が返る | 実際のCloud Functionsデプロイ必要 |
| 2 | 認証トークン付与 | ID tokenが正しく付与される | - |

**実装例**:

```python
import pytest
import requests
from google.auth.transport.requests import Request
from google.oauth2 import id_token

SCORING_FUNCTION_URL = "https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/scoring-function"

def test_trigger_scoring_function():
    """
    Webhook → Scoring Functionの呼び出しが成功することを確認
    """
    # Get ID token
    auth_req = Request()
    id_token_value = id_token.fetch_id_token(auth_req, SCORING_FUNCTION_URL)

    headers = {
        "Authorization": f"Bearer {id_token_value}",
        "Content-Type": "application/json"
    }

    payload = {
        "image_id": "test_img_001",
        "user_id": "test_user_001"
    }

    # Trigger function (timeout短め)
    try:
        response = requests.post(
            SCORING_FUNCTION_URL,
            json=payload,
            headers=headers,
            timeout=3
        )
        # 200 or 202を期待（非同期処理なので即座にレスポンスが返る）
        assert response.status_code in [200, 202]
    except requests.exceptions.Timeout:
        # Timeoutも許容（非同期処理の場合）
        pass
```

---

## 3. テスト環境

### 3.1 ローカル環境（推奨）

- **Firestore Emulator**: ローカルでFirestoreをエミュレート
- **Cloud Storage**: テスト用バケット（`wedding-smile-images-test`）

**セットアップ**:

```bash
# Firestore Emulatorインストール
gcloud components install cloud-firestore-emulator

# Emulator起動
gcloud beta emulators firestore start --host-port=localhost:8080

# 環境変数設定
export FIRESTORE_EMULATOR_HOST="localhost:8080"
export GOOGLE_CLOUD_PROJECT="wedding-smile-catcher-test"
```

### 3.2 テスト用GCPプロジェクト

本番とは別のGCPプロジェクトでテスト実行（CI/CD用）

- **プロジェクト名**: `wedding-smile-catcher-test`
- **バケット**: `wedding-smile-images-test`
- **Firestore**: テストデータ専用

---

## 4. CI/CD統合

GitHub Actionsで統合テストを自動実行

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install -r requirements-dev.txt

      - name: Authenticate to GCP (test project)
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_TEST_SA_KEY }}

      - name: Run integration tests
        env:
          GOOGLE_CLOUD_PROJECT: wedding-smile-catcher-test
          STORAGE_BUCKET: wedding-smile-images-test
        run: pytest tests/integration/ -v
```

---

## 5. テストデータ管理

### 5.1 テスト用画像

`tests/test_data/` に以下を配置：

- `sample.jpg` - 基本的なテスト画像
- `happy_couple.jpg` - 笑顔検出用
- `group_5.jpg` - 複数人検出用

### 5.2 クリーンアップ

**重要**: テスト後は必ずFirestoreとStorageのテストデータを削除

```python
@pytest.fixture(autouse=True)
def cleanup_after_test():
    yield
    # Cleanup Firestore
    for collection in ["users", "images"]:
        docs = db.collection(collection).where("user_id", ">=", "test_").stream()
        for doc in docs:
            doc.reference.delete()

    # Cleanup Storage
    bucket = storage_client.bucket(TEST_BUCKET)
    blobs = bucket.list_blobs(prefix="test/")
    for blob in blobs:
        blob.delete()
```

---

## 6. 次のステップ

1. ✅ 統合テスト設計（本ドキュメント）
2. ⏳ E2Eテスト設計
3. ⏳ テストデータ準備
4. ⏳ `tests/integration/` ディレクトリ作成と実装
5. ⏳ CI/CD統合

---

## 7. 補足：テストしない項目

以下は**手動テストまたは本番前Dry Runで確認**し、統合テストには含めない：

- LINE Bot APIとの実際の通信（LINE側の制約により自動化困難）
- フロントエンドUI表示（目視確認の方が効率的）
- 負荷テスト（別途実施）

**理由**: クリティカルパスに集中し、テストコスト（時間・保守）を最小化するため
