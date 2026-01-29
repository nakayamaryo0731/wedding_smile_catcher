#!/usr/bin/env python3
"""
Test Data Cleanup Script

Deletes all test data from Firestore and Cloud Storage in one execution.
Preserves the `accounts` collection (operator accounts).

Usage:
    python scripts/cleanup_test_data.py

Requirements:
    - google-cloud-firestore
    - google-cloud-storage
    - Authenticated with GCP (gcloud auth application-default login)
"""

import sys

from google.cloud import firestore, storage

# Configuration
PROJECT_ID = "wedding-smile-catcher"
STORAGE_BUCKET = "wedding-smile-images-wedding-smile-catcher"
COLLECTIONS_TO_DELETE = ["images", "users", "events"]
BATCH_SIZE = 500


def get_collection_count(db: firestore.Client, collection_name: str) -> int:
    """Get the number of documents in a collection."""
    docs = db.collection(collection_name).stream()
    return sum(1 for _ in docs)


def delete_collection(db: firestore.Client, collection_name: str) -> int:
    """Delete all documents in a collection using batch operations."""
    collection_ref = db.collection(collection_name)
    deleted = 0

    while True:
        docs = list(collection_ref.limit(BATCH_SIZE).stream())

        if not docs:
            break

        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
            deleted += 1

        batch.commit()
        print(f"  Deleted {deleted} documents from {collection_name}...")

    return deleted


def get_storage_object_count(bucket) -> int:
    """Get the number of objects in a bucket."""
    blobs = list(bucket.list_blobs())
    return len(blobs)


def delete_all_storage_objects(bucket) -> int:
    """Delete all objects in a bucket."""
    blobs = list(bucket.list_blobs())
    deleted = 0

    for blob in blobs:
        blob.delete()
        deleted += 1
        if deleted % 100 == 0:
            print(f"  Deleted {deleted} objects from Cloud Storage...")

    return deleted


def main():
    print("=" * 60)
    print("  Test Data Cleanup Script")
    print("=" * 60)
    print()
    print(f"Project: {PROJECT_ID}")
    print(f"Storage Bucket: {STORAGE_BUCKET}")
    print(f"Collections to delete: {', '.join(COLLECTIONS_TO_DELETE)}")
    print("Collections to preserve: accounts")
    print()

    # Initialize clients
    db = firestore.Client(project=PROJECT_ID)
    storage_client = storage.Client(project=PROJECT_ID)
    bucket = storage_client.bucket(STORAGE_BUCKET)

    # Count documents and objects
    print("Counting documents and objects...")
    print()

    counts = {}
    for collection in COLLECTIONS_TO_DELETE:
        counts[collection] = get_collection_count(db, collection)
        print(f"  Firestore/{collection}: {counts[collection]} documents")

    storage_count = get_storage_object_count(bucket)
    print(f"  Cloud Storage/{STORAGE_BUCKET}: {storage_count} objects")
    print()

    total_docs = sum(counts.values())
    total_items = total_docs + storage_count

    if total_items == 0:
        print("No data to delete. Already clean!")
        return 0

    # Confirmation
    print("-" * 60)
    print(f"Total: {total_docs} Firestore documents + {storage_count} Storage objects")
    print("-" * 60)
    print()
    print("WARNING: This action cannot be undone!")
    print()

    confirm = input("Type 'DELETE' to confirm deletion: ")
    if confirm != "DELETE":
        print("Cancelled.")
        return 1

    print()
    print("Starting deletion...")
    print()

    # Delete Firestore collections
    for collection in COLLECTIONS_TO_DELETE:
        if counts[collection] > 0:
            print(f"Deleting {collection} collection...")
            deleted = delete_collection(db, collection)
            print(f"  ✅ {collection}: {deleted} documents deleted")
        else:
            print(f"  ⏭️  {collection}: already empty")

    # Delete Cloud Storage objects
    if storage_count > 0:
        print("Deleting Cloud Storage objects...")
        deleted = delete_all_storage_objects(bucket)
        print(f"  ✅ Cloud Storage: {deleted} objects deleted")
    else:
        print("  ⏭️  Cloud Storage: already empty")

    print()
    print("=" * 60)
    print("  Cleanup completed successfully!")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
