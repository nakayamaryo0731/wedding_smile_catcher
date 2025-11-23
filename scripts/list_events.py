#!/usr/bin/env python3
"""
List all events in Firestore

Usage:
    python scripts/list_events.py
"""

from google.cloud import firestore


def list_events():
    """List all events in Firestore"""
    db = firestore.Client()

    events_ref = db.collection("events")
    events = events_ref.order_by(
        "event_date", direction=firestore.Query.DESCENDING
    ).stream()

    print("📅 イベント一覧")
    print("=" * 100)

    event_list = []
    for event in events:
        event_list.append(event.to_dict())

    if not event_list:
        print("イベントが見つかりませんでした。")
        print("")
        print("新規イベントを作成するには:")
        print(
            "  python scripts/create_event.py --event-id=<id> --event-name=<name> --event-date=<date>"
        )
        return

    for data in event_list:
        status_emoji = {"test": "🧪", "active": "✅", "archived": "📦"}.get(
            data.get("status", "active"), "❓"
        )

        print(f"{status_emoji} {data['event_id']}")
        print(f"   名前: {data['event_name']}")
        print(f"   日付: {data['event_date']}")
        print(f"   状態: {data['status']}")

        if "created_at" in data and data["created_at"]:
            created = data["created_at"]
            if hasattr(created, "strftime"):
                print(f"   作成: {created.strftime('%Y-%m-%d %H:%M:%S')}")

        print("-" * 100)

    print("")
    print(f"合計: {len(event_list)} イベント")


def main():
    list_events()


if __name__ == "__main__":
    main()
