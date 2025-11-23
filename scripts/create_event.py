#!/usr/bin/env python3
"""
Create a new event in Firestore

Usage:
    python scripts/create_event.py \
        --event-id="wedding_20250315_tanaka" \
        --event-name="田中太郎 & 花子 結婚式" \
        --event-date="2025-03-15" \
        --status="active"
"""

import argparse
from google.cloud import firestore


def create_event(event_id: str, event_name: str, event_date: str, status: str = 'active'):
    """Create a new event in Firestore"""
    db = firestore.Client()

    # Check if event already exists
    event_ref = db.collection('events').document(event_id)
    if event_ref.get().exists:
        print(f"❌ Event already exists: {event_id}")
        print("Use a different event_id or delete the existing event first.")
        return

    # Create event
    event_ref.set({
        'event_id': event_id,
        'event_name': event_name,
        'event_date': event_date,
        'status': status,
        'created_at': firestore.SERVER_TIMESTAMP,
        'settings': {
            'theme': '笑顔（Smile For You）',
            'max_uploads_per_user': 10,
            'similarity_threshold': 8,
            'similarity_penalty': 0.33
        }
    })

    print(f"✅ Event created successfully!")
    print(f"")
    print(f"📅 Event Details:")
    print(f"  ID: {event_id}")
    print(f"  Name: {event_name}")
    print(f"  Date: {event_date}")
    print(f"  Status: {status}")
    print(f"")
    print(f"🔄 Next steps:")
    print(f"  1. Update Cloud Functions environment variables:")
    print(f"     gcloud functions deploy webhook --update-env-vars=\"CURRENT_EVENT_ID={event_id}\"")
    print(f"     gcloud functions deploy scoring --update-env-vars=\"CURRENT_EVENT_ID={event_id}\"")
    print(f"")
    print(f"  2. Redeploy frontend:")
    print(f"     NEXT_PUBLIC_CURRENT_EVENT_ID={event_id} npm run build")
    print(f"     firebase deploy --only hosting")
    print(f"")
    print(f"  Or use the convenience script:")
    print(f"     ./scripts/switch_event.sh {event_id}")


def main():
    parser = argparse.ArgumentParser(description='Create a new event in Firestore')
    parser.add_argument('--event-id', required=True, help='Unique event ID (e.g., wedding_20250315_tanaka)')
    parser.add_argument('--event-name', required=True, help='Human-readable event name')
    parser.add_argument('--event-date', required=True, help='Event date (YYYY-MM-DD)')
    parser.add_argument('--status', default='active', choices=['test', 'active', 'archived'],
                        help='Event status (default: active)')

    args = parser.parse_args()

    create_event(
        event_id=args.event_id,
        event_name=args.event_name,
        event_date=args.event_date,
        status=args.status
    )


if __name__ == "__main__":
    main()
