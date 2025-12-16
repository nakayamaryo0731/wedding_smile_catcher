#!/usr/bin/env python3
"""
Rescore images batch script.

Re-calculates scores for existing images when scoring logic changes.
Preserves is_similar flag (similarity detection result is not recalculated).

Usage:
    # Dry run (preview only, no updates)
    python scripts/rescore_images.py --event-id wedding_20250315 --dry-run

    # Execute (with confirmation prompt)
    python scripts/rescore_images.py --event-id wedding_20250315

    # Rescore specific image only
    python scripts/rescore_images.py --event-id wedding_20250315 --image-id img_001
"""

import argparse
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Set dummy LINE token before importing main.py (not used in rescoring)
if not os.environ.get("LINE_CHANNEL_ACCESS_TOKEN"):
    os.environ["LINE_CHANNEL_ACCESS_TOKEN"] = "dummy_token_for_rescore_script"

# Add src directory to path for imports
src_path = Path(__file__).parent.parent / "src" / "functions" / "scoring"
sys.path.insert(0, str(src_path.parent))

from google.cloud import firestore, storage  # noqa: E402
from scoring.main import (  # noqa: E402
    calculate_smile_score,
    download_image_from_storage,
    evaluate_theme,
)
from tqdm import tqdm  # noqa: E402

# Initialize clients
db = firestore.Client()
storage_client = storage.Client()

# Gemini API cost estimate per image
GEMINI_COST_PER_IMAGE = 0.002


def get_images_for_event(event_id: str, image_id: str | None = None) -> list[dict]:
    """
    Get all completed images for an event.

    Args:
        event_id: Event ID to filter by
        image_id: Optional specific image ID

    Returns:
        List of image documents with their IDs
    """
    query = (
        db.collection("images")
        .where(filter=firestore.FieldFilter("event_id", "==", event_id))
        .where(filter=firestore.FieldFilter("status", "==", "completed"))
    )

    if image_id:
        # Get specific image
        doc = db.collection("images").document(image_id).get()
        if not doc.exists:
            print(f"Image not found: {image_id}")
            return []
        data = doc.to_dict()
        if data.get("event_id") != event_id:
            print(f"Image {image_id} does not belong to event {event_id}")
            return []
        return [{"id": doc.id, **data}]

    # Get all images for event
    docs = query.stream()
    return [{"id": doc.id, **doc.to_dict()} for doc in docs]


def rescore_single_image(image_data: dict, dry_run: bool) -> dict:
    """
    Rescore a single image.

    Args:
        image_data: Image document data including 'id'
        dry_run: If True, don't update Firestore

    Returns:
        Result dict with old_score, new_score, diff, and status
    """
    image_id = image_data["id"]
    storage_path = image_data.get("storage_path")
    old_score = image_data.get("total_score", 0)
    is_similar = image_data.get("is_similar", False)

    if not storage_path:
        return {
            "image_id": image_id,
            "status": "error",
            "error": "No storage_path",
            "old_score": old_score,
            "new_score": old_score,
            "diff": 0,
        }

    try:
        # Download image from Cloud Storage
        image_bytes = download_image_from_storage(storage_path)

        # Run Vision API and Gemini in parallel
        with ThreadPoolExecutor(max_workers=2) as executor:
            smile_future = executor.submit(calculate_smile_score, image_bytes)
            theme_future = executor.submit(evaluate_theme, image_bytes)

            smile_result = smile_future.result()
            theme_result = theme_future.result()

        # Calculate new score (preserve is_similar)
        smile_score = smile_result["smile_score"]
        ai_score = theme_result["score"]
        penalty = 0.33 if is_similar else 1.0
        new_score = round((smile_score * ai_score / 100) * penalty, 2)

        # Update Firestore if not dry run
        if not dry_run:
            db.collection("images").document(image_id).update(
                {
                    "smile_score": smile_score,
                    "ai_score": ai_score,
                    "total_score": new_score,
                    "comment": theme_result["comment"],
                    "face_count": smile_result["face_count"],
                    "rescored_at": firestore.SERVER_TIMESTAMP,
                }
            )

        return {
            "image_id": image_id,
            "status": "success",
            "old_score": old_score,
            "new_score": new_score,
            "diff": round(new_score - old_score, 2),
            "smile_score": smile_score,
            "ai_score": ai_score,
        }

    except Exception as e:
        return {
            "image_id": image_id,
            "status": "error",
            "error": str(e),
            "old_score": old_score,
            "new_score": old_score,
            "diff": 0,
        }


