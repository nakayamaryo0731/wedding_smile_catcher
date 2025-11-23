# テスト戦略

Wedding Smile Catcher プロジェクトのテスト戦略ドキュメント

**作成日**: 2025-01-22
**ステータス**: Draft

---

## 1. テスト方針

### 1.1 基本方針

結婚式は**一度きりのイベント**であるため、本番での不具合は許されない。そのため、以下の方針でテストを実施する：

- **徹底的なテスト**: 全ての主要機能をテスト
- **自動化優先**: 可能な限り自動テストで品質を担保
- **本番環境に近いテスト**: 実際のGCP環境でのテスト
- **継続的なテスト**: CI/CDで自動実行

### 1.2 テストピラミッド

```text
        /\
       /E2E\       - 少数（シナリオテスト）
      /------\
     / 統合   \     - 中程度（API、DB統合）
    /----------\
   / ユニット   \   - 多数（ロジック、関数）
  /--------------\
```

**比率**: ユニット 70% : 統合 20% : E2E 10%

---

## 2. テストレベル

### 2.1 ユニットテスト

**目的**: 個別の関数・モジュールの動作を検証

**対象**:

- スコアリングロジック（`generate_scores_with_vision_api`）
- 笑顔スコア計算（`calculate_smile_score`）
- AI評価（`evaluate_theme`）
- Average Hash計算・類似判定（`calculate_average_hash`, `is_similar_image`）
- ユーザー登録処理
- エラーハンドリング

**ツール**:

- Python: `pytest`
- モック: `unittest.mock`, `pytest-mock`

**実装方針**:

- 外部API（Vision API, Vertex AI）はモック
- Firestore、Cloud Storageもモック
- 純粋な関数は実データでテスト

**テストケース例**:

```python
# スコアリングロジック
def test_calculate_total_score():
    smile_score = 450.0
    ai_score = 80
    penalty = 1.0
    expected = 360.0
    assert calculate_total_score(smile_score, ai_score, penalty) == expected

# 類似判定
def test_is_similar_image():
    hash1 = "abcd1234efgh5678"
    hash2 = "abcd1234efgh5679"  # Hamming distance = 1
    assert is_similar_image(hash1, [hash2], threshold=8) == True
```

---

### 2.2 統合テスト

**目的**: 複数のコンポーネント間の連携を検証

**対象**:

- Firestore統合（データ保存・取得）
- Cloud Storage統合（画像アップロード・ダウンロード）
- Cloud Functions統合（HTTP endpoint）
- LINE Bot API統合

**ツール**:

- Python: `pytest`
- GCP Emulator: Firestore Emulator（ローカルテスト用）
- `requests`（HTTP API テスト）

**実装方針**:

- Firestore Emulatorを使用してローカルでテスト
- テスト用のGCPプロジェクトを作成（本番と分離）
- テストデータは各テスト後にクリーンアップ

**テストケース例**:

```python
# Firestore統合
def test_save_image_to_firestore():
    image_id = "test_img_001"
    data = {"user_id": "test_user", "score": 100}
    save_image(image_id, data)

    # Verify
    doc = db.collection('images').document(image_id).get()
    assert doc.exists
    assert doc.to_dict()['score'] == 100

# Cloud Storage統合
def test_upload_download_image():
    bucket = storage_client.bucket(TEST_BUCKET)
    blob = bucket.blob("test/image.jpg")
    blob.upload_from_filename("test_data/sample.jpg")

    # Download and verify
    downloaded = blob.download_as_bytes()
    assert len(downloaded) > 0
```

---

### 2.3 E2Eテスト

**目的**: エンドツーエンドのユーザーシナリオを検証

**対象**:

- ユーザー登録フロー（LINE Bot → Webhook → Firestore）
- 画像投稿フロー（LINE Bot → Webhook → Storage → Scoring → Firestore → LINE返信）
- ランキング表示フロー（Firestore → Frontend）

**ツール**:

- Python: `pytest`
- HTTP Client: `requests`
- LINE Bot SDK: テストメッセージ送信
- Frontend: 手動確認（または Playwright）

**実装方針**:

- テスト専用のLINE Botチャネル作成
- テスト用画像セットを準備
- 本番環境（またはステージング環境）でテスト

**テストシナリオ例**:

#### シナリオ1: 新規ユーザー登録 → 画像投稿 → スコア返信

