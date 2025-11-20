# LINE Bot Webhook 設定手順

このドキュメントでは、デプロイしたCloud FunctionsとLINE Botを接続する手順を説明します。

## 前提条件

- Terraform applyが完了していること
- 以下の情報が手元にあること:
  - Webhook URL: `https://webhook-dpi7nj7iwq-an.a.run.app`
  - LINE Channel Secret (Secret Managerに保存済み)
  - LINE Channel Access Token (Secret Managerに保存済み)

## 1. LINE Developers Console設定

### 1-1. コンソールにアクセス

1. LINE Developers Consoleを開く: https://developers.line.biz/console/
2. 対象のプロバイダーを選択
3. 対象のチャネル (Messaging API) を選択

### 1-2. Webhook URL設定

1. **「Messaging API」タブを開く**

2. **Webhook設定セクションを探す**
   - ページを下にスクロールして「Webhook settings」を探す

3. **Webhook URLを入力**
   - 「Webhook URL」の「Edit」ボタンをクリック
   - 以下のURLを入力:
     ```
     https://webhook-dpi7nj7iwq-an.a.run.app
     ```
   - 「Update」をクリック

4. **Webhookを有効化**
   - 「Use webhook」トグルを**ON**にする

5. **接続テスト**
   - 「Verify」ボタンをクリック
   - "Success"と表示されればOK
   - エラーが出る場合は、URLが正しいか、Cloud Functionがデプロイされているか確認

### 1-3. 応答設定の調整

**重要**: 自動応答メッセージを無効化しないと、Botとの二重応答になります

1. **応答メッセージをOFFにする**
   - 同じ「Messaging API」タブ内で以下を設定:
   - 「Auto-reply messages」→ **OFF** (または「Edit」→無効化)
   - 「Greeting messages」→ 任意 (友だち追加時のメッセージ)

2. **応答モードを確認**
   - 「Chat」は**OFF**推奨 (Webhook modeを使用するため)

## 2. テスト手順

### 2-1. 友だち追加

1. LINE Developers Consoleの「Messaging API」タブで「QRコード」を表示
2. スマートフォンのLINEアプリでQRコードをスキャン
3. 友だち追加

### 2-2. ユーザー登録テスト

1. Botに**テキストメッセージ**で自分の名前を送信
   - 例: `山田太郎`
2. Botから登録完了メッセージが返ってくることを確認
3. Firestoreで`users`コレクションにユーザーが登録されたか確認

### 2-3. 画像スコアリングテスト (ダミー実装)

1. Botに**画像**を送信
2. Botから以下の応答が返ってくることを確認:
   - ローディングメッセージ (「画像を処理中...」)
   - スコア結果メッセージ (ダミーのランダムスコア)
   - スコアの内訳 (笑顔スコア、AIスコア、合計スコア)

**注意**: 現在はダミー実装のため、ランダムなスコアが返されます

## 3. トラブルシューティング

### Webhook検証が失敗する

**症状**: LINE Developers ConsoleでVerifyをクリックしても成功しない

**確認項目**:
1. Webhook URLが正しいか
   ```
   https://webhook-dpi7nj7iwq-an.a.run.app
   ```
2. Cloud Functionがデプロイされているか
   ```bash
   cd terraform
   terraform output webhook_function_url
   ```
3. Cloud Functionのログを確認
   - GCP Console → Cloud Functions → webhook → Logs

### Botが応答しない

**症状**: メッセージや画像を送っても何も返ってこない

**確認項目**:
1. 「Use webhook」がONになっているか
2. 「Auto-reply messages」がOFFになっているか
3. Cloud Functionのログを確認してエラーがないか
4. Secret Managerの認証情報が正しいか

### 画像送信後にエラーが返る

**症状**: 画像を送信するとエラーメッセージが返る

**確認項目**:
1. Scoring Functionがデプロイされているか
   ```bash
   terraform output scoring_function_url
   ```
2. Webhook FunctionがScoring Functionを呼び出せる権限があるか
3. Firestoreに書き込み権限があるか
4. Cloud Storageに書き込み権限があるか

### ログの確認方法

**Cloud Functions ログ (GCP Console)**:
1. GCP Console → Cloud Functions
2. `webhook` または `scoring` を選択
3. 「LOGS」タブをクリック

**Firestore データ確認**:
1. GCP Console → Firestore Database
2. コレクション `users` と `images` を確認

**Cloud Storage 確認**:
1. GCP Console → Cloud Storage → Buckets
2. `wedding-smile-images-wedding-smile-catcher` バケットを開く
3. `images/` フォルダに画像が保存されているか確認

## 4. 次のステップ

ダミー実装での疎通が確認できたら、以下を実装:

1. **本番スコアリング実装**
   - Vision API統合 (笑顔検出)
   - Vertex AI統合 (テーマ評価)
   - Average Hash (類似画像検出)

2. **フロントエンド実装**
   - Next.jsアプリ (リアルタイムランキング表示)
   - Cloud Runへのデプロイ

3. **監視・運用**
   - Cloud Loggingでエラー監視
   - Cloud Monitoringでパフォーマンス監視

## 参考リンク

- [LINE Messaging API リファレンス](https://developers.line.biz/ja/reference/messaging-api/)
- [Cloud Functions ドキュメント](https://cloud.google.com/functions/docs)
- [Firestore ドキュメント](https://cloud.google.com/firestore/docs)
