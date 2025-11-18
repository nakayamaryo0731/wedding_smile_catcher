# LINE Bot セットアップガイド

## 前提条件

- LINE Developersアカウント（LINEアカウントがあれば作成可能）
- GCP環境が構築済み（[GCPセットアップガイド](gcp-setup.md)参照）

## 1. LINE Developersコンソールへのアクセス

### 1.1 LINE Developersアカウント作成

1. [LINE Developers](https://developers.line.biz/)にアクセス
2. 「ログイン」をクリック
3. LINEアカウントでログイン
4. 開発者登録フォームに入力
   - 名前（必須）
   - メールアドレス（必須）

## 2. プロバイダーの作成

### 2.1 新規プロバイダー作成

1. コンソール画面で「プロバイダーを作成」をクリック
2. プロバイダー名を入力: `Wedding Smile Catcher`
3. 「作成」をクリック

## 3. Messaging APIチャネルの作成

### 3.1 チャネル基本設定

1. プロバイダー画面で「Messaging APIチャネルを作成」をクリック
2. チャネル情報を入力:

| 項目 | 値 |
|------|-----|
| チャネルアイコン | 任意の画像（結婚式のイメージ）|
| チャネル名 | `Wedding Smile Catcher Bot` |
| チャネル説明 | `結婚式で笑顔の写真を集めるLINE Bot` |
| 大業種 | `個人` |
| 小業種 | `個人（その他）` |
| メールアドレス | あなたのメールアドレス |

3. 利用規約に同意して「作成」をクリック

### 3.2 チャネル設定の確認

作成後、以下の情報を確認：

- **Channel ID**: チャネルの一意識別子
- **Channel Secret**: Webhook検証用の秘密鍵
- **Channel Access Token**: API呼び出し用のトークン（後で発行）

## 4. Messaging API設定

### 4.1 基本設定タブ

1. 「Messaging API」タブを開く
2. 以下を設定：

| 項目 | 設定値 |
|------|--------|
| 応答メッセージ | オフ（Webhookで処理） |
| あいさつメッセージ | オフ |
| Webhook | 有効（オン） |

### 4.2 Channel Access Tokenの発行

1. 「Messaging API設定」セクションで「Channel access token (long-lived)」の「発行」をクリック
2. 発行されたトークンをコピーして安全に保管

```bash
# .envファイルに追加
echo "LINE_CHANNEL_ACCESS_TOKEN=YOUR_ACCESS_TOKEN_HERE" >> .env
```

### 4.3 Channel Secretの取得

1. 「Basic settings」タブを開く
2. 「Channel secret」をコピー

```bash
# .envファイルに追加
echo "LINE_CHANNEL_SECRET=YOUR_CHANNEL_SECRET_HERE" >> .env
```

## 5. Webhook URLの設定

### 5.1 Cloud FunctionのデプロイとURL取得

まず、Webhook FunctionをデプロイしてURLを取得します。

```bash
# プロジェクトルートから実行
cd src/functions/webhook

# Cloud Functionデプロイ
gcloud functions deploy webhook \
  --gen2 \
  --runtime=python311 \
  --region=asia-northeast1 \
  --source=. \
  --entry-point=webhook \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars="LINE_CHANNEL_SECRET=${LINE_CHANNEL_SECRET},LINE_CHANNEL_ACCESS_TOKEN=${LINE_CHANNEL_ACCESS_TOKEN}" \
  --project=${GCP_PROJECT_ID}

# デプロイ完了後、URLが表示される
# 例: https://asia-northeast1-wedding-smile-catcher.cloudfunctions.net/webhook
```

### 5.2 LINE DevelopersでWebhook URLを設定

1. LINE Developers「Messaging API」タブを開く
2. 「Webhook URL」に上記で取得したURLを入力
   ```
   https://asia-northeast1-{project-id}.cloudfunctions.net/webhook
   ```
3. 「Verify」ボタンをクリックして接続確認
4. 「Success」と表示されればOK
5. 「Webhookの利用」をオンにする

### 5.3 Webhook検証テスト

```bash
# 手動でWebhookをテスト
curl -X POST https://asia-northeast1-{project-id}.cloudfunctions.net/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "events": []
  }'

# レスポンス例:
# {"status": "ok"}
```

## 6. 応答設定のカスタマイズ

### 6.1 応答メッセージをオフにする

LINE Developersの自動応答をオフにして、Webhookのみで制御します。

1. 「Messaging API設定」タブを開く
2. 「応答メッセージ」セクション
3. 「詳細設定」をクリック
4. 「応答メッセージ」をオフ
5. 「Webhook」をオン

## 7. 友だち追加QRコードの作成

### 7.1 QRコード取得

1. 「Messaging API」タブを開く
2. 「Bot basic ID」または「Bot QR code」セクション
3. QRコードをダウンロード

### 7.2 受付用案内資料の作成（オプション）

Canvaなどで受付用の説明書を作成：

```
┌─────────────────────────────┐
│  Wedding Smile Catcher      │
│                             │
│  [QRコード]                  │
│                             │
│  1. QRコードを読み取る        │
│  2. お名前を送信する          │
│  3. 笑顔の写真を撮って送る    │
│                             │
│  💡 ヒント:                  │
│  ・大人数で写るほど高スコア！  │
│  ・自然な笑顔がポイント        │
└─────────────────────────────┘
```

## 8. Bot情報の設定

### 8.1 プロフィール設定

1. 「Messaging API」タブを開く
2. 「Bot情報」セクション
3. 以下を設定：

| 項目 | 設定値 |
|------|--------|
| ボット名 | Wedding Smile Catcher |
| 説明 | 笑顔の写真を送ると、AIがスコアリング！トップ3を目指そう🏆 |
| プロフィール画像 | 結婚式のイメージ画像 |

## 9. リッチメニューの作成（オプション）

### 9.1 リッチメニュー画像の準備

サイズ: 2500px × 1686px または 2500px × 843px

セクション例:
```
┌──────────┬──────────┬──────────┐
│ ヘルプ    │ ランキング │ ルール    │
└──────────┴──────────┴──────────┘
```

### 9.2 LINE Messaging API SDKでリッチメニュー作成

```python
# create_rich_menu.py
from linebot import LineBotApi
from linebot.models import (
    RichMenu, RichMenuSize, RichMenuArea, RichMenuBounds,
    MessageAction
)

line_bot_api = LineBotApi('YOUR_CHANNEL_ACCESS_TOKEN')

rich_menu = RichMenu(
    size=RichMenuSize(width=2500, height=843),
    selected=True,
    name="Wedding Smile Catcher Menu",
    chat_bar_text="メニュー",
    areas=[
        RichMenuArea(
            bounds=RichMenuBounds(x=0, y=0, width=833, height=843),
            action=MessageAction(label='ヘルプ', text='ヘルプ')
        ),
        RichMenuArea(
            bounds=RichMenuBounds(x=833, y=0, width=834, height=843),
            action=MessageAction(label='ランキング', text='ランキング')
        ),
        RichMenuArea(
            bounds=RichMenuBounds(x=1667, y=0, width=833, height=843),
            action=MessageAction(label='ルール', text='使い方')
        )
    ]
)

# リッチメニュー作成
rich_menu_id = line_bot_api.create_rich_menu(rich_menu=rich_menu)

# 画像アップロード
with open('rich_menu.png', 'rb') as f:
    line_bot_api.set_rich_menu_image(rich_menu_id, 'image/png', f)

# デフォルトリッチメニューに設定
line_bot_api.set_default_rich_menu(rich_menu_id)

print(f"Rich menu created: {rich_menu_id}")
```

実行:
```bash
python create_rich_menu.py
```

## 10. 動作確認

### 10.1 Botを友だち追加

1. スマートフォンでQRコードを読み取る
2. 「追加」をクリック
3. 登録案内メッセージが届くことを確認

### 10.2 テスト投稿

#### テスト1: 名前登録
1. テキストで「テスト太郎」と送信
2. 登録完了メッセージが届くことを確認

#### テスト2: 画像投稿
1. 笑顔の写真を送信
2. ローディングメッセージが届くことを確認
3. スコア結果が返信されることを確認（15-30秒後）

### 10.3 ログ確認

```bash
# Cloud Functionsのログ確認
gcloud functions logs read webhook \
  --region=asia-northeast1 \
  --limit=50 \
  --project=${GCP_PROJECT_ID}
```

## 11. 本番運用前のチェックリスト

- [ ] Webhook URLが正しく設定されている
- [ ] Webhook検証がSuccessになっている
- [ ] Channel Access Tokenが正しく環境変数に設定されている
- [ ] Channel Secretが正しく環境変数に設定されている
- [ ] 応答メッセージがオフになっている
- [ ] Webhookがオンになっている
- [ ] 友だち追加で登録案内メッセージが届く
- [ ] テキスト送信でユーザー登録ができる
- [ ] 画像送信でスコアリングが実行される
- [ ] Cloud Functionsのログにエラーがない

## 12. トラブルシューティング

### Webhook検証が失敗する

**原因**:
- Cloud FunctionのURLが間違っている
- 署名検証が失敗している

**解決**:
```bash
# Cloud FunctionのURLを確認
gcloud functions describe webhook \
  --region=asia-northeast1 \
  --project=${GCP_PROJECT_ID} \
  --format='value(url)'

# 環境変数を確認
gcloud functions describe webhook \
  --region=asia-northeast1 \
  --project=${GCP_PROJECT_ID} \
  --format='value(environmentVariables)'
```

### メッセージが返信されない

**原因**:
- Scoring Functionのエラー
- Firestoreへの書き込みエラー

**解決**:
```bash
# Scoring Functionのログ確認
gcloud functions logs read scoring \
  --region=asia-northeast1 \
  --limit=50 \
  --project=${GCP_PROJECT_ID}

# Firestoreのドキュメント確認（GCPコンソール）
```

### Channel Access Token が無効

**原因**:
- トークンの有効期限切れ（通常は無期限だが...）
- トークンの再発行

**解決**:
1. LINE Developersで新しいトークンを発行
2. 環境変数を更新
3. Cloud Functionを再デプロイ

## 次のステップ

- [ローカル開発環境構築](local-dev.md)
- [Webhook API仕様](../api/webhook.md)
