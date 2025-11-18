# ローカル開発環境構築ガイド

## 前提条件

- Python 3.11以上
- Node.js 20以上
- Git
- gcloud CLI
- Docker（オプション）

## 1. リポジトリのクローン

```bash
# リポジトリをクローン
git clone <repository-url>
cd wedding_smile_catcher

# ブランチ確認
git branch
```

## 2. Python環境のセットアップ

### 2.1 仮想環境の作成

```bash
# 仮想環境作成
python3 -m venv venv

# 仮想環境の有効化
# macOS/Linux
source venv/bin/activate

# Windows
venv\Scripts\activate
```

### 2.2 依存パッケージのインストール

```bash
# requirements.txtを作成（初回のみ）
cat > requirements.txt <<EOF
google-cloud-firestore==2.14.0
google-cloud-storage==2.14.0
google-cloud-vision==3.5.0
google-cloud-aiplatform==1.39.0
google-cloud-secret-manager==2.17.0
line-bot-sdk==3.6.0
pillow==10.1.0
imagehash==4.3.1
flask==3.0.0
functions-framework==3.5.0
python-dotenv==1.0.0
EOF

# パッケージインストール
pip install -r requirements.txt
```

## 3. Node.js環境のセットアップ（フロントエンド）

### 3.1 フロントエンドディレクトリに移動

```bash
cd src/frontend
```

### 3.2 package.jsonの作成

```bash
# package.jsonを作成
cat > package.json <<EOF
{
  "name": "wedding-smile-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.0.4",
    "react": "^18",
    "react-dom": "^18",
    "firebase": "^10.7.1",
    "@google-cloud/storage": "^7.7.0"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10.0.1",
    "postcss": "^8",
    "tailwindcss": "^3.3.0",
    "eslint": "^8",
    "eslint-config-next": "14.0.4"
  }
}
EOF
```

### 3.3 パッケージインストール

```bash
npm install
```

## 4. 環境変数の設定

### 4.1 .envファイルの作成

```bash
# プロジェクトルートで.env.exampleをコピー
cd ../..  # プロジェクトルートに戻る
cp .env.example .env
```

### 4.2 .envファイルの編集

```bash
# エディタで.envを開く
nano .env

# 以下の値を実際の値に置き換え
GCP_PROJECT_ID=your-actual-project-id
LINE_CHANNEL_SECRET=your-actual-channel-secret
LINE_CHANNEL_ACCESS_TOKEN=your-actual-access-token
```

## 5. GCP認証の設定

### 5.1 サービスアカウントキーの作成

```bash
# サービスアカウント作成（開発用）
gcloud iam service-accounts create dev-local \
  --display-name="Local Development Service Account" \
  --project=${GCP_PROJECT_ID}

# 必要な権限を付与
gcloud projects add-iam-policy-binding ${GCP_PROJECT_ID} \
  --member="serviceAccount:dev-local@${GCP_PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/owner"

# キーファイルのダウンロード
gcloud iam service-accounts keys create service-account-key.json \
  --iam-account=dev-local@${GCP_PROJECT_ID}.iam.gserviceaccount.com \
  --project=${GCP_PROJECT_ID}
```

### 5.2 認証情報の設定

```bash
# 環境変数に設定
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/service-account-key.json"

# .envに追加
echo "GOOGLE_APPLICATION_CREDENTIALS=${PWD}/service-account-key.json" >> .env
```

## 6. ローカルでCloud Functionsを実行

### 6.1 Functions Frameworkの使用

```bash
# Webhook Functionをローカルで起動
cd src/functions/webhook

# 環境変数を読み込み
source ../../../.env

# Functions Framework で起動
functions-framework --target=webhook --port=8080
```

別のターミナルで:
```bash
# テストリクエスト
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{
    "events": []
  }'
```

### 6.2 Scoring Functionをローカルで起動

```bash
cd src/functions/scoring

# Functions Framework で起動
functions-framework --target=scoring --port=8081
```

テスト:
```bash
curl -X POST http://localhost:8081 \
  -H "Content-Type: application/json" \
  -d '{
    "image_id": "test_image_id",
    "user_id": "test_user_id"
  }'
```

## 7. ngrokでローカル環境を公開

### 7.1 ngrokのインストール

```bash
# Homebrewでインストール（macOS）
brew install ngrok

# または公式サイトからダウンロード
# https://ngrok.com/download
```

### 7.2 ngrokでトンネルを作成

```bash
# Webhook Functionを公開
ngrok http 8080
```

出力例:
```
Forwarding  https://abcd1234.ngrok.io -> http://localhost:8080
```

### 7.3 LINE DevelopersでWebhook URLを更新

1. LINE Developersコンソールを開く
2. Webhook URLを `https://abcd1234.ngrok.io` に変更
3. 「Verify」をクリック

**注意**: ngrokの無料版ではセッションごとにURLが変わります。

## 8. フロントエンドの開発サーバー起動

### 8.1 開発サーバー起動

```bash
cd src/frontend

# 開発サーバー起動
npm run dev
```

ブラウザで `http://localhost:3000` にアクセス