def update_user_best_scores(event_id: str, dry_run: bool) -> dict:
    """
    Recalculate best_score for all users in the event.

    Args:
        event_id: Event ID
        dry_run: If True, don't update Firestore

    Returns:
        Dict with user_id -> new_best_score mapping
    """
    # Get all completed images for event
    images = (
        db.collection("images")
        .where(filter=firestore.FieldFilter("event_id", "==", event_id))
        .where(filter=firestore.FieldFilter("status", "==", "completed"))
        .stream()
    )

    # Group by user and find max score
    user_best_scores: dict[str, float] = {}
    for doc in images:
        data = doc.to_dict()
        user_id = data.get("user_id")
        score = data.get("total_score", 0)
        if user_id:
            if user_id not in user_best_scores or score > user_best_scores[user_id]:
                user_best_scores[user_id] = score

    # Update user documents
    if not dry_run:
        for user_id, best_score in user_best_scores.items():
            db.collection("users").document(user_id).update({"best_score": best_score})

    return user_best_scores


def print_summary(results: list[dict], user_best_scores: dict, dry_run: bool):
    """Print summary of rescoring results."""
    success = [r for r in results if r["status"] == "success"]
    errors = [r for r in results if r["status"] == "error"]

    increases = [r for r in success if r["diff"] > 0]
    decreases = [r for r in success if r["diff"] < 0]
    unchanged = [r for r in success if r["diff"] == 0]

    print("\n" + "=" * 50)
    print("📊 サマリー")
    print("=" * 50)
    print(f"  成功: {len(success)}件")
    print(f"  失敗: {len(errors)}件")
    print(f"  スコア増加: {len(increases)}件", end="")
    if increases:
        avg_increase = sum(r["diff"] for r in increases) / len(increases)
        print(f" (平均 +{avg_increase:.1f})")
    else:
        print()
    print(f"  スコア減少: {len(decreases)}件", end="")
    if decreases:
        avg_decrease = sum(r["diff"] for r in decreases) / len(decreases)
        print(f" (平均 {avg_decrease:.1f})")
    else:
        print()
    print(f"  変化なし: {len(unchanged)}件")

    # Top 5 changes
    if success:
        sorted_results = sorted(success, key=lambda r: abs(r["diff"]), reverse=True)[:5]
        print("\n上位5件のスコア変化:")
        for r in sorted_results:
            diff_str = f"+{r['diff']}" if r["diff"] > 0 else str(r["diff"])
            print(f"  {r['image_id']}: {r['old_score']} → {r['new_score']} ({diff_str})")

    # Errors
    if errors:
        print("\n❌ エラー:")
        for r in errors[:5]:
            print(f"  {r['image_id']}: {r.get('error', 'Unknown error')}")
        if len(errors) > 5:
            print(f"  ... 他 {len(errors) - 5}件")

    # User best scores
    print(f"\n👤 ユーザーbest_score更新: {len(user_best_scores)}件")

    if dry_run:
        print("\n⚠️  これはドライランでした。実際には更新されていません。")


def main():
    parser = argparse.ArgumentParser(description="Rescore images when scoring logic changes")
    parser.add_argument("--event-id", required=True, help="Event ID to rescore")
    parser.add_argument("--image-id", help="Specific image ID to rescore (optional)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview only, don't update Firestore",
    )
    parser.add_argument("-y", "--yes", action="store_true", help="Skip confirmation prompt")

    args = parser.parse_args()

    # Get images
    print(f"🔍 イベント {args.event_id} の画像を取得中...")
    images = get_images_for_event(args.event_id, args.image_id)

    if not images:
        print("対象画像が見つかりませんでした。")
        return 1

    # Show summary and estimate
    estimated_cost = len(images) * GEMINI_COST_PER_IMAGE
    print("\n🔍 再スコアリング対象:")
    print(f"  イベント: {args.event_id}")
    print(f"  画像数: {len(images)}枚")
    print(f"  推定API料金: ~${estimated_cost:.2f} (Gemini)")

    if args.dry_run:
        print("\n⚠️  ドライランモード: 実際には更新されません")

    # Confirmation
    if not args.dry_run and not args.yes:
        confirm = input("\n続行しますか？ [y/N]: ")
        if confirm.lower() != "y":
            print("キャンセルしました。")
            return 0

    # Process images
    print("\n処理中...")
    results = []
    for image in tqdm(images, desc="Rescoring"):
        result = rescore_single_image(image, args.dry_run)
        results.append(result)

    # Update user best scores
    print("\nユーザーのbest_scoreを再計算中...")
    user_best_scores = update_user_best_scores(args.event_id, args.dry_run)

    # Print summary
    print_summary(results, user_best_scores, args.dry_run)

    return 0


if __name__ == "__main__":
    sys.exit(main())