```text
1. Follow Eventを送信
2. テキストメッセージで名前を送信
3. Firestoreにユーザーが登録されることを確認
4. 画像メッセージを送信
5. Cloud Storageに画像が保存されることを確認
6. スコアリングが実行されることを確認
7. LINEに結果が返信されることを確認
8. Firestoreにスコアが保存されることを確認
```

#### シナリオ2: 類似画像のペナルティ

```text
1. ユーザーAで画像1を投稿
2. スコアが返ることを確認
3. 同じユーザーAで画像1と類似した画像2を投稿
4. スコアが1/3になることを確認（ペナルティ適用）
```

#### シナリオ3: ランキング表示

```text
1. 複数のユーザーで複数の画像を投稿
2. フロントエンド（Firebase Hosting）にアクセス
3. Top 3が正しく表示されることを確認
4. 同一ユーザーが重複していないことを確認
```

---

## 3. テストデータ

### 3.1 テスト画像セット

以下の画像を準備する：

| 画像 | 内容 | 期待されるスコア |
|------|------|------------------|
| `happy_group_5.jpg` | 5人の笑顔 | 高スコア（400-500） |
| `happy_couple.jpg` | 2人の笑顔 | 中スコア（150-200） |
| `single_smile.jpg` | 1人の笑顔 | 低スコア（70-95） |
| `no_smile.jpg` | 笑顔なし | 低スコア（0-50） |
| `similar_1.jpg` / `similar_2.jpg` | 類似画像ペア | ペナルティ適用確認用 |
| `off_theme.jpg` | テーマ外（風景など） | AI評価が低い |

### 3.2 テストユーザー

```python
TEST_USERS = [
    {"line_user_id": "test_user_001", "name": "テスト太郎"},
    {"line_user_id": "test_user_002", "name": "テスト花子"},
    {"line_user_id": "test_user_003", "name": "テスト次郎"},
]
```

---

## 4. テスト環境

### 4.1 ローカル環境

- **Firestore Emulator**: ローカルでのFirestoreテスト
- **pytest**: ユニットテスト・統合テスト実行
- **モック**: 外部API（Vision API, Vertex AI）のモック

### 4.2 テスト用GCPプロジェクト

- **プロジェクト名**: `wedding-smile-catcher-test`
- **用途**: 統合テスト、E2Eテスト
- **データ**: テスト後にクリーンアップ

### 4.3 ステージング環境（オプション）

- 本番環境と同じ構成
- 本番デプロイ前の最終確認

---

## 5. テスト自動化

### 5.1 CI/CD統合

**GitHub Actions**:

```yaml
name: Test

on: [push, pull_request]

jobs:
  unit-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: pip install -r requirements-dev.txt
      - name: Run unit tests
        run: pytest tests/unit/ --cov

  integration-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start Firestore Emulator
        run: gcloud emulators firestore start --host-port=localhost:8080 &
      - name: Run integration tests
        run: pytest tests/integration/
```

### 5.2 定期実行

- **Nightly E2E Test**: 毎晩、本番環境でE2Eテストを実行
- **レポート**: Slack通知、またはメール通知

---

## 6. テストカバレッジ目標

| テストレベル | カバレッジ目標 |
|--------------|----------------|
| ユニットテスト | 80%以上 |
| 統合テスト | 主要フロー100% |
| E2Eテスト | 重要シナリオ100% |

---

## 7. テスト実施タイミング

### 7.1 開発フェーズ

- **ユニットテスト**: 機能実装と同時
- **統合テスト**: 機能完了後
- **E2Eテスト**: Phase 1 完了後

### 7.2 本番前

- **最終E2Eテスト**: 本番デプロイの1週間前
- **負荷テスト**: 50件/分の画像投稿をシミュレート
- **障害テスト**: APIエラー、ネットワーク障害のシミュレート

### 7.3 本番運用中

- **Dry Run**: 結婚式当日の1週間前に、実際のゲストで小規模テスト
- **モニタリング**: Cloud Loggingで異常を監視

---

## 8. 次のステップ

1. ✅ テスト戦略ドキュメント作成（本ドキュメント）
2. ⏳ ユニットテストの実装
3. ⏳ 統合テストの実装
4. ⏳ E2Eテストの実装
5. ⏳ CI/CD統合
6. ⏳ テストデータ準備

---

## 9. 参考資料

- [pytest Documentation](https://docs.pytest.org/)
- [Google Cloud Testing Best Practices](https://cloud.google.com/testing)
- [Firestore Emulator](https://firebase.google.com/docs/emulator-suite)
