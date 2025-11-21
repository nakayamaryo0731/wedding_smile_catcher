# 開発ガイド

## 初期セットアップ

### 1. 開発ツールのインストール

```bash
# Pre-commit hooksとPython開発ツールをインストール
make install-hooks

# または手動で
pip install pre-commit pip-tools black flake8
pre-commit install
```

## 開発ワークフロー

### コード変更前の必須チェック

**すべての変更をpush前に実行:**

```bash
make pre-push
```

これにより以下が自動実行されます:
- Terraformフォーマット
- Pythonフォーマット (black)
- Lint (flake8 + tflint)
- Terraform validate
- Python依存関係チェック

### 個別コマンド

```bash
# フォーマットのみ
make fmt

# Lintのみ
make lint

# Terraform検証のみ
make validate-terraform

# Python依存関係検証のみ
make validate-python

# すべてのvalidation
make validate-all

# ヘルプを表示
make help
```

## Pre-commit Hooks

Git commitの前に自動で以下をチェック:
- Terraformフォーマット
- Pythonフォーマット
- 依存関係の競合チェック
- YAMLファイルの構文
- 大きいファイルの検出
- 秘密鍵の検出

### Pre-commit Hooksをスキップ (非推奨)

```bash
git commit --no-verify -m "message"
```

## よくあるエラーと対処法

### 1. Terraform formatエラー

```bash
Error: terraform fmt -check -recursive failed
```

**対処法:**
```bash
make fmt
git add .
git commit -m "fix: format terraform files"
```

### 2. Python依存関係の競合

```bash
Error: Cannot install line-bot-sdk and requests because of conflict
```

**対処法:**
```bash
# 依存関係を確認
pip-compile src/functions/webhook/requirements.txt

# requirements.txtを修正してlock fileを生成
pip-compile src/functions/webhook/requirements.txt --output-file src/functions/webhook/requirements.lock
```

### 3. Terraform state lockエラー

```bash
Error: Error acquiring the state lock
```

**対処法:**
```bash
cd terraform
terraform init -reconfigure
```

## CI/CDパイプライン

PRを作成すると自動で以下が実行されます:

1. **Terraform検証**
   - Format check
   - Validate
   - Lint (tflint)
   - Plan (GCPリソース変更の確認)

2. **Python検証** (src/配下の変更時)
   - Format check (black)
   - Lint (flake8)
   - 依存関係検証 (pip-compile)

### CI失敗時の対処

**ローカルで同じチェックを実行:**
```bash
make pre-push
```

エラーが出た場合は修正してから再度pushしてください。

## ベストプラクティス

1. **commit前に必ずvalidation実行**
   ```bash
   make pre-push
   ```

2. **小さい単位でcommit**
   - 1つのPRで1つの機能/修正に集中
   - Terraformの変更とPythonコードの変更は別PRに

3. **PR作成前にCIを確認**
   - GitHub ActionsのステータスがGreenになるまで待つ
   - 失敗した場合は修正してforce push

4. **依存関係の変更は慎重に**
   - `make validate-python`で事前チェック
   - 可能な限りバージョンを固定

## トラブルシューティング

### Pre-commit hooksが動かない

```bash
# 再インストール
pre-commit uninstall
pre-commit install

# 手動で全ファイルに対して実行
pre-commit run --all-files
```

### Makeコマンドが見つからない

**macOS:**
```bash
# Xcode Command Line Toolsをインストール
xcode-select --install
```

**Linux:**
```bash
sudo apt-get install build-essential
```
