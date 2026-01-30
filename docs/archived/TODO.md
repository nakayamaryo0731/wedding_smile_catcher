# 開発進捗

## 完了したタスク ✅

- [x] プロジェクト構成の作成
- [x] README.md の作成
- [x] アーキテクチャ概要ドキュメント (docs/architecture/overview.md)
- [x] スコアリングアルゴリズム設計 (docs/architecture/scoring.md)

## 次にやること 📋

### フェーズ1: 設計ドキュメント作成（継続中）

1. **データベース設計** `docs/architecture/database.md`
   - Firestoreのコレクション設計
   - セキュリティルール
   - インデックス設計

2. **GCP技術選定** `docs/architecture/gcp-services.md`
   - 各GCPサービスの詳細
   - AWS→GCPマッピング完全版
   - コスト見積もり

3. **LINE Bot設計** `docs/api/line-bot.md`
   - Webhookフロー詳細
   - メッセージタイプ別処理
   - Reply Token管理

4. **API仕様書**
   - `docs/api/webhook.md` - Webhook API
   - `docs/api/scoring.md` - Scoring API
   - `docs/api/frontend.md` - Frontend API

5. **セットアップガイド**
   - `docs/setup/gcp-setup.md` - GCP環境構築
   - `docs/setup/line-bot-setup.md` - LINE Bot設定
   - `docs/setup/local-dev.md` - ローカル開発環境

### フェーズ2: 実装準備

6. **プロジェクト初期化**
   - Python/Node.js環境セットアップ
   - package.json / requirements.txt
   - 環境変数テンプレート (.env.example)

7. **Terraform初期構成**
   - terraform/main.tf
   - terraform/variables.tf
   - terraform/modules/

## 参考資料

- 元システム: エムスリーテックブック8 第2章「結婚式スマイル集める君」（AWS版）
- PDF: `~/Documents/wedding/m3techbook-8-2.pdf`

## Git履歴

```bash
git log --oneline
9ecc258 docs: add detailed scoring algorithm design
45230e1 docs: add architecture overview with GCP services
a63e8fe docs: add initial README.md with project overview
```

## 次のセッションで

次のセッションを開始する際は、以下のコマンドでこのプロジェクトに移動してください：

```bash
cd ~/Dev/wedding_smile_catcher
```

そして、このTODO.mdを参照して作業を続けてください。
