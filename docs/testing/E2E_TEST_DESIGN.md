# E2Eテスト設計（クリティカルシナリオ重視）

Wedding Smile Catcher プロジェクトのE2Eテスト設計

**作成日**: 2025-01-22
**方針**: 結婚式当日に発生する最重要ユーザーフローのみをテスト

---

## 1. E2Eテストの目的

**本番環境（またはステージング環境）で、実際のゲストの行動パターンをシミュレート**し、システム全体が期待通り動作することを確認する。

### テスト対象範囲

- LINE Bot（Webhook処理）
- Cloud Functions（Webhook + Scoring）
- Cloud Storage（画像保存）
- Firestore（データ保存・取得）
- Vision API / Vertex AI（外部API）
- Frontend（ランキング表示）

---

## 2. クリティカルシナリオ

結婚式で**絶対に失敗できない2つのシナリオ**のみを厳選。

### シナリオ1: 新規ユーザー登録 → 画像投稿 → スコア返信（最重要）

**目的**: メインフローが正常に動作することを確認

**前提条件**:

- テスト用LINE Botアカウント作成済み
- テスト用画像準備済み（`tests/test_data/happy_couple.jpg`）

**手順**:

1. テストユーザーがLINE Botを友だち追加
2. Follow Eventを受信 → ウェルカムメッセージが返信される
3. テキストメッセージで名前を送信（例: "テスト太郎"）
4. Firestoreの`users`コレクションに登録される
5. 登録完了メッセージが返信される
6. 画像メッセージを送信
7. Cloud Storageに画像が保存される
8. Firestoreの`images`コレクションにメタデータが保存される
9. Scoring Functionがトリガーされる
10. Vision API + Vertex AIでスコア計算される
11. Firestoreに`total_score`が保存される
12. LINEにスコア結果が返信される（「あなたのスコア: 382点」など）

**期待される結果**:

- ✅ ユーザー登録成功
- ✅ 画像がCloud Storageに保存される
- ✅ スコアがFirestoreに保存される
- ✅ LINEに結果が返信される（10-15秒以内）
- ✅ エラーメッセージが表示されない

**確認方法**:

```python
import pytest
import requests
from google.cloud import firestore, storage
import time

db = firestore.Client()
storage_client = storage.Client()

def test_e2e_new_user_flow():
    """
    E2E: 新規ユーザー登録 → 画像投稿 → スコア返信
    """
    # 1. LINE BotにFollow Event送信（手動 or LINE Bot API）
    # ※ LINE側のWebhook URLに手動でPOSTするか、LINE Bot SDKを使用

    # 2. テキストメッセージで名前送信（手動 or API）
    # ※ 実際のLINE Botでテスト

    # 3. Firestoreにユーザーが登録されたか確認
    time.sleep(2)  # 登録完了を待つ
    user_ref = db.collection('users').document('test_user_e2e')
    user_doc = user_ref.get()
    assert user_doc.exists, "User not registered in Firestore"
    assert user_doc.to_dict()['name'] == 'テスト太郎'

    # 4. 画像メッセージ送信（手動 or API）
    # ※ 実際のLINE Botでテスト

    # 5. Cloud Storageに画像が保存されたか確認
    time.sleep(3)  # 画像アップロード完了を待つ
    bucket = storage_client.bucket('wedding-smile-images')
    blobs = list(bucket.list_blobs(prefix='original/test_user_e2e/'))
    assert len(blobs) > 0, "Image not uploaded to Cloud Storage"

    # 6. Firestoreにスコアが保存されたか確認
    time.sleep(15)  # スコアリング完了を待つ（Vision API + Vertex AI）
    images_ref = db.collection('images').where('user_id', '==', 'test_user_e2e')
    images = list(images_ref.stream())
    assert len(images) > 0, "Image metadata not saved in Firestore"

    image_data = images[0].to_dict()
    assert image_data['status'] == 'completed', "Image scoring not completed"
    assert image_data['total_score'] > 0, "Score is 0 or missing"

    # 7. LINEに結果が返信されたか確認（手動確認）
    print(f"✅ E2E Test Passed: User={user_doc.id}, Score={image_data['total_score']}")
```

---

### シナリオ2: ランキング表示（重要）

**目的**: フロントエンドで正しくTop 3が表示され、リアルタイム更新されることを確認

**前提条件**:

- 複数のユーザーで画像が投稿済み
- Frontend（Firebase Hosting）デプロイ済み

**手順**:

1. ブラウザでフロントエンドにアクセス（`https://wedding-smile-catcher.web.app`）
2. Top 3が表示される
3. 新しい高スコア画像を投稿
4. 1分以内にランキングが更新される（1分ポーリング設定）

**期待される結果**:

- ✅ Top 3が正しく表示される
- ✅ 同一ユーザーが重複していない
- ✅ スコアが高い順に並んでいる
- ✅ 新しい高スコア画像が1分以内に反映される

**確認方法**:

```python
def test_e2e_frontend_ranking():
    """
    E2E: フロントエンドでランキングが正しく表示されるか確認
    """
    # 1. Firestoreから実際のTop 3を取得
    top_images = (
        db.collection('images')
        .where('status', '==', 'completed')
        .order_by('total_score', direction=firestore.Query.DESCENDING)
        .limit(100)
        .get()
    )

    # 2. ユニークユーザーでフィルタリング
    seen_users = set()
    unique_top3 = []
    for doc in top_images:
        data = doc.to_dict()
        if data['user_id'] not in seen_users:
            seen_users.add(data['user_id'])
            unique_top3.append(data)
            if len(unique_top3) >= 3:
                break

    # 3. フロントエンドをスクレイピング（または手動確認）
    # ※ Seleniumやrequests-htmlでHTMLを取得し、表示内容を確認
    # または手動で目視確認

    print(f"✅ Top 3 (Expected):")
    for i, img in enumerate(unique_top3, 1):
        print(f"  {i}. {img['user_id']}: {img['total_score']}")

    # 手動確認: フロントエンドの表示が上記と一致するか目視
```

