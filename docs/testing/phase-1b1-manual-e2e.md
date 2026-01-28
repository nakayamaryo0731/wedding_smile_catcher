# Phase 1-b-1 手動E2Eテスト手順

## 前提条件

- ローカルサーバー起動済: `python3 -m http.server 8001 --directory src/frontend`
- Firebase Console にアクセス可能
- Firebase Auth のメール/パスワードプロバイダが有効
- LINE アプリがインストールされたスマートフォン

---

## 1. アカウント登録

1. `http://localhost:8001/admin.html` を開く
2. 「Sign Up」タブをクリック
3. メール・パスワード（8文字以上）・表示名を入力
4. 「Terms of Service」リンクをクリック → モーダル表示を確認
5. チェックボックスにチェック → 「Create Account」をクリック
6. 確認: 管理画面に遷移すること
7. 確認: Firebase Console の `accounts` コレクションに対応するUIDのドキュメントが作成されていること

**エラー系:**

- パスワード8文字未満 → エラーメッセージ表示
- 同じメールで再登録 → 「already registered」エラー
- チェックボックス未チェック → バリデーションエラー

## 2. ログイン・ログアウト

1. 「Logout」をクリック
2. 「Login」タブに切り替え
3. 手順1で作成したアカウントでログイン
4. 確認: 管理画面に遷移すること

## 3. イベント作成

1. 「Events」タブを開く
2. 「+ Create New Event」をクリック → フォームが展開されること
3. イベント名と日付を入力 → 「Create」をクリック
4. 確認: QRコードモーダルが自動表示されること
5. 確認: Firebase Console の `events` コレクション:
   - `status: "draft"`
   - `account_id` が自分のUID
   - `event_code` がUUID形式
   - `settings` にデフォルト値（theme, max_uploads_per_user 等）

## 4. QRコードモーダル

1. QRコード画像が表示されていること（256x256）
2. ディープリンクURLの形式: `https://line.me/R/oaMessage/@581qtuij/?text=JOIN%20...`
3. ディープリンクURLの「Copy」ボタン → クリップボードにコピーされること
4. ランキングURLの「Copy」ボタン → クリップボードにコピーされること
5. 「Download QR Code Image」→ PNG画像がダウンロードされること
6. ×ボタンまたはモーダル外クリックで閉じること

## 5. QRコード読み取り（スマホ）

1. ダウンロードしたQRコード画像をスマホで読み取り
2. 確認: LINEアプリが開き、トーク画面に `JOIN {code}` が自動入力されること
3. **まだ送信しない**（ステータスが draft のため拒否される）

## 6. テスト開始（draft → test）

1. イベント一覧でステータスバッジが「DRAFT」（黄色）であることを確認
2. 「Start Testing」ボタンをクリック → 確認ダイアログ → OK
3. 確認: ステータスバッジが「TESTING」（青色）に変更されること
4. 確認: 「Start Testing」ボタンが消え、「Contact us to activate」テキストに変わること
5. 確認: Firebase Console で `status: "test"`

## 7. LINE Bot JOIN（テストモード）

1. スマホでQRコードを再度読み取り（またはさっきの画面から）
2. `JOIN {code}` を送信
3. 確認: Bot から「お名前を送信してください」の返信があること
4. 名前を送信
5. 確認: Bot から「登録完了」の返信があること
6. 確認: Firebase Console の `users` コレクションにドキュメントが作成されていること

## 8. 有効化（test → active）

1. Firebase Console で対象イベントの `status` を `"active"` に手動変更
2. admin画面をリロード → ステータスバッジが「ACTIVE」（緑色）であること
3. 確認: 「Archive」ボタンが表示されていること

## 9. アーカイブ（active → archived）

1. 「Archive」ボタンをクリック → 確認ダイアログ → OK
2. 確認: ステータスバッジが「ARCHIVED」（グレー）に変更されること
3. 確認: アクションボタンが表示されないこと

## 10. アーカイブ後のJOIN拒否

1. スマホで同じQRコードから `JOIN {code}` を別のLINEアカウントで送信
2. 確認: Bot から「見つかりません」のエラーメッセージが返ること

---

## Firestore Security Rules 検証

| テスト | 期待結果 |
|--------|----------|
| 未認証で `accounts` 読み取り | 拒否 |
| 他人のアカウント読み取り | 拒否 |
| 自分のアカウントドキュメント作成 | 許可 |
| 自分のアカウントドキュメント読み取り | 許可 |
| 他人のイベント更新 | 拒否 |
| 自分の `account_id` でイベント作成 | 許可 |
