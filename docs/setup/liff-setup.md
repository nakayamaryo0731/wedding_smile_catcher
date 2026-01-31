# LIFF セットアップガイド

LIFFを使用すると、ゲストがQRコードを読み取った際に自動でイベントに参加できます。

## 概要

**従来のフロー:**
```
QRコード → LINE開く → 「JOIN xxx」が入力済み → 送信ボタンを押す
```

**LIFFフロー:**
```
QRコード → LIFF開く → 自動で参加処理 → 完了画面
```

## 前提条件

- LINE Developers アカウント
- 既存の Messaging API チャネル（LINE Bot）が設定済み
- Firebase Hosting にデプロイ済み

## セットアップ手順

### Step 1: LINE Developers コンソールにアクセス

1. [LINE Developers Console](https://developers.line.biz/console/) を開く
2. LINEアカウントでログイン

### Step 2: プロバイダーを確認

1. 左メニューから既存の LINE Bot があるプロバイダーを選択
   - **重要**: LINE Bot と同じプロバイダー内に LIFF を作成する必要があります
   - 異なるプロバイダーだとボットリンク機能が動作しません

2. プロバイダー名を確認（例: `Wedding Smile Catcher`）

### Step 3: LINE ログインチャネルを新規作成

1. プロバイダー画面で「チャネル設定」タブを選択
1. 「新規チャネル作成」ボタンをクリック
1. チャネルタイプで **「LINEログイン」** を選択（Messaging API ではありません）
1. 以下の情報を入力して「作成」をクリック:

| 項目 | 入力値 |
|------|--------|
| チャネル名 | `笑顔写真コンテスト LIFF` |
| チャネル説明 | `イベント自動参加用のLIFFアプリ` |
| アプリタイプ | `ウェブアプリ` にチェック |
| メールアドレス | あなたのメールアドレス |
| プライバシーポリシーURL | （空欄でOK） |
| サービス利用規約URL | （空欄でOK） |

### Step 4: チャネルを公開状態にする

1. 作成したチャネルの「チャネル基本設定」タブを開く
2. 画面上部の「非公開」ステータスを確認
3. 「公開」ボタンをクリック
4. 確認ダイアログで「公開」を選択

> ⚠️ **注意**: 非公開のままだと LIFF が動作しません

### Step 5: LIFF アプリを追加

1. チャネル画面で「LIFF」タブを選択
1. 「追加」ボタンをクリック
1. 以下の情報を入力して「追加」をクリック:

| 項目 | 設定値 | 説明 |
|------|--------|------|
| LIFFアプリ名 | `イベント参加` | 任意の名前 |
| サイズ | `Full` | 全画面表示 |
| エンドポイントURL | `https://smile-photo-contest.web.app/liff/join.html` | デプロイ先のURL |
| Scope | `profile` をチェック | ユーザー情報取得に必要 |
| ボットリンク機能 | `On (Aggressive)` | **重要**: これがないと sendMessages が動作しない |
| Scan QR | `On` | QRコード読み取り対応 |

### Step 6: LIFF ID をコピー

1. LIFF アプリ一覧に追加されたアプリが表示される
2. **LIFF ID** をコピー
   - 形式: `1234567890-xxxxxxxx`（数字-英数字の形式）

### Step 7: Linked Bot を設定

1. 追加した LIFF アプリの詳細画面を開く
2. 「Linked Bot」セクションを確認
3. 「編集」をクリック
4. 同じプロバイダー内の LINE Bot（Messaging API チャネル）を選択
5. 「保存」をクリック

> ⚠️ **重要**: Linked Bot を設定しないと `liff.sendMessages()` でエラーになります

### Step 8: config.js を更新

`src/frontend/js/config.js` の `LIFF_ID` を設定:

```javascript
// LIFF ID for automatic event joining (set after LINE Developers setup)
// Format: "1234567890-xxxxxxxx"
window.LIFF_ID = "ここにコピーしたLIFF IDを貼り付け";
```

### Step 9: デプロイ

```bash
git add src/frontend/js/config.js
git commit -m "feat: configure LIFF ID for auto-join"
git push
```

GitHub Actions によって自動デプロイされます。

## 動作確認

### テスト手順

1. ランキング画面を開く: <https://smile-photo-contest.web.app/ranking.html>
2. 管理画面でイベントを作成または選択
3. 表示された QR コードをスマホで読み取る
   - **LINE アプリの QR リーダー**または**カメラアプリ**で読み取り
4. LINE アプリ内で LIFF 画面が開く
5. 「参加処理中...」が表示される
6. 自動で JOIN メッセージが送信される
7. 「参加完了！」画面が表示される
8. 「LINEに戻る」をタップするとトーク画面に戻る

### 確認ポイント

- [ ] QR コードが LIFF URL 形式になっている（`https://liff.line.me/...`）
- [ ] LIFF 画面が LINE 内で全画面表示される
- [ ] 自動で参加処理が完了する
- [ ] LINE Bot からの応答メッセージが届く

## トラブルシューティング

### 「LINEで開いてください」と表示される

**原因**: LIFF は LINE アプリ内でのみ動作します

**対処**:
- QR コードを LINE アプリの QR リーダーで読み取る
- または、カメラアプリで読み取り → LINE で開くを選択

### 「LIFF IDが設定されていません」

**原因**: config.js の LIFF_ID が空

**対処**:
1. LINE Developers で LIFF ID を確認
2. config.js に設定
3. 再デプロイ

### 「メッセージの送信権限がありません」

**原因**: ボットリンク機能の設定不備

**対処**:
1. LIFF アプリの「ボットリンク機能」が `On (Aggressive)` か確認
2. 「Linked Bot」に正しい LINE Bot が設定されているか確認
3. LINE Bot を友だち追加しているか確認

### QR コードが従来の deep link のまま

**原因**: LIFF_ID が空文字または undefined

**対処**:
1. config.js の LIFF_ID が正しく設定されているか確認
2. デプロイが完了しているか確認
3. ブラウザをハードリロード（Ctrl+Shift+R / Cmd+Shift+R）

### LIFF 初期化エラー

**原因**: エンドポイント URL の不一致

**対処**:
1. LINE Developers の LIFF 設定でエンドポイント URL を確認
2. 実際のデプロイ URL と一致しているか確認
3. HTTPS であることを確認（HTTP は非対応）

## 設定値一覧

| 項目 | 値 |
|------|-----|
| チャネルタイプ | LINE ログイン |
| LIFF サイズ | Full |
| エンドポイント URL | `https://smile-photo-contest.web.app/liff/join.html` |
| Scope | profile |
| ボットリンク機能 | On (Aggressive) |
| Scan QR | On |

## 補足

- LIFF ID が設定されていない場合、従来の deep link 方式に自動フォールバック
- イベント名も URL パラメータで渡されるため、完了画面に表示される
- LIFF は無料で利用可能（追加費用なし）
