#!/usr/bin/env python3
"""
Quick script to check existing Firestore data structure.
"""

from google.cloud import firestore


def main():
    db = firestore.Client()

    # Check images collection
    print("Checking images collection...\n")
    images = db.collection("images").limit(10).get()

    if not images:
        print("❌ No documents found in 'images' collection")
        return

    print(f"✅ Found {len(images)} documents\n")

    # Analyze first few documents
    has_event_id = 0
    missing_event_id = 0

    for doc in images[:5]:
        data = doc.to_dict()
        print(f"Document ID: {doc.id}")
        print(f"  Fields: {list(data.keys())}")
        print(f"  Has event_id: {'event_id' in data}")
        print(f"  Has total_score: {'total_score' in data}")
        print(f"  Has status: {'status' in data}")

        if "event_id" in data:
            print(f"  event_id value: {data['event_id']}")
            has_event_id += 1
        else:
            missing_event_id += 1

        if "total_score" in data:
            print(f"  total_score: {data['total_score']}")

        print()

    # Summary
    print("\n" + "=" * 50)
    print("SUMMARY:")
    print(f"  Documents with event_id: {has_event_id}/5")
    print(f"  Documents missing event_id: {missing_event_id}/5")

    if missing_event_id > 0:
        print("\n⚠️  ISSUE FOUND: Some documents are missing 'event_id' field")
        print("   This will cause the query to return 0 results.")
        print(
            "\n   SOLUTION: Run migration script to add event_id to existing documents:"
        )
        print("   python3 scripts/migrate_add_event_id.py")
    else:
        print("\n✅ All documents have event_id field")


if __name__ == "__main__":
    main()
