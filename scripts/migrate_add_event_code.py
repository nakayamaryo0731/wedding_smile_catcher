#!/usr/bin/env python3
"""
Migration script: Add event_code to existing events that don't have one.

Usage:
    python scripts/migrate_add_event_code.py [--account-id=FIREBASE_AUTH_UID] [--dry-run]
"""

import argparse
import uuid

from google.cloud import firestore


def migrate(account_id: str | None = None, dry_run: bool = False):
    """Add event_code and account_id to existing events."""
    db = firestore.Client()
    events_ref = db.collection("events")
    events = events_ref.stream()

    updated = 0
    skipped = 0

    for event_doc in events:
        data = event_doc.to_dict()
        updates = {}

        if not data.get("event_code"):
            updates["event_code"] = str(uuid.uuid4())

        if not data.get("account_id") and account_id:
            updates["account_id"] = account_id

        if not updates:
            skipped += 1
            print(f"  SKIP {event_doc.id} (already has event_code/account_id)")
            continue

        if dry_run:
            print(f"  DRY-RUN {event_doc.id}: would set {updates}")
        else:
            events_ref.document(event_doc.id).update(updates)
            print(f"  UPDATED {event_doc.id}: {updates}")

        updated += 1

    print("")
    print(f"Updated: {updated}, Skipped: {skipped}")
    if dry_run:
        print("(dry-run mode, no changes written)")


def main():
    parser = argparse.ArgumentParser(description="Add event_code to existing events")
    parser.add_argument(
        "--account-id",
        default=None,
        help="Firebase Auth UID to assign as owner of existing events",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without writing",
    )
    args = parser.parse_args()
    migrate(account_id=args.account_id, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
