#!/usr/bin/env python3
"""
Seed Test Users Script

Creates fake users and their image submissions for LP screenshots.
Uploads images to Cloud Storage and creates Firestore documents with scores.

Usage:
    python scripts/seed_test_users.py --event-id=test --images-dir=./test_images

Requirements:
    - google-cloud-firestore
    - google-cloud-storage
    - Authenticated with GCP (gcloud auth application-default login)

Prepare test images:
    Create a directory with 3+ JPEG images (one per user minimum).
    Images will be assigned to users in order.
"""

import argparse
import random
import subprocess
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from google.cloud import firestore, storage

# Configuration
PROJECT_ID = "wedding-smile-catcher"
STORAGE_BUCKET = "wedding-smile-images-wedding-smile-catcher"
SIGNED_URL_EXPIRATION_HOURS = 12  # Max 12h for system-managed key

# Test users
TEST_USERS = [
    {"fake_user_id": "test_user_yamada", "name": "山田太郎"},
    {"fake_user_id": "test_user_sato", "name": "佐藤花子"},
    {"fake_user_id": "test_user_suzuki", "name": "鈴木一郎"},
]


def generate_signed_url(bucket_name: str, blob_path: str) -> tuple[str, datetime]:
    """Generate a signed URL for a blob using gcloud CLI with service account impersonation."""
    gs_uri = f"gs://{bucket_name}/{blob_path}"
    duration = f"{SIGNED_URL_EXPIRATION_HOURS}h"
    service_account = f"{PROJECT_ID}@appspot.gserviceaccount.com"

    result = subprocess.run(
        [
            "gcloud",
            "storage",
            "sign-url",
            gs_uri,
            f"--duration={duration}",
            f"--impersonate-service-account={service_account}",
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(f"Failed to generate signed URL: {result.stderr}")

    # Parse the output to extract URL (format: "signed_url: <URL>")
    for line in result.stdout.strip().split("\n"):
        if line.startswith("signed_url:"):
            url = line.split("signed_url:", 1)[1].strip()
            expiration = datetime.now(UTC) + timedelta(hours=SIGNED_URL_EXPIRATION_HOURS)
            return url, expiration

    raise RuntimeError(f"Could not parse signed URL from output: {result.stdout}")


TOP_COMMENT = (
    "全員の笑顔が非常に自然で、心からの喜びが伝わります。"
    "目元もよく笑っており、グループ全体の一体感が素晴らしいです。"
    "幸せな瞬間が凝縮された一枚ですね。"
)

OTHER_COMMENTS = [
    "素敵な笑顔ですね！みんなの幸せが伝わってきます✨",
    "最高の笑顔！結婚式にぴったりの一枚です🎉",
    "とても温かい雰囲気の写真ですね！笑顔が輝いています😊",
    "素晴らしい！みんなの笑顔が素敵です💕",
    "幸せいっぱいの写真ですね！最高の瞬間を捉えています🌟",
]


def generate_realistic_scores(is_top: bool = False) -> dict:
    """Generate realistic-looking scores for LP screenshots."""
    # Generate scores that look good for screenshots
    if is_top:
        # Top score should be highest
        face_count = random.randint(4, 6)
        smile_score = round(random.uniform(450, 500), 2)
        ai_score = random.randint(90, 98)
        comment = TOP_COMMENT
    else:
        face_count = random.randint(2, 5)
        smile_score = round(random.uniform(350, 440), 2)
        ai_score = random.randint(75, 89)
        comment = random.choice(OTHER_COMMENTS)

    is_similar = False  # No penalty for test data
    penalty = 0.33 if is_similar else 1.0
    total_score = round((smile_score * ai_score / 100) * penalty, 2)

    return {
        "smile_score": smile_score,
        "ai_score": ai_score,
        "total_score": total_score,
        "comment": comment,
        "face_count": face_count,
        "is_similar": is_similar,
        "average_hash": f"seed_hash_{uuid.uuid4().hex[:8]}",
    }


def create_user_document(db: firestore.Client, user: dict, event_id: str) -> str:
    """Create a user document in Firestore."""
    user_id = user["fake_user_id"]
    doc_id = f"{user_id}_{event_id}"
    user_ref = db.collection("users").document(doc_id)

    user_data = {
        "name": user["name"],
        "event_id": event_id,
        "join_status": "registered",
        "best_score": 0,
        "total_uploads": 0,
        "created_at": firestore.SERVER_TIMESTAMP,
    }

    user_ref.set(user_data)
    print(f"  ✅ Created user: {user['name']} ({doc_id})")
    return doc_id


def upload_image_and_create_document(
    db: firestore.Client,
    storage_client: storage.Client,
    user: dict,
    event_id: str,
    image_path: Path,
    scores: dict,
) -> str:
    """Upload image to Cloud Storage and create Firestore document."""
    user_id = user["fake_user_id"]
    image_id = str(uuid.uuid4())
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # Determine content type and extension
    suffix = image_path.suffix.lower()
    if suffix == ".png":
        content_type = "image/png"
        ext = "png"
    else:
        content_type = "image/jpeg"
        ext = "jpg"

    storage_path = f"{event_id}/original/{user_id}/{timestamp}_{image_id}.{ext}"

    # Upload to Cloud Storage
    bucket = storage_client.bucket(STORAGE_BUCKET)
    blob = bucket.blob(storage_path)

    with open(image_path, "rb") as f:
        blob.upload_from_file(f, content_type=content_type)

    print(f"  📤 Uploaded: {storage_path}")

    # Generate signed URL (optional - skip if fails)
    signed_url = None
    expiration = None
    try:
        signed_url, expiration = generate_signed_url(STORAGE_BUCKET, storage_path)
        print("  🔗 Signed URL generated")
    except Exception as e:
        print(f"  ⚠️  Signed URL generation failed (will retry later): {e}")

    # Create image document
    image_ref = db.collection("images").document(image_id)
    image_data = {
        "user_id": user_id,
        "user_name": user["name"],
        "event_id": event_id,
        "storage_path": storage_path,
        "upload_timestamp": firestore.SERVER_TIMESTAMP,
        "status": "completed",
        "line_message_id": f"seed_{image_id[:8]}",
        # Scoring data
        "smile_score": scores["smile_score"],
        "ai_score": scores["ai_score"],
        "total_score": scores["total_score"],
        "comment": scores["comment"],
        "face_count": scores["face_count"],
        "is_similar": scores["is_similar"],
        "average_hash": scores["average_hash"],
        "scored_at": firestore.SERVER_TIMESTAMP,
    }

    # Add signed URL if available
    if signed_url:
        image_data["storage_url"] = signed_url
        image_data["storage_url_expires_at"] = expiration

    image_ref.set(image_data)
    print(f"  📝 Created image doc: {image_id} (score: {scores['total_score']})")

    # Update user stats
    user_doc_id = f"{user_id}_{event_id}"
    user_ref = db.collection("users").document(user_doc_id)
    user_ref.update(
        {
            "total_uploads": firestore.Increment(1),
            "best_score": scores["total_score"],
        }
    )

    return image_id


def main():
    parser = argparse.ArgumentParser(description="Seed test users for LP screenshots")
    parser.add_argument(
        "--event-id",
        required=True,
        help="Event ID to seed data for (e.g., 'test')",
    )
    parser.add_argument(
        "--images-dir",
        required=True,
        help="Directory containing test images (JPEG files)",
    )
    args = parser.parse_args()

    event_id = args.event_id
    images_dir = Path(args.images_dir)

    if not images_dir.exists():
        print(f"❌ Images directory not found: {images_dir}")
        return 1

    # Find image files (JPEG and PNG)
    image_files = (
        sorted(images_dir.glob("*.jpg")) + sorted(images_dir.glob("*.jpeg")) + sorted(images_dir.glob("*.png"))
    )
    if len(image_files) < len(TEST_USERS):
        print(f"❌ Need at least {len(TEST_USERS)} images, found {len(image_files)}")
        print(f"   Please add more images to {images_dir}")
        return 1

    print("=" * 60)
    print("  Seed Test Users Script")
    print("=" * 60)
    print()
    print(f"Project: {PROJECT_ID}")
    print(f"Event ID: {event_id}")
    print(f"Images directory: {images_dir}")
    print(f"Found {len(image_files)} images")
    print()
    print("Users to create:")
    for user in TEST_USERS:
        print(f"  - {user['name']}")
    print()

    # Confirmation
    confirm = input("Proceed with seeding? [y/N]: ")
    if confirm.lower() != "y":
        print("Cancelled.")
        return 1

    print()

    # Initialize clients
    db = firestore.Client(project=PROJECT_ID)
    storage_client = storage.Client(project=PROJECT_ID)

    # Verify event exists
    event_doc = db.collection("events").document(event_id).get()
    if not event_doc.exists:
        print(f"⚠️  Event '{event_id}' not found. Creating it...")
        db.collection("events").document(event_id).set(
            {
                "event_id": event_id,
                "event_name": f"Test Event ({event_id})",
                "event_date": datetime.now().strftime("%Y-%m-%d"),
                "status": "active",
                "created_at": firestore.SERVER_TIMESTAMP,
            }
        )
        print(f"  ✅ Created event: {event_id}")
    else:
        print(f"✅ Event exists: {event_id}")

    print()
    print("Creating users and uploading images...")
    print()

    created_images = []

    # Shuffle images for variety, then distribute among users (round-robin)
    shuffled_images = image_files.copy()
    random.shuffle(shuffled_images)

    images_per_user = {user["fake_user_id"]: [] for user in TEST_USERS}
    for i, image_path in enumerate(shuffled_images):
        user_index = i % len(TEST_USERS)
        images_per_user[TEST_USERS[user_index]["fake_user_id"]].append(image_path)

    for i, user in enumerate(TEST_USERS):
        user_images = images_per_user[user["fake_user_id"]]
        print(f"[{i + 1}/{len(TEST_USERS)}] {user['name']} ({len(user_images)} images)")

        # Create user document
        create_user_document(db, user, event_id)

        # Upload all images for this user
        best_score = 0
        for image_path in user_images:
            # First user's first image gets top score
            is_top = i == 0 and best_score == 0
            scores = generate_realistic_scores(is_top=is_top)
            image_id = upload_image_and_create_document(db, storage_client, user, event_id, image_path, scores)
            created_images.append(
                {
                    "image_id": image_id,
                    "user_name": user["name"],
                    "score": scores["total_score"],
                }
            )
            best_score = max(best_score, scores["total_score"])
        print()

    print("=" * 60)
    print("  Seeding Complete!")
    print("=" * 60)
    print()
    print("Created images (sorted by score):")
    for img in sorted(created_images, key=lambda x: x["score"], reverse=True):
        print(f"  - {img['user_name']}: {img['score']} pts")
    print()
    print(f"View ranking at: https://smile-photo-contest.web.app/?event_id={event_id}")
    print()

    return 0


if __name__ == "__main__":
    exit(main())
