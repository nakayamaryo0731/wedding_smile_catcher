# Wedding Smile Catcher

結婚式で参加者から笑顔の写真を集めて、AIでスコアリング＆ランキングするLINE Botシステム

## 🔄 次のセッションで作業を継続する場合

**まず最初に [docs/reference/context.md](docs/reference/context.md) を読んでください。**

このファイルには、プロジェクトの背景、参考にしたPDFの内容、技術選定の経緯、重要な設計思想などがすべてまとめられています。

## 📖 概要

結婚式の参加者がLINE Botに写真を投稿すると、AIが笑顔を検出・採点し、リアルタイムでランキングを表示。参加者全員が楽しめるゲーミフィケーション要素を取り入れた写真収集システムです。

### コンセプト

- **笑顔（Smile）をテーマに**: 参加者全員が笑顔の写真を撮ることを心から楽しめる体験
- **写真収集の課題を解決**: 結婚式で撮られた写真が新郎新婦に共有されにくい問題を解決
- **モチベーション**: ゲーミフィケーションで写真アップロードを促進

### 主な機能

- 🤖 **LINE Bot**: 誰でも簡単に写真を投稿できるインターフェース
- 😊 **笑顔検出**: Cloud Vision APIで顔と笑顔を自動検出
- 🎯 **スコアリング**: 笑顔の信頼度を加算してスコア化
- 🏆 **ランキング**: トップ3をリアルタイム表示（トップ1は大きく、2・3は小さく）
- 🎨 **生成AI評価**: Vertex AI (Gemini)でテーマ関連性を判定
- 🔍 **類似画像検出**: Average Hashで連写にペナルティ

## 🏗️ 技術スタック

### クラウドインフラ（GCP）

| カテゴリ | サービス | 用途 |
|---------|---------|------|
| コンピューティング | Cloud Functions / Cloud Run | Webhook処理、画像処理 |
| ストレージ | Cloud Storage | 画像保存 |
| データベース | Firestore | メタデータ・スコア・ユーザー情報 |
| AI/ML | Cloud Vision API | 顔検出・笑顔検出 |
| AI/ML | Vertex AI (Gemini) | 画像のテーマ評価 |
| ホスティング | Cloud Run / Firebase Hosting | フロントエンド配信 |
| CDN | Cloud CDN | 静的コンテンツ配信 |
| IaC | Terraform | インフラ管理 |

### アプリケーション

- **LINE Messaging API**: Bot インターフェース
- **Next.js**: フロントエンド（ランキング表示画面）
- **Python / Node.js**: バックエンド処理
- **Terraform**: Infrastructure as Code

## 📁 プロジェクト構成

```
wedding_smile_catcher/
├── docs/                    # ドキュメント
│   ├── architecture/        # システム設計
│   │   ├── overview.md     # アーキテクチャ概要
│   │   ├── scoring.md      # スコアリングアルゴリズム
│   │   └── database.md     # データベース設計
│   ├── api/                # API仕様
│   ├── setup/              # セットアップガイド
│   │   ├── gcp-setup.md   # GCP環境構築
│   │   └── line-bot.md    # LINE Bot設定
│   └── reference/          # 参考資料
│       └── original.md     # 元システム（AWS版）参照
├── src/
│   ├── functions/          # Cloud Functions
│   │   ├── webhook/       # LINE Webhook処理
│   │   └── scoring/       # スコアリング処理
│   ├── frontend/           # Next.jsアプリ
│   │   ├── realtime/      # リアルタイム表示
│   │   └── ranking/       # ランキング表示
│   └── common/             # 共通ライブラリ
│       ├── vision/        # Vision API ラッパー
│       └── firestore/     # Firestore ヘルパー
└── terraform/              # インフラコード
    ├── main.tf
    ├── variables.tf
    └── modules/
```

## 🎯 システムフロー

1. **写真投稿**: 参加者がLINE Botに写真を送信
2. **ユーザー登録**: 初回投稿時に名前を登録
3. **画像保存**: Cloud Storageに保存
4. **笑顔検出**: Cloud Vision APIで笑顔スコア算出
5. **AI評価**: Vertex AIでテーマ関連性評価
6. **類似判定**: Average Hashで類似画像をチェック
7. **スコア計算**: 総合スコアを算出してFirestoreに保存
8. **結果返信**: LINE Botでスコアとコメントを返信
9. **ランキング表示**: 式中にスクリーンでトップ3をリアルタイム表示
   - トップ1: 大きく表示
   - トップ2・3: 小さく並べて表示

## 🚀 クイックスタート

詳細は [docs/setup/](docs/setup/) を参照

### 前提条件

- GCPアカウント
- LINE Developersアカウント
- Terraform インストール済み

### セットアップ手順

```bash
# 1. リポジトリクローン
git clone <repository-url>
cd wedding_smile_catcher

# 2. GCP設定（詳細は docs/setup/gcp-setup.md）
# - プロジェクト作成
# - 必要なAPIの有効化

# 3. LINE Bot設定（詳細は docs/setup/line-bot.md）
# - チャネル作成
# - Webhook URL設定

# 4. インフラデプロイ
cd terraform
terraform init
terraform plan
terraform apply

# 5. 動作確認
# LINE Botに写真を送信してテスト
```

## 📚 ドキュメント

### 設計ドキュメント
- [アーキテクチャ概要](docs/architecture/overview.md)
- [スコアリングアルゴリズム](docs/architecture/scoring.md)
- [データベース設計](docs/architecture/database.md)

### セットアップガイド
- [GCPセットアップ](docs/setup/gcp-setup.md)
- [LINE Bot設定](docs/setup/line-bot.md)

### API仕様
- [Webhook API](docs/api/webhook.md)
- [Scoring API](docs/api/scoring.md)

### 参考資料
- [元システム（AWS版）](docs/reference/original.md)

## 🎯 開発ロードマップ

### フェーズ1: 基礎インフラ（1-2週間）
- [x] プロジェクト構成
- [ ] GCPプロジェクトセットアップ
- [ ] LINE Bot基本セットアップ

### フェーズ2: コア機能開発（2-3週間）
- [ ] Cloud Function（Webhook受信）
- [ ] 笑顔検出機能
- [ ] スコアリングロジック

### フェーズ3: フロントエンド（1-2週間）
- [ ] Next.jsアプリ
- [ ] ランキング表示画面（トップ1大・トップ2/3小）
- [ ] Firestoreリアルタイムリスナー統合

### フェーズ4: 仕上げ（1週間）
- [ ] インフラのコード化
- [ ] テスト
- [ ] ドキュメント整備

## 📝 参考

このプロジェクトは、エムスリーテックブック8の第2章「結婚式スマイル集める君」（AWS版）を参考に、GCPで再実装したものです。

## 📄 License

MIT
