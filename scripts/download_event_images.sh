#!/bin/bash
set -e

# Wedding Smile Catcher - Event Images Downloader
#
# Usage:
#   ./scripts/download_event_images.sh <event_id> [output_dir]
#   ./scripts/download_event_images.sh wedding_20250315_tanaka ./downloads

EVENT_ID=$1
OUTPUT_DIR=${2:-./downloads}

if [ -z "$EVENT_ID" ]; then
  echo "❌ エラー: イベントIDを指定してください"
  echo ""
  echo "使い方:"
  echo "  ./scripts/download_event_images.sh <event_id> [output_dir]"
  echo ""
  echo "例:"
  echo "  ./scripts/download_event_images.sh wedding_20250315_tanaka"
  echo "  ./scripts/download_event_images.sh wedding_20250315_tanaka ./my_downloads"
  exit 1
fi

echo "📥 イベント画像をダウンロード中: $EVENT_ID"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Download images from Cloud Storage
echo "☁️  Cloud Storageからダウンロード中..."
gsutil -m cp -r "gs://wedding-smile-images/$EVENT_ID" "$OUTPUT_DIR/"

# Check download
if [ -d "$OUTPUT_DIR/$EVENT_ID" ]; then
  IMAGE_COUNT=$(find "$OUTPUT_DIR/$EVENT_ID" -type f -name "*.jpg" -o -name "*.png" | wc -l)
  echo ""
  echo "✅ ダウンロード完了"
  echo ""
  echo "📊 ダウンロード統計:"
  echo "  画像数: $IMAGE_COUNT 枚"
  echo "  保存先: $OUTPUT_DIR/$EVENT_ID"
  echo ""

  # Calculate total size
  TOTAL_SIZE=$(du -sh "$OUTPUT_DIR/$EVENT_ID" | cut -f1)
  echo "  合計サイズ: $TOTAL_SIZE"
  echo ""

  # Export metadata
  echo "📋 メタデータをエクスポート中..."
  python scripts/export_event_data.py "$EVENT_ID"

  # Move JSON to output directory
  if [ -f "${EVENT_ID}_data.json" ]; then
    mv "${EVENT_ID}_data.json" "$OUTPUT_DIR/"
    echo "  ✅ メタデータ: $OUTPUT_DIR/${EVENT_ID}_data.json"
  fi

  echo ""
  echo "🎉 全データのダウンロードが完了しました！"
  echo ""
  echo "💡 ZIPアーカイブを作成するには:"
  echo "  cd $OUTPUT_DIR"
  echo "  zip -r ${EVENT_ID}_all_data.zip $EVENT_ID ${EVENT_ID}_data.json"
else
  echo "❌ ダウンロードに失敗しました"
  exit 1
fi
