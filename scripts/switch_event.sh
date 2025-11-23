#!/bin/bash
set -e

# Wedding Smile Catcher - Event Switcher
#
# Usage:
#   ./scripts/switch_event.sh <event_id>
#   ./scripts/switch_event.sh wedding_20250315_tanaka

EVENT_ID=$1

if [ -z "$EVENT_ID" ]; then
  echo "❌ エラー: イベントIDを指定してください"
  echo ""
  echo "使い方:"
  echo "  ./scripts/switch_event.sh <event_id>"
  echo ""
  echo "例:"
  echo "  ./scripts/switch_event.sh wedding_20250315_tanaka"
  echo "  ./scripts/switch_event.sh test"
  echo ""
  echo "利用可能なイベント:"
  python scripts/list_events.py
  exit 1
fi

echo "🔄 イベントを切り替え中: $EVENT_ID"
echo ""

# Check if event exists
echo "📋 イベントの確認中..."
if ! python scripts/event_stats.py "$EVENT_ID" > /dev/null 2>&1; then
  echo "❌ イベントが見つかりません: $EVENT_ID"
  echo ""
  echo "利用可能なイベント:"
  python scripts/list_events.py
  exit 1
fi

# Update Cloud Functions
echo ""
echo "☁️  Cloud Functions の環境変数を更新中..."

gcloud functions deploy webhook \
  --gen2 \
  --update-env-vars="CURRENT_EVENT_ID=$EVENT_ID" \
  --quiet

gcloud functions deploy scoring \
  --gen2 \
  --update-env-vars="CURRENT_EVENT_ID=$EVENT_ID" \
  --quiet

echo "✅ Cloud Functions 更新完了"

# Update Frontend
echo ""
echo "🎨 Frontend を再デプロイ中..."

cd src/frontend
export NEXT_PUBLIC_CURRENT_EVENT_ID=$EVENT_ID
npm run build
firebase deploy --only hosting --quiet
cd ../..

echo "✅ Frontend 更新完了"

# Show confirmation
echo ""
echo "=" * 80
echo "✅ イベント切り替え完了: $EVENT_ID"
echo "=" * 80
echo ""
echo "📊 現在のイベント統計:"
python scripts/event_stats.py "$EVENT_ID"
echo ""
echo "🔗 確認用URL:"
echo "  Frontend: https://wedding-smile-catcher.web.app"
echo "  LINE Bot: LINEアプリで写真を送信してテスト"
