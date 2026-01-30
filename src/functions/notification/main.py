"""
Post-event notification Cloud Function

Sends viral marketing messages to event guests via LINE.
Triggered manually from admin panel after event is archived.
"""

import logging
import os
import time
from datetime import UTC, datetime

import functions_framework
import google.cloud.logging
import requests
from flask import jsonify
from google.cloud import firestore

# Initialize logging
logging_client = google.cloud.logging.Client()
logging_client.setup_logging()

logger = logging.getLogger(__name__)

# Initialize Firestore
db = firestore.Client()

# Environment variables
LINE_CHANNEL_ACCESS_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "")

# LINE API rate limit: 1000 requests/min, we use conservative batch size
BATCH_SIZE = 50
BATCH_DELAY_SECONDS = 3

# Fixed message content
NOTIFICATION_MESSAGE = """🎉 先日はおめでとうございました！

「笑顔写真コンテスト」にご参加いただき
ありがとうございました 📸

━━━━━━━━━━━━━━━━━

このアプリはご自身の結婚式でもお使いいただけます！
簡単に使えるので、ぜひ結婚式を盛り上げましょう！

ご興味があればお気軽にお問い合わせください 👇
nakayamaryo0731@gmail.com"""


def send_line_push_message(user_id: str) -> bool:
    """Send LINE push message to a single user.

    Args:
        user_id: LINE user ID

    Returns:
        True if successful, False otherwise
    """
    url = "https://api.line.me/v2/bot/message/push"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LINE_CHANNEL_ACCESS_TOKEN}",
    }
    data = {"to": user_id, "messages": [{"type": "text", "text": NOTIFICATION_MESSAGE}]}

    try:
        response = requests.post(url, headers=headers, json=data, timeout=30)
        if response.status_code == 200:
            return True
        else:
            logger.warning(f"LINE API error for user {user_id}: {response.status_code} {response.text}")
            return False
    except Exception as e:
        logger.error(f"Failed to send message to {user_id}: {e}")
        return False


def verify_request(request) -> tuple[str | None, dict | None]:
    """Verify the request and extract event_id.

    Returns:
        Tuple of (event_id, error_response)
        If error_response is not None, return it immediately.
    """
    # Check method
    if request.method != "POST":
        return None, (jsonify({"error": "Method not allowed"}), 405)

    # Parse JSON body
    try:
        body = request.get_json()
        if not body:
            return None, (jsonify({"error": "Request body is required"}), 400)
    except Exception:
        return None, (jsonify({"error": "Invalid JSON"}), 400)

    # Extract event_id
    event_id = body.get("event_id")
    if not event_id:
        return None, (jsonify({"error": "event_id is required"}), 400)

    return event_id, None


@functions_framework.http
def notification(request):
    """Send post-event notification to all guests.

    Request body:
        {
            "event_id": "xxx"
        }

    Returns:
        JSON response with send results
    """
    # Handle CORS preflight
    if request.method == "OPTIONS":
        headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "3600",
        }
        return ("", 204, headers)

    # CORS headers for actual request
    cors_headers = {"Access-Control-Allow-Origin": "*"}

    # Verify request
    event_id, error = verify_request(request)
    if error:
        response, status = error
        return (response, status, cors_headers)

    logger.info(f"Processing notification request for event: {event_id}")

    # Get event document
    event_ref = db.collection("events").document(event_id)
    event_doc = event_ref.get()

    if not event_doc.exists:
        return (jsonify({"error": "Event not found"}), 404, cors_headers)

    event_data = event_doc.to_dict()

    # Validate event status
    if event_data.get("status") != "archived":
        return (
            jsonify({"error": "Event must be archived to send notification"}),
            400,
            cors_headers,
        )

    # Check if already sent
    if event_data.get("notification_sent_at"):
        sent_at = event_data["notification_sent_at"]
        return (
            jsonify(
                {
                    "error": "Notification already sent",
                    "sent_at": sent_at.isoformat() if sent_at else None,
                    "sent_count": event_data.get("notification_sent_count", 0),
                    "failed_count": event_data.get("notification_failed_count", 0),
                }
            ),
            400,
            cors_headers,
        )

    # Get target users (registered users who haven't been notified)
    users_query = db.collection("users").where("event_id", "==", event_id).where("join_status", "==", "registered")
    users = list(users_query.stream())

    if not users:
        return (jsonify({"error": "No registered users found"}), 400, cors_headers)

    logger.info(f"Found {len(users)} users to notify for event {event_id}")

    # Send messages in batches
    sent_count = 0
    failed_count = 0
    notified_user_ids = []

    for i, user_doc in enumerate(users):
        user_data = user_doc.to_dict()
        line_user_id = user_data.get("line_user_id")

        if not line_user_id:
            logger.warning(f"User {user_doc.id} has no line_user_id")
            failed_count += 1
            continue

        # Skip if already notified (idempotency)
        if user_data.get("post_event_notification_sent_at"):
            logger.info(f"User {user_doc.id} already notified, skipping")
            continue

        # Send message
        success = send_line_push_message(line_user_id)

        if success:
            sent_count += 1
            notified_user_ids.append(user_doc.id)
            logger.info(f"Sent notification to user {user_doc.id}")
        else:
            failed_count += 1

        # Rate limiting: pause after each batch
        if (i + 1) % BATCH_SIZE == 0 and i < len(users) - 1:
            logger.info(f"Processed {i + 1}/{len(users)}, pausing for rate limit")
            time.sleep(BATCH_DELAY_SECONDS)

    # Update user documents with notification timestamp
    now = datetime.now(UTC)
    batch = db.batch()

    for user_id in notified_user_ids:
        user_ref = db.collection("users").document(user_id)
        batch.update(user_ref, {"post_event_notification_sent_at": now})

    # Update event document with results
    event_ref.update(
        {
            "notification_sent_at": now,
            "notification_sent_count": sent_count,
            "notification_failed_count": failed_count,
        }
    )

    # Commit user updates
    if notified_user_ids:
        batch.commit()

    logger.info(f"Notification complete for event {event_id}: sent={sent_count}, failed={failed_count}")

    return (
        jsonify({"success": True, "sent_count": sent_count, "failed_count": failed_count}),
        200,
        cors_headers,
    )