### 8.2 ランキング画面確認

```
http://localhost:3000
```

## 9. Firestoreエミュレータの使用（オプション）

### 9.1 Firebase CLIのインストール

```bash
npm install -g firebase-tools
```

### 9.2 Firebaseプロジェクトの初期化

```bash
# プロジェクトルートで
firebase init

# 選択オプション:
# - Firestore
# - Emulators

# Firestoreエミュレータを選択
```

### 9.3 エミュレータの起動

```bash
# エミュレータ起動
firebase emulators:start

# 出力例:
# ┌─────────────┬────────────────┬─────────────────────────────────┐
# │ Emulator    │ Host:Port      │ View in Emulator UI             │
# ├─────────────┼────────────────┼─────────────────────────────────┤
# │ Firestore   │ 127.0.0.1:8080 │ http://127.0.0.1:4000/firestore │
# └─────────────┴────────────────┴─────────────────────────────────┘
```

### 9.4 コードでエミュレータを使用

```python
# Python
import os
os.environ["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:8080"

from google.cloud import firestore
db = firestore.Client(project="wedding-smile-catcher")
```

```typescript
// TypeScript/JavaScript
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

if (process.env.NODE_ENV === 'development') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
```

## 10. テストデータの作成

### 10.1 テストユーザーの作成

```python
# scripts/create_test_data.py
from google.cloud import firestore

db = firestore.Client(project="wedding-smile-catcher")

# テストユーザー作成
users = [
    {"name": "テスト太郎", "line_user_id": "U_test_001", "total_uploads": 0, "best_score": 0},
    {"name": "テスト花子", "line_user_id": "U_test_002", "total_uploads": 0, "best_score": 0},
]

for i, user in enumerate(users):
    db.collection('users').document(f'test_user_{i+1}').set(user)
    print(f"Created user: {user['name']}")
```

実行:
```bash
python scripts/create_test_data.py
```

### 10.2 テスト画像の作成

```python
# scripts/create_test_images.py
from google.cloud import firestore, storage
import random

db = firestore.Client(project="wedding-smile-catcher")
storage_client = storage.Client()
bucket = storage_client.bucket("wedding-smile-images-{project-id}")

# テスト画像データ
test_images = [
    {
        "user_id": "test_user_1",
        "smile_score": random.uniform(200, 500),
        "ai_score": random.randint(60, 100),
        "total_score": 0,
        "comment": "素晴らしい笑顔です！",
        "face_count": random.randint(1, 10),
        "is_similar": False,
        "status": "completed"
    }
    for _ in range(10)
]

# 総合スコア計算
for img in test_images:
    img['total_score'] = img['smile_score'] * img['ai_score'] / 100

# Firestoreに保存
for i, img_data in enumerate(test_images):
    db.collection('images').document(f'test_img_{i+1}').set(img_data)
    print(f"Created test image {i+1}")
```

実行:
```bash
python scripts/create_test_images.py
```

## 11. デバッグツール

### 11.1 VS Code デバッグ設定

`.vscode/launch.json`を作成:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: Webhook Function",
      "type": "python",
      "request": "launch",
      "module": "functions_framework",
      "args": [
        "--target=webhook",
        "--port=8080"
      ],
      "cwd": "${workspaceFolder}/src/functions/webhook",
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "${workspaceFolder}/service-account-key.json"
      }
    },
    {
      "name": "Next.js: Frontend",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "cwd": "${workspaceFolder}/src/frontend",
      "port": 9229
    }
  ]
}
```

### 11.2 Cloud Loggingの確認

```bash
# ローカルからCloud Loggingを確認
gcloud logging read "resource.type=cloud_function" \
  --limit=50 \
  --format=json \
  --project=${GCP_PROJECT_ID}
```

## 12. よくある問題と解決方法

### 認証エラー

```
Error: Could not load the default credentials
```

**解決**:
```bash
gcloud auth application-default login
```

### パッケージインポートエラー

```
ModuleNotFoundError: No module named 'google.cloud'
```

**解決**:
```bash
# 仮想環境が有効化されているか確認
which python

# 再インストール
pip install --upgrade -r requirements.txt
```

### Firestore接続エラー

```
Error: Failed to connect to Firestore
```

**解決**:
```bash
# GOOGLE_APPLICATION_CREDENTIALS を確認
echo $GOOGLE_APPLICATION_CREDENTIALS

# サービスアカウントキーが存在するか確認
ls -la service-account-key.json
```

### ngrok URLが変わる

ngrok無料版では起動ごとにURLが変わります。

**解決**:
- ngrok有料版を使用（固定URL）
- またはローカルテスト時のみFirestoreエミュレータを使用

## 13. コードフォーマット・リント

### 13.1 Pythonフォーマット

```bash
# black のインストール
pip install black

# フォーマット実行
black src/functions/
```

### 13.2 TypeScriptリント

```bash
cd src/frontend

# リント実行
npm run lint
```

## 次のステップ

- [GCPセットアップガイド](gcp-setup.md)
- [LINE Botセットアップガイド](line-bot-setup.md)
- [Webhook API仕様](../api/webhook.md)
