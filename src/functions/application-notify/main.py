"""
Application notification Cloud Function

Sends LINE notification to admin when a new application is submitted.
HTTP trigger called from frontend after successful form submission.
"""

import logging
import os

import functions_framework
import google.cloud.logging
import requests
from flask import jsonify

# Initialize logging
logging_client = google.cloud.logging.Client()
logging_client.setup_logging()

logger = logging.getLogger(__name__)

# Environment variables
LINE_CHANNEL_ACCESS_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "")
ADMIN_LINE_USER_ID = os.environ.get("ADMIN_LINE_USER_ID", "")
ADMIN_PANEL_URL = os.environ.get("ADMIN_PANEL_URL", "https://smile-photo-contest.web.app/admin.html")


def send_line_push_message(user_id: str, message: str) -> bool:
    """Send LINE push message to a single user.

    Args:
        user_id: LINE user ID
        message: Message text to send

    Returns:
        True if successful, False otherwise
    """
    if not LINE_CHANNEL_ACCESS_TOKEN:
        logger.error("LINE_CHANNEL_ACCESS_TOKEN is not set")
        return False

    url = "https://api.line.me/v2/bot/message/push"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {LINE_CHANNEL_ACCESS_TOKEN}",
    }
    data = {"to": user_id, "messages": [{"type": "text", "text": message}]}

    try:
        response = requests.post(url, headers=headers, json=data, timeout=30)
        if response.status_code == 200:
            logger.info(f"Successfully sent LINE message to {user_id}")
            return True
        else:
            logger.warning(f"LINE API error for user {user_id}: {response.status_code} {response.text}")
            return False
    except Exception as e:
        logger.error(f"Failed to send message to {user_id}: {e}")
        return False


def format_notification_message(data: dict) -> str:
    """Format the notification message for LINE.

    Args:
        data: Application data from request

    Returns:
        Formatted message string
    """
    groom_name = data.get("groom_name", "")
    bride_name = data.get("bride_name", "")
    event_date = data.get("event_date", "")
    start_time = data.get("start_time", "")
    end_time = data.get("end_time", "")
    guest_count = data.get("guest_count", "")

    message = f"""📩 新規申し込み

新郎新婦: {groom_name} & {bride_name}
日付: {event_date}
時間: {start_time}〜{end_time}
ゲスト数: {guest_count}

管理画面で確認してください
{ADMIN_PANEL_URL}"""

    return message


@functions_framework.http
def application_notify(request):
    """Send notification to admin about new application.

    Request body:
        {
            "groom_name": "太郎",
            "bride_name": "花子",
            "event_date": "2026-03-15",
            "start_time": "14:00",
            "end_time": "17:00",
            "guest_count": "51~100人"
        }

    Returns:
        JSON response with send result
    """
    # Handle CORS preflight
    if request.method == "OPTIONS":
        headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "3600",
        }
        return ("", 204, headers)

    # CORS headers for actual request
    cors_headers = {"Access-Control-Allow-Origin": "*"}

    # Check method
    if request.method != "POST":
        return (jsonify({"error": "Method not allowed"}), 405, cors_headers)

    # Check if admin notification is configured
    if not ADMIN_LINE_USER_ID:
        logger.warning("ADMIN_LINE_USER_ID is not set, notification skipped")
        return (
            jsonify({"success": True, "message": "Notification skipped (not configured)"}),
            200,
            cors_headers,
        )

    # Parse request body
    try:
        data = request.get_json()
        if not data:
            return (jsonify({"error": "Request body is required"}), 400, cors_headers)
    except Exception:
        return (jsonify({"error": "Invalid JSON"}), 400, cors_headers)

    logger.info("Processing application notification request")

    # Format and send notification
    message = format_notification_message(data)
    success = send_line_push_message(ADMIN_LINE_USER_ID, message)

    if success:
        logger.info("Application notification sent successfully")
        return (jsonify({"success": True}), 200, cors_headers)
    else:
        logger.error("Failed to send application notification")
        return (
            jsonify({"success": False, "error": "Failed to send notification"}),
            500,
            cors_headers,
        )
