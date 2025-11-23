# 統合テスト (Integration Tests)

統合テストは、複数のコンポーネントが連携して正しく動作することを検証します。

## 前提条件

### 1. Firebase CLIのインストール

```bash
npm install -g firebase-tools
```

### 2. Firebase Emulatorの起動

```bash
# Firestoreエミュレータを起動（別ターミナルで実行）
firebase emulators:start --only firestore
```

エミュレータが起動すると、`localhost:8080`でFirestoreエミュレータが利用可能になります。

## テストの実行

### すべての統合テストを実行

```bash
# Firestoreエミュレータが起動している状態で
pytest tests/integration/ -v
```

### 特定のテストを実行

```bash
# スコアリングパイプラインのテストのみ
pytest tests/integration/test_scoring_pipeline.py -v

# 特定のテストケースのみ
pytest tests/integration/test_scoring_pipeline.py::\
TestScoringPipeline::test_full_scoring_flow_with_firestore -v
```

### カバレッジレポート付き実行

```bash
pytest tests/integration/ -v --cov=src --cov-report=html
```

## テスト構成

### テストファイル

- `test_scoring_pipeline.py`: スコアリングパイプライン全体のテスト
  - 完全なスコアリングフロー
  - 類似画像検出
  - ランキングクエリ
  - エラーハンドリング
  - 同時実行

### フィクスチャ (`conftest.py`)

- `firestore_client`: Firestoreエミュレータへの接続
- `clean_firestore`: 各テスト前にデータベースをクリーンアップ
- `mock_storage_client`: Cloud Storageのモック
- `mock_vision_client_integration`: Vision APIのモック
- `mock_vertex_ai_integration`: Vertex AIのモック

## テスト対象

### ✅ カバーされている機能

1. **スコアリングパイプライン**
   - Vision API → smile_score計算
   - Vertex AI → ai_score計算
   - Average Hash → 重複検出
   - 総合スコア計算
   - Firestoreへの保存

2. **類似画像検出**
   - Average Hashの計算
   - Hamming距離による類似判定
   - ペナルティ適用（score × 1/3）

3. **ランキングクエリ**
   - ステータスでフィルタ
   - スコアで降順ソート
   - Top N取得
   - ユニークユーザーフィルタリング

4. **エラーハンドリング**
   - API失敗時の挙動
   - 不正なデータのハンドリング

5. **同時実行**
   - 複数画像の並行処理
   - Firestoreの競合回避

## CI/CD統合

GitHub Actionsでの実行には、Firestoreエミュレータを自動起動します：

```yaml
- name: Start Firestore Emulator
  run: |
    firebase emulators:start --only firestore &
    sleep 5  # エミュレータ起動待機

- name: Run integration tests
  run: |
    pytest tests/integration/ -v
```

## トラブルシューティング

### エミュレータに接続できない

```bash
# エミュレータが起動しているか確認
lsof -i :8080

# 環境変数を確認
echo $FIRESTORE_EMULATOR_HOST  # localhost:8080であるべき
```

### テストが失敗する

```bash
# Firestoreデータを手動でクリア
firebase emulators:start --only firestore --import=./emulator-data --export-on-exit

# または、エミュレータを再起動
```

### パフォーマンスが遅い

- エミュレータのリソース割り当てを増やす
- 不要なログ出力を削減
- テストを並列実行 (`pytest -n auto`)

## 次のステップ

統合テストが完了したら、以下も検討してください：

- **E2Eテスト**: 実際のLINE Botとの連携テスト
- **負荷試験**: 50同時接続のシミュレーション
- **本番前検証**: テスト環境での実データ検証
