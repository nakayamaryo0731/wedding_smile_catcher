#!/usr/bin/env python3
"""
Export event data (images metadata) to JSON

Usage:
    python scripts/export_event_data.py <event_id>
    python scripts/export_event_data.py wedding_20250315_tanaka
"""

import json
import sys
from datetime import datetime

from google.cloud import firestore


def export_event_data(event_id: str):
    """Export event data to JSON file"""
    db = firestore.Client()

    # Check if event exists
    event_ref = db.collection("events").document(event_id)
    event_doc = event_ref.get()

    if not event_doc.exists:
        print(f"❌ Event not found: {event_id}")
        return

    event_data = event_doc.to_dict()
    if event_data is None:
        print(f"❌ Event data is empty: {event_id}")
        return

    print(f"📦 データエクスポート中: {event_id}")
    print(f"  名前: {event_data['event_name']}")
    print(f"  日付: {event_data['event_date']}")
    print("")

    # Export users
    print("👥 ユーザーデータを取得中...")
    users_ref = db.collection("users").where("event_id", "==", event_id)
    users = []
    for doc in users_ref.stream():
        user_data = doc.to_dict()
        if user_data is None:
            continue
        # Convert Timestamp to string
        if "created_at" in user_data and user_data["created_at"]:
            user_data["created_at"] = user_data["created_at"].isoformat()
        users.append(user_data)

    print(f"  ✅ {len(users)}人のユーザーデータを取得")

    # Export images
    print("📸 画像メタデータを取得中...")
    images_ref = db.collection("images").where("event_id", "==", event_id)
    images = []
    for doc in images_ref.stream():
        image_data = doc.to_dict()
        if image_data is None:
            continue
        image_data["image_id"] = doc.id
        # Convert Timestamp to string
        if "upload_timestamp" in image_data and image_data["upload_timestamp"]:
            image_data["upload_timestamp"] = image_data["upload_timestamp"].isoformat()
        if "scored_at" in image_data and image_data["scored_at"]:
            image_data["scored_at"] = image_data["scored_at"].isoformat()
        images.append(image_data)

    # Sort by score
    images.sort(key=lambda x: x.get("total_score", 0), reverse=True)

    print(f"  ✅ {len(images)}枚の画像メタデータを取得")

    # Convert event timestamps
    if "created_at" in event_data and event_data["created_at"]:
        event_data["created_at"] = event_data["created_at"].isoformat()

    # Create export data
    export_data = {
        "event": event_data,
        "users": users,
        "images": images,
        "exported_at": datetime.now().isoformat(),
    }

    # Write to JSON file
    filename = f"{event_id}_data.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(export_data, f, ensure_ascii=False, indent=2)

    print("")
    print(f"✅ データをエクスポートしました: {filename}")
    print("")
    print("📊 統計:")
    print(f"  ユーザー数: {len(users)}人")
    print(f"  画像数: {len(images)}枚")
    print("")
    print("📁 ファイル情報:")
    import os

    file_size = os.path.getsize(filename)
    print(f"  ファイルサイズ: {file_size / 1024:.2f} KB")
    print("")
    print("💡 次のステップ:")
    print("  1. 画像をダウンロード:")
    print(f"     gsutil -m cp -r gs://wedding-smile-images/{event_id} ./downloads/")
    print("")
    print("  2. ZIPアーカイブを作成:")
    print(f"     zip -r {event_id}_all_data.zip downloads/{event_id} {filename}")


def main():
    if len(sys.argv) < 2:
        print("使い方: python scripts/export_event_data.py <event_id>")
        print("")
        print("例: python scripts/export_event_data.py wedding_20250315_tanaka")
        sys.exit(1)

    event_id = sys.argv[1]
    export_event_data(event_id)


if __name__ == "__main__":
    main()
