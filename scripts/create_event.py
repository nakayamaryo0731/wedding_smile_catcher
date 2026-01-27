#!/usr/bin/env python3
"""
Create a new event in Firestore

Usage:
    python scripts/create_event.py \
        --event-id="wedding_20250315_tanaka" \
        --event-name="田中太郎 & 花子 結婚式" \
        --event-date="2025-03-15" \
        --account-id="firebase_auth_uid" \
        --status="active"
"""

import argparse
import uuid

from google.cloud import firestore


def create_event(
    event_id: str,
    event_name: str,
    event_date: str,
    account_id: str,
    status: str = "active",
):
    """Create a new event in Firestore"""
    db = firestore.Client()

    # Check if event already exists
    event_ref = db.collection("events").document(event_id)
    if event_ref.get().exists:
        print(f"Event already exists: {event_id}")
        print("Use a different event_id or delete the existing event first.")
        return

    # Generate unique event_code for LINE Bot JOIN command
    event_code = str(uuid.uuid4())

    # Create event
    event_ref.set(
        {
            "event_id": event_id,
            "event_name": event_name,
            "event_date": event_date,
            "event_code": event_code,
            "account_id": account_id,
            "status": status,
            "created_at": firestore.SERVER_TIMESTAMP,
            "settings": {
                "theme": "笑顔（Smile For You）",
                "max_uploads_per_user": 10,
                "similarity_threshold": 8,
                "similarity_penalty": 0.33,
            },
        }
    )

    print("Event created successfully!")
    print("")
    print("Event Details:")
    print(f"  ID: {event_id}")
    print(f"  Name: {event_name}")
    print(f"  Date: {event_date}")
    print(f"  Event Code: {event_code}")
    print(f"  Account ID: {account_id}")
    print(f"  Status: {status}")
    print("")
    print("Guests join via LINE Bot by sending:")
    print(f"  JOIN {event_code}")


def main():
    parser = argparse.ArgumentParser(description="Create a new event in Firestore")
    parser.add_argument(
        "--event-id",
        required=True,
        help="Unique event ID (e.g., wedding_20250315_tanaka)",
    )
    parser.add_argument("--event-name", required=True, help="Human-readable event name")
    parser.add_argument("--event-date", required=True, help="Event date (YYYY-MM-DD)")
    parser.add_argument(
        "--account-id",
        required=True,
        help="Firebase Auth UID of the event owner",
    )
    parser.add_argument(
        "--status",
        default="active",
        choices=["test", "active", "archived"],
        help="Event status (default: active)",
    )

    args = parser.parse_args()

    create_event(
        event_id=args.event_id,
        event_name=args.event_name,
        event_date=args.event_date,
        account_id=args.account_id,
        status=args.status,
    )


if __name__ == "__main__":
    main()
