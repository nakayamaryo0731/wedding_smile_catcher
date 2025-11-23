# 負荷試験 (Load Testing)

Locustを使用した負荷試験で、システムのスケーラビリティとパフォーマンスを検証します。

## インストール

```bash
pip install locust
# または
pip install -r requirements-dev.txt
```

## 負荷試験シナリオ

### 1. 通常負荷試験（WeddingGuestUser）

結婚式の実際の使用パターンをシミュレーション：

- **画像アップロード（頻度：高）**: 10の重み
- **ランキング確認（頻度：中）**: 2の重み
- **ヘルプ確認（頻度：低）**: 1の重み

**期待される動作**:

- 50-100ユーザーが同時に使用
- 各ユーザーは2-10秒ごとにアクションを実行

### 2. スパイク負荷試験（SpikeLoadUser）

乾杯直後など、ゲストが一斉に写真を撮るシナリオ：

- 短時間（0.5-2秒）で連続アップロード
- Cold start性能のテスト
- Auto-scalingの検証

## 実行方法

### Web UIモード（推奨）

```bash
# ローカル開発環境に対して
locust -f tests/load/locustfile.py --host=http://localhost:8080

# 本番環境に対して
locust -f tests/load/locustfile.py --host=https://YOUR_CLOUD_FUNCTION_URL
```

ブラウザで `http://localhost:8089` を開いて：

1. **Number of users**: 50（同時ユーザー数）
2. **Spawn rate**: 10（1秒あたりの増加ユーザー数）
3. **Host**: Cloud Functionsのエンドポイント
4. **Start** をクリック

### ヘッドレスモード

CI/CDや自動化に適したコマンドラインモード：

```bash
# 50ユーザー、5分間実行
locust -f tests/load/locustfile.py \\
       --host=https://YOUR_CLOUD_FUNCTION_URL \\
       --users 50 \\
       --spawn-rate 10 \\
       --run-time 5m \\
       --headless \\
       --html=load_test_report.html
```

### 結婚式想定シナリオ

```bash
# 100ゲスト、ピーク時のシミュレーション
locust -f tests/load/locustfile.py \\
       --host=https://YOUR_CLOUD_FUNCTION_URL \\
       --users 100 \\
       --spawn-rate 20 \\
       --run-time 10m \\
       --headless
```

## 監視指標

### 1. レスポンスタイム

- **目標**: 95パーセンタイルで2秒以内
- **許容**: 最大5秒
- **測定**: Locust Web UIの "Response times" グラフ

### 2. エラー率

- **目標**: 0%
- **許容**: 1%未満
- **測定**: Locust Web UIの "Failures" タブ

### 3. スループット

- **目標**: 50 requests/sec（ピーク時）
- **通常**: 10-20 requests/sec
- **測定**: Locust Web UIの "Total Requests per Second"

### 4. Cloud Functions指標

Google Cloud Consoleで監視：

- **Cold Start時間**: 最初のリクエスト遅延
- **Instance数**: Auto-scaling動作
- **メモリ使用率**: リソース最適化
- **エラーログ**: 失敗原因の特定

## テストケース

### ケース1: 通常使用パターン

```bash
locust -f tests/load/locustfile.py:WeddingGuestUser \\
       --host=https://YOUR_URL \\
       --users 50 \\
       --spawn-rate 5 \\
       --run-time 10m
```

**期待される結果**:

- ✅ 95% のリクエストが2秒以内に完了
- ✅ エラー率 < 1%
- ✅ Cloud Functionsが適切にスケール

### ケース2: スパイク負荷

```bash
locust -f tests/load/locustfile.py:SpikeLoadUser \\
       --host=https://YOUR_URL \\
       --users 100 \\
       --spawn-rate 50 \\
       --run-time 2m
```

**期待される結果**:

- ✅ Cold startでも5秒以内に応答
- ✅ Vision API rate limitに到達しない
- ✅ Firestoreの書き込みスロットリングなし

### ケース3: 持続負荷

```bash
locust -f tests/load/locustfile.py \\
       --host=https://YOUR_URL \\
       --users 30 \\
       --spawn-rate 5 \\
       --run-time 30m
```

**期待される結果**:

- ✅ 長時間安定稼働
- ✅ メモリリークなし
- ✅ 一貫したレスポンスタイム

## トラブルシューティング

### エラー率が高い

```bash
# 詳細ログを確認
locust -f tests/load/locustfile.py --loglevel DEBUG
```

**原因と対策**:

- **429 Too Many Requests**: Vision API rate limitに到達
  - → `--spawn-rate`を下げる
  - → APIクォータを確認
- **500 Internal Server Error**: Cloud Functions内部エラー
  - → Cloud Loggingでスタックトレース確認
  - → メモリ/タイムアウト設定を見直し
- **503 Service Unavailable**: リソース不足
  - → Cloud Functionsのインスタンス上限を確認

### レスポンスが遅い

**確認項目**:

1. **Cold start**: 最初のリクエストが遅い
   - → Min instancesを設定（本番時）
2. **Vision API遅延**: 外部API待機
   - → タイムアウト設定を最適化
3. **Firestore遅延**: クエリ最適化
   - → インデックスを確認

### 接続エラー

```bash
# ネットワーク接続を確認
curl https://YOUR_CLOUD_FUNCTION_URL/webhook
```

## ベストプラクティス

### 本番前のテスト手順

1. **開発環境で基本テスト**

   ```bash
   locust --users 10 --spawn-rate 2 --run-time 2m
   ```

2. **ステージング環境で負荷テスト**

   ```bash
   locust --users 50 --spawn-rate 10 --run-time 10m
   ```

3. **本番想定の負荷テスト**

   ```bash
   locust --users 100 --spawn-rate 20 --run-time 30m
   ```

4. **レポート生成と分析**

   ```bash
   locust --headless --html=report.html
   ```

### コスト管理

負荷試験はAPIコール料金が発生します：

- **Vision API**: 1000リクエストまで無料、以降 $1.50/1000
- **Vertex AI (Gemini)**: 使用量に応じて課金
- **Cloud Functions**: 呼び出し回数 + 実行時間

**推奨**:

- 開発環境でテスト（モックAPI使用）
- 本番環境テストは本番直前のみ（1-2回）
- 短時間で効率的にテスト（5-10分）

## CI/CD統合（将来）

```yaml
# .github/workflows/load-test.yml
- name: Run load test
  run: |
    locust -f tests/load/locustfile.py \\
           --host=${{ secrets.STAGING_URL }} \\
           --users 20 \\
           --spawn-rate 5 \\
           --run-time 3m \\
           --headless \\
           --html=load_test_report.html

- name: Upload load test report
  uses: actions/upload-artifact@v3
  with:
    name: load-test-report
    path: load_test_report.html
```

## 参考資料

- [Locust Documentation](https://docs.locust.io/)
- [Cloud Functions Performance Tips](https://cloud.google.com/functions/docs/bestpractices/tips)
- [Vision API Quotas](https://cloud.google.com/vision/quotas)
