# ユニットテスト設計

Wedding Smile Catcher プロジェクトのユニットテスト詳細設計

**作成日**: 2025-01-22

---

## 1. テスト対象関数

### 1.1 スコアリング関数（scoring/main.py）

#### `calculate_smile_score(image_bytes: bytes) -> Dict[str, Any]`

**目的**: Vision APIで笑顔を検出し、スコアを計算

**テストケース**:

| No | テストケース | 入力 | 期待される出力 | 備考 |
|----|-------------|------|---------------|------|
| 1 | 笑顔5人検出 | 5人の笑顔画像 | score: 450-500, faces: 5 | VERY_LIKELY × 5 |
| 2 | 笑顔2人検出 | 2人の笑顔画像 | score: 150-200, faces: 2 | LIKELY × 2 |
| 3 | 笑顔なし | 笑顔なし画像 | score: 0, faces: 3 | UNLIKELY × 3 |
| 4 | Vision APIエラー | - | score: 300, error付き | フォールバック |
| 5 | リトライ成功 | 1回目失敗、2回目成功 | 正常なスコア | リトライロジック |

**モック**:

```python
@patch('google.cloud.vision.ImageAnnotatorClient')
def test_calculate_smile_score_success(mock_vision_client):
    # Setup mock
    mock_response = Mock()
    mock_response.face_annotations = [
        Mock(joy_likelihood=vision.Likelihood.VERY_LIKELY),
        Mock(joy_likelihood=vision.Likelihood.VERY_LIKELY),
    ]
    mock_response.error.message = ""
    mock_vision_client.return_value.face_detection.return_value = mock_response

    # Test
    result = calculate_smile_score(b"fake_image_bytes")

    # Assert
    assert result['face_count'] == 2
    assert result['smiling_faces'] == 2
    assert result['smile_score'] == 190.0  # 95.0 × 2
```

---

#### `evaluate_theme(image_bytes: bytes) -> Dict[str, Any]`

**目的**: Vertex AIで結婚式テーマに合っているか評価

**テストケース**:

| No | テストケース | 入力 | 期待される出力 | 備考 |
|----|-------------|------|---------------|------|
| 1 | 正常評価 | 結婚式テーマ画像 | score: 85, comment付き | - |
| 2 | 低評価 | テーマ外画像 | score: 20, comment付き | 風景など |
| 3 | JSONパースエラー | 不正なレスポンス | score: 50, error付き | - |
| 4 | APIエラー | 500エラー | score: 50, error付き | - |
| 5 | リトライ成功 | 1回目429、2回目成功 | 正常なスコア | リトライロジック |

**モック**:

```python
@patch('vertexai.generative_models.GenerativeModel')
def test_evaluate_theme_success(mock_model):
    # Setup mock
    mock_response = Mock()
    mock_response.text = '{"score": 85, "comment": "素晴らしい笑顔です"}'
    mock_model.return_value.generate_content.return_value = mock_response

    # Test
    result = evaluate_theme(b"fake_image_bytes")

    # Assert
    assert result['score'] == 85
    assert '素晴らしい' in result['comment']
    assert 'error' not in result
```

---

#### `calculate_average_hash(image_bytes: bytes) -> str`

**目的**: Average Hashを計算

**テストケース**:

| No | テストケース | 入力 | 期待される出力 | 備考 |
|----|-------------|------|---------------|------|
| 1 | 正常計算 | 有効な画像 | `"abcd1234efgh5678"` | 16文字のhash |
| 2 | 同じ画像 | 同一画像 | 同じhash | 再現性確認 |
| 3 | 類似画像 | 類似画像 | Hamming距離が小さい | 類似判定用 |
| 4 | 画像エラー | 不正な画像データ | `"error_XXXX"` | フォールバック |

**実装例**:

```python
def test_calculate_average_hash():
    # Load test image
    with open('test_data/sample.jpg', 'rb') as f:
        image_bytes = f.read()

    # Test
    hash_value = calculate_average_hash(image_bytes)

    # Assert
    assert len(hash_value) == 16
    assert hash_value.isalnum()
```

---

#### `is_similar_image()`

**シグネチャ**: `(new_hash, existing_hashes, threshold) -> bool`

**目的**: ハッシュの類似性を判定

**テストケース**:

| No | テストケース | 入力 | 期待される出力 | 備考 |
|----|-------------|------|---------------|------|
| 1 | 完全一致 | hash1 = hash2 | `True` | Hamming距離=0 |
| 2 | 類似（距離5） | hash1, hash2（距離5） | `True` | threshold=8 |
| 3 | 非類似（距離10） | hash1, hash2（距離10） | `False` | threshold=8 |
| 4 | 複数比較 | hash1, [hash2, hash3, ...] | 最小距離で判定 | - |
| 5 | エラーハッシュ | `"error_1234"` | `False`（スキップ） | - |

**実装例**:

```python
def test_is_similar_image_similar():
    new_hash = "abcd1234efgh5678"
    existing_hashes = ["abcd1234efgh5679"]  # 距離=1

    result = is_similar_image(new_hash, existing_hashes, threshold=8)

    assert result == True

def test_is_similar_image_not_similar():
    new_hash = "abcd1234efgh5678"
    existing_hashes = ["0000000000000000"]  # 距離>8

    result = is_similar_image(new_hash, existing_hashes, threshold=8)

    assert result == False
```

