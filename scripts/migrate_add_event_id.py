#!/usr/bin/env python3
"""
Migration script to add event_id field to existing documents.

This script adds 'event_id' = 'test' to all existing documents in:
- images collection
- users collection

Run this once after implementing multi-event support.
"""

import os
import sys
from google.cloud import firestore


def migrate_images_collection(db: firestore.Client, event_id: str = "test"):
    """
    Add event_id to all documents in images collection.

    Args:
        db: Firestore client
        event_id: Event ID to set (default: "test")
    """
    print(f"Migrating images collection (event_id = '{event_id}')...")

    images_ref = db.collection("images")
    docs = images_ref.stream()

    updated_count = 0
    skipped_count = 0

    for doc in docs:
        data = doc.to_dict()

        # Skip if event_id already exists
        if "event_id" in data:
            print(f"  ⏭️  Skipped {doc.id} (already has event_id: {data['event_id']})")
            skipped_count += 1
            continue

        # Add event_id field
        doc.reference.update({"event_id": event_id})
        print(f"  ✅ Updated {doc.id}")
        updated_count += 1

    print("\n✅ Images migration complete:")
    print(f"   Updated: {updated_count} documents")
    print(f"   Skipped: {skipped_count} documents")


def migrate_users_collection(db: firestore.Client, event_id: str = "test"):
    """
    Add event_id to all documents in users collection.

    Args:
        db: Firestore client
        event_id: Event ID to set (default: "test")
    """
    print(f"\nMigrating users collection (event_id = '{event_id}')...")

    users_ref = db.collection("users")
    docs = users_ref.stream()

    updated_count = 0
    skipped_count = 0

    for doc in docs:
        data = doc.to_dict()

        # Skip if event_id already exists
        if "event_id" in data:
            print(f"  ⏭️  Skipped {doc.id} (already has event_id: {data['event_id']})")
            skipped_count += 1
            continue

        # Add event_id field
        doc.reference.update({"event_id": event_id})
        print(f"  ✅ Updated {doc.id}")
        updated_count += 1

    print("\n✅ Users migration complete:")
    print(f"   Updated: {updated_count} documents")
    print(f"   Skipped: {skipped_count} documents")


def main():
    """Main migration function."""
    # Get event_id from environment or use default
    event_id = os.environ.get("CURRENT_EVENT_ID", "test")

    print("=" * 60)
    print("EVENT_ID MIGRATION SCRIPT")
    print("=" * 60)
    print(f"Target event_id: {event_id}")
    print()

    # Confirm before proceeding
    response = input(f"Add event_id='{event_id}' to all existing documents? [y/N]: ")
    if response.lower() != "y":
        print("❌ Migration cancelled")
        sys.exit(0)

    # Initialize Firestore client
    db = firestore.Client()

    # Migrate both collections
    migrate_images_collection(db, event_id)
    migrate_users_collection(db, event_id)

    print()
    print("=" * 60)
    print("✅ MIGRATION COMPLETE")
    print("=" * 60)
    print()
    print("Next steps:")
    print("  1. Verify data in Firestore Console")
    print("  2. Test frontend ranking display")
    print("  3. Test LINE Bot image submission")


if __name__ == "__main__":
    main()
