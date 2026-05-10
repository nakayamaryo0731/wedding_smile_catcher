# イベント管理スクリプト

Wedding Smile Catcherのイベント管理ツール集

---

## 📋 目次

- [セットアップ](#セットアップ)
- [基本的な使い方](#基本的な使い方)
- [スクリプト一覧](#スクリプト一覧)
- [運用フロー](#運用フロー)

---

## セットアップ

### 前提条件

```bash
# Python 3.11+
python --version

# Google Cloud SDK
gcloud --version

# Firebase CLI
firebase --version

# Python dependencies
pip install -r scripts/requirements.txt
```

### 認証

```bash
# Google Cloud認証
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Firebase認証（初回のみ）
firebase login
```

---

## 基本的な使い方

### 1. イベント一覧を表示

```bash
python scripts/list_events.py
```

**出力例**:

```
📅 イベント一覧
====================================================================================================
✅ wedding_20250315_tanaka
   名前: 田中太郎 & 花子 結婚式
   日付: 2025-03-15
   状態: active
   作成: 2025-01-20 10:30:00
----------------------------------------------------------------------------------------------------
🧪 test
   名前: テストイベント
   日付: 2025-01-01
   状態: test
   作成: 2025-01-15 09:00:00
----------------------------------------------------------------------------------------------------
合計: 2 イベント
```

### 2. 新規イベントを作成

```bash
python scripts/create_event.py \
  --event-id="wedding_20250315_tanaka" \
  --event-name="田中太郎 & 花子 結婚式" \
  --event-date="2025-03-15" \
  --status="active"
```

**イベントID命名規則**:

```
{event_type}_{yyyymmdd}_{identifier}

推奨:
  wedding_20250315_tanaka     ✅
  wedding_20250420_suzuki     ✅
  test                        ✅

非推奨:
  event1                      ❌ 不明確
  tanaka                      ❌ 日付がない
```

### 3. イベントの統計を表示

```bash
python scripts/event_stats.py wedding_20250315_tanaka
```

**出力例**:

```
📊 イベント統計: wedding_20250315_tanaka
================================================================================
名前: 田中太郎 & 花子 結婚式
日付: 2025-03-15
状態: active
================================================================================

👥 ユーザー数: 45人
📸 投稿画像数: 287枚
   ├─ 完了: 283枚
   └─ 処理中: 4枚

🏆 スコア統計:
   ├─ 最高スコア: 428.50点
   ├─ 最低スコア: 12.30点
   └─ 平均スコア: 215.75点

🥇 トップ3:
   🥇 1位: 428.50点 - 山田太郎
      (笑顔: 520.0, AI: 90)
   🥈 2位: 395.20点 - 佐藤花子
      (笑顔: 480.0, AI: 85)
   🥉 3位: 378.90点 - 鈴木次郎
      (笑顔: 450.0, AI: 88)
================================================================================
```

### 4. イベントを切り替え

```bash
./scripts/switch_event.sh wedding_20250315_tanaka
```

このスクリプトは以下を自動実行します：

1. Cloud Functions の環境変数を更新
2. Frontend を再ビルド＆デプロイ
3. イベント統計を表示

**注意**: このスクリプトは数分かかります。

### 5. イベントをアーカイブ

```bash
python scripts/archive_event.py wedding_20250315_tanaka
```

イベントを `archived` 状態に変更します。データは保持されます。

---

## スクリプト一覧

### `create_event.py`

新規イベントを作成

**引数**:

- `--event-id` (必須): イベントID
- `--event-name` (必須): イベント名
- `--event-date` (必須): 日付 (YYYY-MM-DD)
- `--status` (オプション): ステータス (`test` | `active` | `archived`)

**例**:

```bash
python scripts/create_event.py \
  --event-id="wedding_20250420_suzuki" \
  --event-name="鈴木一郎 & 美咲 結婚式" \
  --event-date="2025-04-20"
```

---

### `list_events.py`

全イベントの一覧を表示

**引数**: なし

**例**:

```bash
python scripts/list_events.py
```

---

### `event_stats.py`

特定イベントの統計を表示

**引数**:

- `event_id` (位置引数): イベントID

**例**:

```bash
python scripts/event_stats.py wedding_20250315_tanaka
```

---

### `switch_event.sh`

イベントを切り替え（Cloud Functions + Frontend を更新）

**引数**:

- `event_id` (位置引数): 切り替え先のイベントID

**例**:

```bash
./scripts/switch_event.sh wedding_20250315_tanaka
```

**処理内容**:

1. イベントの存在確認
2. Cloud Functions の環境変数更新
3. Frontend 再ビルド＆デプロイ
4. 統計表示

---

### `archive_event.py`

イベントをアーカイブ（status を `archived` に変更）

**引数**:

- `event_id` (位置引数): アーカイブするイベントID

**例**:

```bash
python scripts/archive_event.py wedding_20250315_tanaka
```

---

### `export_event_data.py`

イベントのメタデータ（ユーザー、画像情報）をJSON出力

**引数**:

- `event_id` (位置引数): エクスポートするイベントID

**出力**:

- `{event_id}_data.json`: ユーザー、画像、スコア情報を含むJSON

**例**:

```bash
python scripts/export_event_data.py wedding_20250315_tanaka
# → wedding_20250315_tanaka_data.json が作成される
```

---

### `download_event_images.sh`

イベントの全画像をCloud Storageからダウンロード（メタデータも含む）

**引数**:

- `event_id` (位置引数): ダウンロードするイベントID
- `output_dir` (オプション): 保存先ディレクトリ（デフォルト: `./downloads`）

**処理内容**:

1. Cloud Storageから画像をダウンロード
2. メタデータをJSON出力
3. ダウンロード統計を表示

**例**:

```bash
# デフォルトの保存先（./downloads）にダウンロード
./scripts/download_event_images.sh wedding_20250315_tanaka

# カスタムディレクトリにダウンロード
./scripts/download_event_images.sh wedding_20250315_tanaka ./my_downloads
```

---

### `restore_event_images.py`

Cloud Storageから消失したイベント画像を、過去にダウンロードしたZIPバックアップから復元

**前提条件**:

- 過去に一括ダウンロード機能で取得したZIP（ファイル名形式 `images/NNN_userName_score.jpg`）が手元にあること
- Firestoreの該当event imageドキュメントが残っており、`storage_path` と `average_hash` が記録されていること
- `gcloud auth application-default login` 済み

**マッチング戦略**:

ZIPファイル名はsanitize済user_nameと丸めscoreを含むが、一括DLは並列fetchで順序が非決定的なため位置照合不可。代わりに各ZIP画像の `average_hash` を計算し、Firestoreに保存済の `average_hash` と二部マッチング（Hungarian algorithm）。コスト関数: `hamming*100 + name_diff*10 + min(|score差|, 50)`。全ペアが `hamming=0 ∧ name一致 ∧ |score差|<2` を満たすことをassertion、満たさなければabort。

**引数**:

- `--event-id` (必須): 対象イベントID
- `--zip` (必須): バックアップZIPファイルのパス
- `--project` (必須): GCPプロジェクトID
- `--bucket` (必須): Cloud Storageバケット名
- `--dry-run` (オプション): マッチング結果のみ出力しuploadしない

**処理**:

1. Firestoreから対象eventの非soft-delete imageドキュメント取得
2. ZIPの各.jpgを読み込み `average_hash` 計算
3. Hungarianマッチング → 全ペアのclean性をassert
4. マッチング表をstdout出力
5. `--dry-run` ならここで終了
6. 各ZIP fileのbytesを対応 `storage_path` にupload（fail-fast）
7. 全件成功時、Firestoreに保存済の `storage_url` をHEADして HTTP 200 件数を集計

**例**:

```bash
# まず dry-run でマッチング確認
python scripts/restore_event_images.py \
  --event-id wedding_20250315_tanaka \
  --zip /path/to/backup.zip \
  --project wedding-smile-catcher \
  --bucket wedding-smile-images-wedding-smile-catcher \
  --dry-run

# 内容OKなら本実行
python scripts/restore_event_images.py \
  --event-id wedding_20250315_tanaka \
  --zip /path/to/backup.zip \
  --project wedding-smile-catcher \
  --bucket wedding-smile-images-wedding-smile-catcher
```

**トラブルシューティング**:

- `count mismatch (zip=X vs firestore=Y)`: ZIPの画像数とFirestoreの非soft-delete docs数が異なる。手動確認が必要
- `ASSERTION FAILED: matching has imperfect pairs`: ZIP画像とFirestore docのhash/name/scoreが一致しない。ZIPが該当event由来でない、もしくはFirestoreの状態が変わった可能性
- `FATAL upload failure at [N/M]`: upload途中で失敗。N-1件まで成功、原因解消後に再実行（同一storage_pathへの再uploadは冪等）

---

### `setup_rich_menu.py`

LINE Botのリッチメニューを設定（プライバシーポリシーリンク）

**前提条件**:

- LINE_CHANNEL_ACCESS_TOKEN 環境変数が設定されていること
- Pillow がインストールされていること

**引数**:

- `--privacy-url` (オプション): プライバシーポリシーURL（デフォルト: `https://wedding-smile-catcher.web.app/privacy`）
- `--delete-existing` (オプション): 既存のデフォルトリッチメニューを削除

**処理内容**:

1. リッチメニューオブジェクトを作成
2. メニュー画像を生成・アップロード
3. デフォルトメニューとして設定

**例**:

```bash
# 環境変数を設定
export LINE_CHANNEL_ACCESS_TOKEN="your_access_token"

# デフォルト設定で実行
python scripts/setup_rich_menu.py

# 既存メニューを削除して新規作成
python scripts/setup_rich_menu.py --delete-existing

# カスタムURLを指定
python scripts/setup_rich_menu.py --privacy-url "https://example.com/privacy"
```

**注意**: このスクリプトは一度実行すれば十分です。再実行すると新しいリッチメニューが作成されます。

---

## 運用フロー

### 開発・テスト期間

```bash
# 1. テストイベントを使用
export CURRENT_EVENT_ID="test"

# 2. テストデータで開発
# （LINEボットで画像を投稿）

# 3. 統計確認
python scripts/event_stats.py test
```

---

### 本番前（1週間前）

```bash
# 1. 本番イベントを作成
python scripts/create_event.py \
  --event-id="wedding_20250315_tanaka" \
  --event-name="田中太郎 & 花子 結婚式" \
  --event-date="2025-03-15" \
  --status="active"

# 2. イベントを切り替え
./scripts/switch_event.sh wedding_20250315_tanaka

# 3. 動作確認
python scripts/event_stats.py wedding_20250315_tanaka
```

---

### 本番当日

#### 事前チェックリスト

```bash
# 1. 現在のイベントIDを確認
gcloud functions describe webhook \
  --format="value(environmentVariables.CURRENT_EVENT_ID)"
# → wedding_20250315_tanaka であることを確認

# 2. テストデータが表示されないことを確認
python scripts/event_stats.py test
# → テストイベントの統計を確認（本番に影響しないこと）

python scripts/event_stats.py wedding_20250315_tanaka
# → 本番イベントがクリーンな状態であることを確認

# 3. LINEボットで動作確認
# テストユーザーで画像を投稿 → 正しく本番イベントに保存されるか確認
```

#### 緊急時の対応

**誤ってテストイベントで起動した場合**:

```bash
# 即座に切り替え
./scripts/switch_event.sh wedding_20250315_tanaka

# 誤投稿データを確認
python scripts/event_stats.py test

# 必要に応じてデータを移行（後述）
```

---

### 本番後

```bash
# 1. イベントをアーカイブ
python scripts/archive_event.py wedding_20250315_tanaka

# 2. 全画像とメタデータをダウンロード（納品用）
./scripts/download_event_images.sh wedding_20250315_tanaka

# 3. ZIPアーカイブを作成
cd downloads
zip -r wedding_20250315_tanaka_all_data.zip \
  wedding_20250315_tanaka \
  wedding_20250315_tanaka_data.json

# 4. Firestoreバックアップ取得
gcloud firestore export gs://wedding-backup/wedding_20250315_tanaka

# 5. テストイベントに戻す
./scripts/switch_event.sh test
```

**重要**: Cloud Storageの画像は物理削除しない！

- イベント終了後もCloud Storageにデータを保持
- 必要に応じていつでもダウンロード可能
- 長期保存の場合はARCHIVEストレージクラスに移行（コスト削減）

---

## トラブルシューティング

### Q1: テストデータが本番に表示されている

**原因**: 環境変数が更新されていない

**確認**:

```bash
gcloud functions describe webhook \
  --format="value(environmentVariables.CURRENT_EVENT_ID)"
```

**修正**:

```bash
./scripts/switch_event.sh wedding_20250315_tanaka
```

---

### Q2: 誤って別のイベントIDで投稿してしまった

**対処**: データマイグレーションスクリプト（作成予定）

```python
# scripts/migrate_event_id.py (TODO)
python scripts/migrate_event_id.py \
  --from-event="test" \
  --to-event="wedding_20250315_tanaka" \
  --date-range="2025-03-15T00:00:00Z"
```

---

### Q3: 過去のイベントデータを見たい

```bash
# 1. イベント一覧で確認
python scripts/list_events.py

# 2. 統計表示
python scripts/event_stats.py wedding_20250220_old

# 3. Frontendで表示したい場合
# 一時的にevent_idを変更してローカル実行
cd src/frontend
NEXT_PUBLIC_CURRENT_EVENT_ID=wedding_20250220_old npm run dev
```

---

## ベストプラクティス

### イベントID命名規則

```
推奨:
  wedding_20250315_tanaka     ✅ 明確
  wedding_20250420_suzuki     ✅ 明確
  test                        ✅ テスト専用

非推奨:
  event1                      ❌ 不明確
  tanaka                      ❌ 日付がない
  2025-03-15                  ❌ タイプがない
```

### 環境変数の管理

**開発環境** (`.env.local`):

```bash
CURRENT_EVENT_ID=test
```

**本番環境** (Cloud Functions):

```bash
CURRENT_EVENT_ID=wedding_20250315_tanaka
```

---

## 次のステップ

Phase 2で実装予定：

- [ ] Web管理画面（イベント管理UI）
- [ ] データマイグレーションツール
- [ ] 自動バックアップ機能
- [ ] イベント複製機能

---

**最終更新**: 2025-01-23
