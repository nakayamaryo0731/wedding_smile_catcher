# Firestore Security Rules Tests

Firebase Emulatorを使用したFirestore Security Rulesのテスト。

## セットアップ

```bash
cd tests/firestore-rules
npm install
```

## テスト実行

### 方法1: Emulatorを自動起動して実行（推奨）

```bash
npm run test:emulator
```

### 方法2: 手動でEmulatorを起動してテスト

ターミナル1（プロジェクトルートから）:
```bash
firebase emulators:start --only firestore
```

ターミナル2（tests/firestore-rulesから）:
```bash
npm test
```

## テストカバレッジ

以下のルールをテストしています：

### accounts コレクション
- 自分のアカウントは読み取り可能
- 他人のアカウントは読み取り不可（adminを除く）
- 自分のアカウントは作成可能
- 他人のアカウントは作成不可
- アカウント削除は不可

### events コレクション
- 単一ドキュメントは誰でも読み取り可能（ランキングUI用）
- リスト取得は認証必須
- イベント作成は自分のaccount_idでのみ可能
- イベント更新は所有者またはadminのみ
- イベント削除は所有者またはadminのみ

### users コレクション（LINEユーザー）
- 誰でも読み取り可能（ランキング表示用）
- フロントエンドからの作成は不可
- イベント所有者は更新可能（soft delete用）
- 物理削除はadminのみ

### images コレクション
- 誰でも読み取り可能（ランキング表示用）
- フロントエンドからの作成は不可
- イベント所有者は更新可能（soft delete用）
- 物理削除はadminのみ

### デフォルト拒否
- 未定義のコレクションへのアクセスは拒否
