# Terraformセットアップ進捗記録

このファイルは、Terraformインフラ実装の進捗を記録しています。

**最終更新**: 2025-11-19

---

## ✅ 完了したタスク

### 1. Terraform構成設計
- **日時**: 2025-11-18
- **ステータス**: ✅ 完了

**作成したファイル構成**:
```
terraform/
├── versions.tf              # Provider/Terraformバージョン
├── variables.tf             # 変数定義
├── outputs.tf               # 出力値定義
├── main.tf                  # メインのリソース定義
├── terraform.tfvars         # 変数値（.gitignore対象）
├── terraform.tfvars.example # 変数値のサンプル
└── modules/
    ├── secret_manager/      # ✅ 実装完了
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── iam/                 # 未実装
    ├── storage/             # 未実装
    ├── firestore/           # 未実装
    ├── functions/           # 未実装
    └── cloud_run/           # 未実装
```

### 2. Secret Managerモジュール実装
- **日時**: 2025-11-18
- **ステータス**: ✅ 完了
- **管理対象**:
  - `line-channel-secret`
  - `line-channel-access-token`

### 3. Terraform初期化
- **日時**: 2025-11-18
- **コマンド**: `terraform init`
- **ステータス**: ✅ 完了

### 4. GCP認証設定
- **日時**: 2025-11-18
- **方法**: Application Default Credentials
- **ステータス**: ✅ 完了

### 5. Terraform Plan実行
- **日時**: 2025-11-18
- **結果**: 5リソースを作成予定
  - Secret Manager API有効化
  - line-channel-secret（Secret + Version）
  - line-channel-access-token（Secret + Version）
- **ステータス**: ✅ 完了

### 6. 既存Secret Managerリソースのインポート
- **日時**: 2025-11-19
- **ステータス**: ✅ 完了
- **実施内容**:
  - `line-channel-secret`をTerraform管理下に取り込み
  - `line-channel-access-token`をTerraform管理下に取り込み

### 7. Terraform Apply実行
- **日時**: 2025-11-19
- **ステータス**: ✅ 完了
- **結果**:
  - Secret Manager API有効化
  - 既存Secretにラベル追加（environment, managed_by, project）
  - 各Secretに新しいバージョン（version 2）作成

### 8. GCS Backend設定
- **日時**: 2025-11-19
- **ステータス**: ✅ 完了
- **実施内容**:
  - tfstate保存用バケット作成: `gs://wedding-smile-catcher-tfstate`
  - バージョニング有効化
  - `versions.tf`のbackend設定を有効化
  - `terraform init -migrate-state`でtfstateをGCSに移行

### 9. GitHub Actions設定
- **日時**: 2025-11-19
- **ステータス**: ✅ 完了
- **実施内容**:
  - Service Account `terraform-github-actions` 作成
  - `roles/editor` 権限を付与
  - Service Account鍵（JSON）を作成
  - `.github/workflows/terraform.yml` 作成
  - GitHub Secretsに以下を追加:
    - `GCP_SA_KEY` - Service Account鍵
    - `TF_VAR_LINE_CHANNEL_SECRET` - LINE Channel Secret
    - `TF_VAR_LINE_CHANNEL_ACCESS_TOKEN` - LINE Channel Access Token
  - ローカルの鍵ファイルを削除（セキュリティ対策）

---

## 📋 次のセッションでやること

### GitHub Actionsデプロイテスト（推奨）

```bash
# テストブランチ作成
git checkout -b test-terraform-deploy

# 何か小さな変更を加える（例: コメント追加）
# terraform/main.tf に変更を加える

# commit & push
git add .
git commit -m "test: verify Terraform GitHub Actions"
git push origin test-terraform-deploy

# Pull Request作成
gh pr create --title "Test Terraform Deploy" --body "Testing GitHub Actions"
```

PRで`terraform plan`が実行されることを確認

mainにマージすると`terraform apply`が自動実行される

### 今後の実装予定

次のTerraformモジュールを実装する必要があります：

1. **IAMモジュール** - Service Accountsとロール管理
2. **Storageモジュール** - Cloud Storage バケット（画像保存用）
3. **Firestoreモジュール** - Firestore データベース設定
4. **Functionsモジュール** - Cloud Functions（webhook, scoring）
5. **Cloud Runモジュール** - Next.js フロントエンドのデプロイ

これらのモジュールは、アプリケーションの実装に合わせて段階的に追加していきます。

---

## 📝 メモ・備考

### terraform importについて

**なぜimportが必要？**
- 既に手動でSecret Managerに作成したリソースが存在
- Terraformはそれを知らないので、新規作成しようとする
- 結果: 重複エラーが発生

**importの仕組み**
- 既存リソースをTerraformのstate（状態ファイル）に記録
- 以降、Terraformがそのリソースを管理できるようになる

### よく使うコマンド

```bash
# 初期化
terraform init

# フォーマット
terraform fmt

# 検証
terraform validate

# Plan（変更確認）
terraform plan

# Apply（適用）
terraform apply

# 状態確認
terraform show

# 特定リソースの状態確認
terraform state show module.secret_manager.google_secret_manager_secret.line_channel_secret

# インポート
terraform import <リソース名> <GCPリソースID>
```

### トラブルシューティング

#### 認証エラー
```bash
# Application Default Credentials再設定
gcloud auth application-default login
```

#### import対象リソースID確認
```bash
# Secretの一覧
gcloud secrets list --project=wedding-smile-catcher

# 特定Secretの詳細
gcloud secrets describe line-channel-secret --project=wedding-smile-catcher
```

---

## 参考ドキュメント

- [Terraform GCP Provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs)
- [Terraform Import](https://developer.hashicorp.com/terraform/cli/import)
- [GitHub Actions for Terraform](https://github.com/hashicorp/setup-terraform)
