# GCP環境構築ガイド

## 前提条件

- Googleアカウント
- クレジットカード（GCP無料トライアル登録用）
- gcloud CLIインストール済み

## 1. GCPプロジェクト作成

### 1.1 GCPコンソールからプロジェクト作成

1. [GCP Console](https://console.cloud.google.com/)にアクセス
2. 画面上部の「プロジェクトを選択」をクリック
3. 「新しいプロジェクト」をクリック
4. プロジェクト名を入力: `wedding-smile-catcher`
5. 「作成」をクリック

### 1.2 gcloud CLIからプロジェクト作成（代替）

```bash
# プロジェクト作成
gcloud projects create wedding-smile-catcher \
  --name="Wedding Smile Catcher" \
  --set-as-default

# プロジェクトIDを環境変数に設定
export PROJECT_ID=wedding-smile-catcher
export REGION=asia-northeast1
export ZONE=asia-northeast1-a
```

### 1.3 請求先アカウントの設定

```bash
# 請求先アカウント一覧を表示
gcloud billing accounts list

# プロジェクトに請求先アカウントを紐付け
gcloud billing projects link ${PROJECT_ID} \
  --billing-account=BILLING_ACCOUNT_ID
```

## 2. 必要なAPIの有効化

### 2.1 一括有効化

```bash
gcloud services enable \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  vision.googleapis.com \
  aiplatform.googleapis.com \
  storage.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  --project=${PROJECT_ID}
```

### 2.2 有効化の確認

```bash
# 有効なAPIのリスト
gcloud services list --enabled --project=${PROJECT_ID}
```

## 3. Firestoreの初期化

### 3.1 Firestoreモードの選択

```bash
# Nativeモードで初期化（推奨）
gcloud firestore databases create \
  --location=${REGION} \
  --type=firestore-native \
  --project=${PROJECT_ID}
```

### 3.2 インデックスの作成

```bash
# firestore.indexes.jsonを作成
cat > firestore.indexes.json <<EOF
{
  "indexes": [
    {
      "collectionGroup": "images",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "status", "order": "ASCENDING"},
        {"fieldPath": "total_score", "order": "DESCENDING"},
        {"fieldPath": "upload_timestamp", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "images",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "user_id", "order": "ASCENDING"},
        {"fieldPath": "upload_timestamp", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "images",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "is_similar", "order": "ASCENDING"},
        {"fieldPath": "total_score", "order": "DESCENDING"}
      ]
    }
  ]
}
EOF

# インデックスをデプロイ
gcloud firestore indexes create firestore.indexes.json --project=${PROJECT_ID}
```

## 4. Cloud Storageバケットの作成

### 4.1 バケット作成

```bash
# 画像保存用バケット
gsutil mb -l ${REGION} -c STANDARD gs://wedding-smile-images-${PROJECT_ID}

# バックアップ用バケット
gsutil mb -l ${REGION} -c NEARLINE gs://wedding-smile-backup-${PROJECT_ID}
```

### 4.2 ライフサイクルポリシーの設定

```bash
# ライフサイクルポリシーファイルを作成
cat > lifecycle.json <<EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {
          "type": "SetStorageClass",
          "storageClass": "NEARLINE"
        },
        "condition": {
          "age": 30
        }
      },
      {
        "action": {
          "type": "Delete"
        },
        "condition": {
          "age": 365
        }
      }
    ]
  }
}
EOF

# ポリシーを適用
gsutil lifecycle set lifecycle.json gs://wedding-smile-images-${PROJECT_ID}
```

### 4.3 CORS設定（フロントエンドから画像アクセス）

```bash
# CORS設定ファイルを作成
cat > cors.json <<EOF
[
  {
    "origin": ["*"],
    "method": ["GET"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
EOF

# CORS設定を適用
gsutil cors set cors.json gs://wedding-smile-images-${PROJECT_ID}
```

## 5. Secret Managerの設定

### 5.1 LINE認証情報の保存

```bash
# LINE Channel Secretを保存
echo -n "YOUR_LINE_CHANNEL_SECRET" | \
  gcloud secrets create line-channel-secret \
  --data-file=- \
  --project=${PROJECT_ID}

# LINE Channel Access Tokenを保存
echo -n "YOUR_LINE_CHANNEL_ACCESS_TOKEN" | \
  gcloud secrets create line-channel-access-token \
  --data-file=- \
  --project=${PROJECT_ID}
```

### 5.2 シークレットへのアクセス権限設定

```bash
# Cloud Functions用サービスアカウントに権限付与
gcloud secrets add-iam-policy-binding line-channel-secret \
  --member="serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=${PROJECT_ID}

gcloud secrets add-iam-policy-binding line-channel-access-token \
  --member="serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=${PROJECT_ID}
```

## 6. サービスアカウントの作成

### 6.1 Webhook Function用

```bash
gcloud iam service-accounts create webhook-function-sa \
  --display-name="Webhook Function Service Account" \
  --project=${PROJECT_ID}

# 必要な権限を付与
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:webhook-function-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectCreator"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:webhook-function-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/datastore.user"
```

### 6.2 Scoring Function用

```bash
gcloud iam service-accounts create scoring-function-sa \
  --display-name="Scoring Function Service Account" \
  --project=${PROJECT_ID}

# 必要な権限を付与
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:scoring-function-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:scoring-function-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:scoring-function-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/cloudvision.user"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:scoring-function-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

## 7. Cloud Monitoringの設定

### 7.1 アラートポリシーの作成

```bash
# エラー率が10%を超えたらアラート
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="High Error Rate" \
  --condition-display-name="Error rate > 10%" \
  --condition-threshold-value=0.1 \
  --condition-threshold-duration=60s \
  --project=${PROJECT_ID}
```

### 7.2 予算アラートの設定

```bash
# 月間予算を$10に設定
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="Wedding Smile Catcher Budget" \
  --budget-amount=10USD \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90 \
  --threshold-rule=percent=100
```

## 8. 環境変数ファイルの作成

### 8.1 プロジェクトルートに.envファイル作成

```bash
cat > .env <<EOF
# GCP Configuration
GCP_PROJECT_ID=${PROJECT_ID}
GCP_REGION=${REGION}
GCP_ZONE=${ZONE}

# LINE Bot Configuration
LINE_CHANNEL_SECRET=your-line-channel-secret
LINE_CHANNEL_ACCESS_TOKEN=your-line-channel-access-token

# Cloud Storage
STORAGE_BUCKET=wedding-smile-images-${PROJECT_ID}

# Vertex AI
VERTEX_AI_MODEL=gemini-1.5-flash

# Scoring Parameters
SIMILARITY_THRESHOLD=8
SIMILARITY_PENALTY=0.33
EOF
```

### 8.2 .gitignoreに追加

```bash
echo ".env" >> .gitignore
```

## 9. 動作確認

### 9.1 Firestoreへの接続確認

```python
# test_firestore.py
from google.cloud import firestore

db = firestore.Client(project="wedding-smile-catcher")

# テストドキュメント作成
doc_ref = db.collection('test').document('test_doc')
doc_ref.set({'message': 'Hello Firestore'})

# テストドキュメント読み取り
doc = doc_ref.get()
print(doc.to_dict())

# テストドキュメント削除
doc_ref.delete()
print("Firestore connection successful!")
```

実行:
```bash
python test_firestore.py
```

### 9.2 Cloud Storageへの接続確認

```bash
# テストファイルアップロード
echo "test" > test.txt
gsutil cp test.txt gs://wedding-smile-images-${PROJECT_ID}/test.txt

# テストファイル削除
gsutil rm gs://wedding-smile-images-${PROJECT_ID}/test.txt

echo "Cloud Storage connection successful!"
```

### 9.3 Vision APIの動作確認

```python
# test_vision.py
from google.cloud import vision

client = vision.ImageAnnotatorClient()

# サンプル画像でテスト
with open('sample_image.jpg', 'rb') as f:
    content = f.read()

image = vision.Image(content=content)
response = client.face_detection(image=image)

print(f"Detected {len(response.face_annotations)} faces")
print("Vision API connection successful!")
```

実行:
```bash
python test_vision.py
```

## 10. デプロイ準備

### 10.1 gcloud CLIの認証設定

```bash
# 認証
gcloud auth login

# アプリケーションデフォルト認証
gcloud auth application-default login

# デフォルトプロジェクト設定
gcloud config set project ${PROJECT_ID}
gcloud config set compute/region ${REGION}
gcloud config set compute/zone ${ZONE}
```

### 10.2 Cloud Buildの有効化

```bash
# Cloud Buildサービスアカウントに権限付与
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

## トラブルシューティング

### API有効化エラー

```bash
# エラー: API not enabled
# 解決: 手動で有効化
gcloud services enable SERVICE_NAME.googleapis.com --project=${PROJECT_ID}
```

### 権限エラー

```bash
# エラー: Permission denied
# 解決: IAMロールを確認
gcloud projects get-iam-policy ${PROJECT_ID}
```

### Firestore初期化エラー

```bash
# エラー: Database already exists
# 解決: すでに初期化済み（問題なし）
```

## 次のステップ

- [LINE Bot設定](line-bot-setup.md)
- [ローカル開発環境構築](local-dev.md)
- [Cloud Functionsデプロイ](../api/webhook.md#デプロイ)
