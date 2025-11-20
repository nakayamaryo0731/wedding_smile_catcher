# ADR-001: Secret Manager シークレットの Terraform 管理方針

**ステータス**: Accepted
**決定日**: 2025-11-20
**決定者**: Project Owner
**影響範囲**: CI/CD, Secret Management, Security

## コンテキスト

Terraform で LINE Bot の認証情報（`line_channel_secret`, `line_channel_access_token`）を Secret Manager 経由で管理している。

GitHub Actions の Terraform CI/CD パイプライン実行時に以下のエラーが発生：

```
Error 403: Permission 'secretmanager.versions.access' denied for resource
'projects/548587922270/secrets/line-channel-secret/versions/2'
```

### 問題の原因

1. GitHub Actions で使用するサービスアカウント（`terraform-github-actions@wedding-smile-catcher.iam.gserviceaccount.com`）は `roles/editor` を持つ
2. しかし `roles/editor` には `secretmanager.versions.access` 権限が**含まれていない**
   - `secretmanager.versions.get`: メタデータ取得 ✓
   - `secretmanager.versions.access`: シークレット値の読み取り ✗
3. Terraform は `terraform plan` 実行前に state refresh を行い、その際に Secret Manager からシークレット値を読み取ろうとする
4. `lifecycle { ignore_changes = [secret_data] }` を設定していても、refresh 時には読み取りが必要

## 検討した選択肢

### Option 1: Secret Accessor 権限を付与
`roles/secretmanager.secretAccessor` を CI/CD サービスアカウントに付与

**Pros:**
- Terraform が正常に動作する
- State drift（手動変更）を検出できる
- 実装コストが低い（権限追加のみ）

**Cons:**
- CI/CD パイプラインがシークレット値を読み取れる
- ただし Terraform state にも既にシークレットが保存されている（暗号化済み）

### Option 2: Refresh 無効化
Workflow に `-refresh=false` フラグを追加

**Pros:**
- 権限追加が不要
- CI/CD がシークレットにアクセスしない

**Cons:**
- 手動変更を検出できない
- State drift のリスク
- Terraform のベストプラクティスに反する

### Option 3: Secret Version を Data Source に変更（長期的推奨）
Secret container のみ Terraform 管理、version は手動管理または別プロセスで管理

**Pros:**
- セキュリティのベストプラクティス
- インフラとシークレット管理の分離
- State にシークレット値を保存しない
- 監査証跡が明確

**Cons:**
- 実装コストが高い
- 運用が複雑になる
- 小規模プロジェクトには過剰

## 決定内容

**Option 1 を採用する（短期〜中期）**

以下のコマンドで権限を付与：

```bash
gcloud projects add-iam-policy-binding wedding-smile-catcher \
  --member="serviceAccount:terraform-github-actions@wedding-smile-catcher.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## 理由

### このプロジェクトの特性
- 個人/小規模プロジェクト（ウェディングイベント用）
- シークレットが頻繁に変わらない（LINE Bot 認証情報は一度設定したら変更なし）
- GCS backend は適切にアクセス制御済み
- 同じ人がインフラもシークレットも管理

### Option 1 が適切な理由
1. **実用性**: CI/CD パイプラインを即座に unblock できる
2. **セキュリティ**:
   - GCS state backend は既に暗号化されており、適切にアクセス制御されている
   - サービスアカウントは専用で、キーは GitHub Secrets で管理
   - このプロジェクトのスコープでは許容可能なリスク
3. **運用コスト**: Option 3 の複雑さは現時点では不要

## 影響

### セキュリティ
- CI/CD サービスアカウントがシークレット値を読み取り可能になる
- ただし、既に Terraform state（GCS backend）にシークレットは保存されている
- GCS backend へのアクセス権限を持つ人は既にシークレットにアクセス可能

### 運用
- Terraform apply が正常に動作する
- 手動でのシークレット変更を検出可能（state drift）

## 将来の見直しタイミング

以下の条件に該当する場合、**Option 3 への移行を検討すべき**：

1. **プロジェクトのスケール拡大**
   - 複数人でのチーム開発に移行
   - 異なる役割（インフラエンジニア、セキュリティエンジニア）の分離が必要

2. **セキュリティ要件の変化**
   - コンプライアンス要件が厳格化
   - シークレットローテーションの自動化が必要
   - 本番環境での運用開始

3. **運用の変化**
   - シークレットが頻繁に変更されるようになった
   - 複数環境（dev/staging/prod）での異なる権限管理が必要

## 関連資料

- [Terraform Secret Manager Best Practices](https://cloud.google.com/secret-manager/docs/best-practices)
- [GCP IAM Roles Documentation](https://cloud.google.com/iam/docs/understanding-roles)
- セットアップ進捗: `docs/setup/TERRAFORM_SETUP_PROGRESS.md`

## 変更履歴

| 日付 | 変更内容 | 理由 |
|------|---------|------|
| 2025-11-20 | 初版作成、Option 1 を採用 | CI/CD パイプライン unblock のため |