---

## 3. テスト実施方法

### 3.1 手動テスト（推奨）

E2Eテストは**完全自動化が困難**（LINE Bot APIの制約）なため、以下の方法で実施：

1. **テスト用LINE Botチャネル作成**
2. **手動でメッセージ送信**（スマホアプリまたはLINE Developer Console）
3. **Firestore/Storageを確認**（GCP Console or pytest）
4. **フロントエンド表示を確認**（ブラウザ）

### 3.2 半自動テスト（オプション）

Pythonスクリプトで一部自動化：

```python
# tests/e2e/test_user_flow.py
import pytest
from google.cloud import firestore, storage
import time

db = firestore.Client()
storage_client = storage.Client()

def test_e2e_main_flow():
    """
    メインフローのE2Eテスト
    ※ LINE Botへのメッセージ送信は手動で実施
    """
    print("\n========================================")
    print("E2E Test: Main Flow")
    print("========================================")
    print("1. LINE Botを友だち追加してください")
    print("2. 名前「テスト太郎」を送信してください")
    input("準備ができたらEnterを押してください...")

    # Firestoreにユーザーが登録されたか確認
    time.sleep(3)
    user_id = input("LINE User IDを入力してください: ")
    user_ref = db.collection('users').document(user_id)
    user_doc = user_ref.get()
    assert user_doc.exists, "❌ User not registered"
    print(f"✅ User registered: {user_doc.to_dict()['name']}")

    print("\n3. 画像を送信してください")
    input("送信したらEnterを押してください...")

    # スコアリング完了を待つ
    print("⏳ スコアリング完了を待っています（最大20秒）...")
    time.sleep(20)

    # Firestoreにスコアが保存されたか確認
    images = list(db.collection('images').where('user_id', '==', user_id).stream())
    assert len(images) > 0, "❌ Image not saved"
    image_data = images[0].to_dict()
    assert image_data['status'] == 'completed', "❌ Scoring not completed"
    print(f"✅ Score calculated: {image_data['total_score']}")

    print("\n========================================")
    print("E2E Test PASSED!")
    print("========================================")
```

---

## 4. テスト環境

### 4.1 本番前テスト（Dry Run）

**実施タイミング**: 結婚式の1週間前

**環境**: 本番環境（`wedding-smile-catcher`）

**参加者**: 新郎新婦 + 数名の友人

**目的**: 実際のゲストと同じ環境で、システム全体が正常に動作することを確認

**手順**:

1. テスト参加者にLINE Bot URLを共有
2. 各自で登録 → 画像投稿
3. スコアが正しく返ってくるか確認
4. フロントエンドでランキング表示を確認
5. 異常があればログ確認（Cloud Logging）

---

### 4.2 ステージング環境（オプション）

**環境**: `wedding-smile-catcher-staging`

**用途**: 本番デプロイ前の最終確認

---

## 5. テスト実施チェックリスト

### 本番前（1週間前）

- [ ] シナリオ1（新規ユーザー → 画像投稿 → スコア返信）が成功
- [ ] シナリオ2（ランキング表示）が正しい
- [ ] エラーが発生しない（Cloud Loggingで確認）
- [ ] 負荷テスト（50件/分の同時投稿）が成功

### 当日朝

- [ ] システムが起動している（Cloud Functions, Firebase Hosting）
- [ ] Firestoreが空（または初期データのみ）
- [ ] ダミーデータでテスト投稿が成功

---

## 6. トラブルシューティング

### よくある問題

| 問題 | 原因 | 対処法 |
|------|------|--------|
| スコアが返ってこない | Scoring Function失敗 | Cloud Loggingでエラー確認 |
| 画像が保存されない | Storage権限エラー | IAM設定確認 |
| ランキングが更新されない | Firestore書き込み失敗 | Security Rules確認 |
| Vision APIエラー | API quota超過 | GCP Consoleでquota確認 |

### 緊急対応

**結婚式当日にエラーが発生した場合**:

1. **Cloud Loggingで即座に原因特定**
2. **一時的な回避策**:
   - Vision APIエラー → フォールバックスコア（300点）を返す（実装済み）
   - Vertex AIエラー → フォールバックコメント（実装済み）
3. **ゲストへの案内**:
   - LINEでエラーメッセージを送信
   - 「しばらくしてから再送してください」

---

## 7. 次のステップ

1. ✅ E2Eテスト設計（本ドキュメント）
2. ⏳ テストデータ準備（画像、テストユーザー）
3. ⏳ テスト用LINE Botチャネル作成
4. ⏳ Dry Run実施（本番1週間前）
5. ⏳ 負荷テスト実施

---

## 8. 補足：自動化しない理由

以下の理由により、E2Eテストは**完全自動化せず、手動 or 半自動で実施**する：

1. **LINE Bot APIの制約**: メッセージ送信の自動化が困難
2. **外部API依存**: Vision API, Vertex AIの実際のレスポンスをテストする必要がある
3. **コストvsベネフィット**: 完全自動化のコストが高い割に、Dry Runで十分
4. **一度きりのイベント**: 継続的なテストが不要（結婚式後はシステム停止）

**推奨アプローチ**: 本番1週間前にDry Runを実施し、実際のゲストと同じ環境でテストする