---

#### `generate_scores_with_vision_api()`

**シグネチャ**: `(image_id, request_id) -> Dict[str, Any]`

**目的**: 統合スコアリング（Vision + Vertex + Hash）

**テストケース**:

| No | テストケース | モック内容 | 期待される出力 | 備考 |
|----|-------------|-----------|---------------|------|
| 1 | 全て正常 | Vision成功, Vertex成功, Hash成功 | 正しいtotal_score | ペナルティなし |
| 2 | 類似画像 | existing_hashes に類似ハッシュ | `total_score × 0.33` | ペナルティ適用 |
| 3 | Visionエラー | Vision失敗 | フォールバックスコア、エラーフラグ | `has_errors=True` |
| 4 | Vertexエラー | Vertex失敗 | フォールバックスコア、エラーフラグ | `has_errors=True` |
| 5 | 両方エラー | Vision失敗, Vertex失敗 | 両方のエラーフラグ | - |

**モック例**:

```python
@patch('src.functions.scoring.main.calculate_smile_score')
@patch('src.functions.scoring.main.evaluate_theme')
@patch('src.functions.scoring.main.calculate_average_hash')
@patch('src.functions.scoring.main.get_existing_hashes_for_user')
@patch('src.functions.scoring.main.download_image_from_storage')
def test_generate_scores_normal(
    mock_download, mock_get_hashes, mock_hash, mock_theme, mock_vision
):
    # Setup mocks
    mock_download.return_value = b"fake_image"
    mock_vision.return_value = {
        'smile_score': 450, 'face_count': 5, 'smiling_faces': 5
    }
    mock_theme.return_value = {'score': 80, 'comment': 'Great!'}
    mock_hash.return_value = "abc123"
    mock_get_hashes.return_value = []

    # Test
    result = generate_scores_with_vision_api("img_001", "req_001")

    # Assert
    assert result['smile_score'] == 450
    assert result['ai_score'] == 80
    assert result['total_score'] == 360.0  # 450 × 80 / 100
    assert 'has_errors' not in result
```

---

### 1.2 Webhook関数（webhook/main.py）

#### `handle_text_message(event: MessageEvent)`

**目的**: テキストメッセージでユーザー登録

**テストケース**:

| No | テストケース | 入力 | 期待される動作 | 備考 |
|----|-------------|------|---------------|------|
| 1 | 新規登録 | "山田太郎" | Firestoreに登録、確認メッセージ返信 | - |
| 2 | 既存ユーザー | "山田太郎"（2回目） | 登録済みメッセージ返信 | - |
| 3 | 空白文字 | "   " | エラーメッセージ | バリデーション |
| 4 | 長すぎる名前 | "あ" × 100 | エラーメッセージ | バリデーション |

---

#### `handle_image_message(event: MessageEvent)`

**目的**: 画像メッセージでスコアリング開始

**テストケース**:

| No | テストケース | 入力 | 期待される動作 | 備考 |
|----|-------------|------|---------------|------|
| 1 | 正常投稿 | 画像メッセージ | Storage保存、Scoring関数呼び出し | - |
| 2 | 未登録ユーザー | 画像（未登録） | 登録促すメッセージ | - |
| 3 | 画像ダウンロード失敗 | - | エラーメッセージ | LINE APIエラー |

---

## 2. テストディレクトリ構成

```text
tests/
├── unit/
│   ├── __init__.py
│   ├── conftest.py              # pytest fixtures
│   ├── test_scoring.py          # scoring/main.py のテスト
│   │   ├── test_calculate_smile_score
│   │   ├── test_evaluate_theme
│   │   ├── test_calculate_average_hash
│   │   ├── test_is_similar_image
│   │   └── test_generate_scores_with_vision_api
│   ├── test_webhook.py          # webhook/main.py のテスト
│   │   ├── test_handle_follow
│   │   ├── test_handle_text_message
│   │   └── test_handle_image_message
│   └── test_utils.py            # ユーティリティ関数
├── integration/
│   ├── __init__.py
│   ├── test_firestore.py
│   ├── test_storage.py
│   └── test_api.py
├── e2e/
│   ├── __init__.py
│   └── test_user_flow.py
└── test_data/                   # テスト用画像
    ├── happy_group_5.jpg
    ├── happy_couple.jpg
    └── ...
```

---

## 3. pytest設定

**pyproject.toml**:

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = [
    "--cov=src",
    "--cov-report=html",
    "--cov-report=term-missing",
    "--cov-fail-under=80",
    "-v"
]
```

**requirements-dev.txt**:

```text
pytest==8.1.0
pytest-cov==4.1.0
pytest-mock==3.12.0
pytest-asyncio==0.23.0
```

---

## 4. 次のステップ

1. ✅ ユニットテスト設計ドキュメント作成（本ドキュメント）
2. ⏳ `tests/unit/test_scoring.py` 実装
3. ⏳ `tests/unit/test_webhook.py` 実装
4. ⏳ テストデータ準備（画像）
5. ⏳ CI/CD統合（GitHub Actions）
