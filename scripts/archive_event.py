#!/usr/bin/env python3
"""
Archive an event (change status to 'archived')

Usage:
    python scripts/archive_event.py <event_id>
    python scripts/archive_event.py wedding_20250315_tanaka
"""

import sys
from google.cloud import firestore
from datetime import datetime


def archive_event(event_id: str):
    """Archive an event by changing its status to 'archived'"""
    db = firestore.Client()

    # Check if event exists
    event_ref = db.collection('events').document(event_id)
    event_doc = event_ref.get()

    if not event_doc.exists:
        print(f"❌ Event not found: {event_id}")
        return

    event_data = event_doc.to_dict()

    # Confirm
    print(f"📦 アーカイブ対象イベント:")
    print(f"  ID: {event_id}")
    print(f"  名前: {event_data['event_name']}")
    print(f"  日付: {event_data['event_date']}")
    print(f"  現在の状態: {event_data['status']}")
    print("")

    confirmation = input("このイベントをアーカイブしますか？ (yes/no): ")
    if confirmation.lower() != 'yes':
        print("❌ キャンセルしました")
        return

    # Update status
    event_ref.update({
        'status': 'archived',
        'archived_at': firestore.SERVER_TIMESTAMP
    })

    print("")
    print("✅ イベントをアーカイブしました")
    print("")
    print("📊 データは保持されています。")
    print("将来的に参照したい場合は、event_idを指定してクエリできます。")
    print("")
    print("💾 バックアップを取得するには:")
    print(f"  gcloud firestore export gs://wedding-backup/{event_id}")


def main():
    if len(sys.argv) < 2:
        print("使い方: python scripts/archive_event.py <event_id>")
        print("")
        print("例: python scripts/archive_event.py wedding_20250315_tanaka")
        sys.exit(1)

    event_id = sys.argv[1]
    archive_event(event_id)


if __name__ == "__main__":
    main()
