# Admin Panel

シンプルなデータ管理画面。Firestoreに保存された画像、ユーザー、イベントデータを選択して削除できます。

## アクセス方法

### ローカル環境

```bash
cd src/frontend
python3 -m http.server 8001 --bind 0.0.0.0
```

ブラウザで `http://localhost:8001/admin` にアクセス

### 本番環境

デプロイ後、`https://wedding-smile-catcher.web.app/admin` にアクセス

## 初期パスワード

デフォルトパスワード: `admin123`

**重要**: 本番環境では必ずパスワードを変更してください。

## パスワードの変更方法

1. 新しいパスワードのSHA-256ハッシュを生成:

   ```bash
   echo -n "your-new-password" | shasum -a 256
   ```

1. 出力されたハッシュ値を `src/frontend/js/admin.js` の `ADMIN_PASSWORD_HASH` 定数に設定:

   ```javascript
   const ADMIN_PASSWORD_HASH = 'your-hash-here';
   ```

1. ファイルを保存して再デプロイ

## 機能

### データ管理

- **Images**: アップロードされた画像データの表示・削除
- **Users**: ユーザー情報の表示・削除
- **Events**: イベント情報の表示・削除

### 削除仕様

- Firestoreのドキュメントのみ削除（Cloud Storageのファイルは残る）
- 最大500件まで一括削除可能
- 削除前に確認ダイアログが表示される

### セキュリティ

- SHA-256ハッシュによるパスワード認証
- セッション管理（ページリロード時も認証状態維持）
- 削除操作の確認モーダル

## トラブルシューティング

### ログインできない

- パスワードが正しいか確認
- ブラウザのコンソールでエラーを確認
- sessionStorageがクリアされているか確認

### データが表示されない

- Firestoreに実際にデータが存在するか確認
- Firebase設定（config.js）が正しいか確認
- ブラウザのコンソールでエラーを確認

### 削除が失敗する

- Firestore Security Rulesで削除が許可されているか確認
- ネットワークエラーがないか確認
- 大量データ（500件以上）を一度に削除していないか確認

## 制限事項

- 各コレクション最大500件まで表示
- Cloud Storageの画像ファイルは削除されない
- リアルタイム更新なし（手動リロードが必要）

## 参考

詳細な設計については `docs/design/admin-page.md` を参照してください。
