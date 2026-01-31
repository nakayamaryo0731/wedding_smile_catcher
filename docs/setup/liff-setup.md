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

## セットアップ手順

### 1. LINE Developersでチャネル作成

1. [LINE Developers](https://developers.line.biz/) にログイン
2. プロバイダーを選択（または新規作成）
3. 「新規チャネル作成」→「LINEログイン」を選択
4. 以下を入力:
   - チャネル名: `笑顔写真コンテスト LIFF`
   - チャネル説明: `イベント参加用LIFF`
   - アプリタイプ: `ウェブアプリ`
5. 作成後、チャネルを公開（Published）に変更

### 2. LIFFアプリを追加

1. 作成したLINEログインチャネルの「LIFF」タブを開く
2. 「追加」をクリック
3. 以下を入力:
   - LIFFアプリ名: `イベント参加`
   - サイズ: `Full`（全画面）
   - エンドポイントURL: `https://smile-photo-contest.web.app/liff/join.html`
   - Scope: `profile` をチェック
   - ボットリンク機能: `On (Aggressive)`
   - Scan QR: `On`
4. 「追加」をクリック
5. 生成された **LIFF ID** をコピー（例: `1234567890-xxxxxxxx`）

### 3. config.jsを更新

`src/frontend/js/config.js` の `LIFF_ID` を設定:

```javascript
window.LIFF_ID = "1234567890-xxxxxxxx";
```

### 4. デプロイ

```bash
git add -A
git commit -m "feat: configure LIFF ID for auto-join"
git push
```

## 動作確認

1. ランキング画面を開く
2. QRコードをスマホで読み取る
3. LINEアプリが開き、LIFF画面が表示される
4. 自動で参加処理が行われる
5. 「参加完了！」画面が表示される

## トラブルシューティング

### 「LINEで開いてください」と表示される

- LIFF URLはLINEアプリ内でのみ動作します
- QRコードをLINEのQRリーダーで読み取ってください

### 「メッセージの送信権限がありません」

- LINE公式アカウントを友だち追加していない可能性
- ボットリンク機能が `On (Aggressive)` になっているか確認

### QRコードが従来のdeep linkのまま

- `config.js` の `LIFF_ID` が空文字になっていないか確認
- ブラウザをリロードしてください

## 補足

- LIFF IDが設定されていない場合、従来のdeep link方式にフォールバック
- イベント名もURLパラメータで渡されるため、完了画面に表示可能
