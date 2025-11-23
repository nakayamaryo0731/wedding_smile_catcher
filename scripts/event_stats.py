#!/usr/bin/env python3
"""
Show statistics for a specific event

Usage:
    python scripts/event_stats.py <event_id>
    python scripts/event_stats.py wedding_20250315_tanaka
"""

import sys
from google.cloud import firestore


def show_stats(event_id: str):
    """Show statistics for a specific event"""
    db = firestore.Client()

    # Event info
    event_ref = db.collection('events').document(event_id)
    event_doc = event_ref.get()

    if not event_doc.exists:
        print(f"❌ Event not found: {event_id}")
        print("")
        print("Available events:")
        import subprocess
        subprocess.run(['python', 'scripts/list_events.py'])
        return

    event_data = event_doc.to_dict()

    print(f"📊 イベント統計: {event_id}")
    print("=" * 80)
    print(f"名前: {event_data['event_name']}")
    print(f"日付: {event_data['event_date']}")
    print(f"状態: {event_data['status']}")
    print("=" * 80)

    # User count
    users_ref = db.collection('users').where('event_id', '==', event_id)
    users = list(users_ref.stream())
    user_count = len(users)

    # Image count
    images_ref = db.collection('images').where('event_id', '==', event_id)
    images = list(images_ref.stream())
    image_count = len(images)

    # Completed images
    completed_images = [img for img in images if img.to_dict().get('status') == 'completed']
    completed_count = len(completed_images)

    # Pending images
    pending_count = image_count - completed_count

    # Score statistics
    if completed_images:
        scores = [img.to_dict().get('total_score', 0) for img in completed_images]
        max_score = max(scores) if scores else 0
        min_score = min(scores) if scores else 0
        avg_score = sum(scores) / len(scores) if scores else 0

        print(f"")
        print(f"👥 ユーザー数: {user_count}人")
        print(f"📸 投稿画像数: {image_count}枚")
        print(f"   ├─ 完了: {completed_count}枚")
        print(f"   └─ 処理中: {pending_count}枚")
        print(f"")
        print(f"🏆 スコア統計:")
        print(f"   ├─ 最高スコア: {max_score:.2f}点")
        print(f"   ├─ 最低スコア: {min_score:.2f}点")
        print(f"   └─ 平均スコア: {avg_score:.2f}点")
        print(f"")

        # Top 3 images
        top_images = sorted(completed_images, key=lambda x: x.to_dict().get('total_score', 0), reverse=True)[:3]

        print(f"🥇 トップ3:")
        for i, img_doc in enumerate(top_images, 1):
            img_data = img_doc.to_dict()
            user_id = img_data.get('user_id', 'unknown')

            # Get user name
            user_doc = db.collection('users').document(user_id).get()
            user_name = user_doc.to_dict().get('name', 'Unknown') if user_doc.exists else 'Unknown'

            medal = ['🥇', '🥈', '🥉'][i - 1]
            print(f"   {medal} {i}位: {img_data.get('total_score', 0):.2f}点 - {user_name}")
            print(f"      (笑顔: {img_data.get('smile_score', 0):.1f}, AI: {img_data.get('ai_score', 0)})")

    else:
        print(f"")
        print(f"👥 ユーザー数: {user_count}人")
        print(f"📸 投稿画像数: {image_count}枚")
        print(f"   └─ まだスコアリングが完了していません")

    print("=" * 80)


def main():
    if len(sys.argv) < 2:
        print("使い方: python scripts/event_stats.py <event_id>")
        print("")
        print("例: python scripts/event_stats.py wedding_20250315_tanaka")
        print("")
        print("利用可能なイベント:")
        import subprocess
        subprocess.run(['python', 'scripts/list_events.py'])
        sys.exit(1)

    event_id = sys.argv[1]
    show_stats(event_id)


if __name__ == "__main__":
    main()
