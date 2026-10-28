"""
Application notification Cloud Function

Sends LINE and email notifications to admin when a new application is submitted.
HTTP trigger called from frontend after successful form submission.
"""

import logging
import os
import re
import smtplib
from email.mime.text import MIMEText

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
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")
SMTP_EMAIL = os.environ.get("SMTP_EMAIL", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")


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


MAX_NAME_LENGTH = 50
MAX_FIELD_LENGTH = 30
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_PATTERN = re.compile(r"^\d{2}:\d{2}$")
GUEST_COUNT_OPTIONS = {"~50人", "51~100人", "101~150人", "150人~"}


def sanitize_text(value: str, max_length: int) -> str:
    """Sanitize user input by removing control characters and truncating."""
    if not isinstance(value, str):
        return ""
    cleaned = re.sub(r"[\x00-\x1f\x7f]", "", value).strip()
    return cleaned[:max_length]


def validate_application_data(data: dict) -> str | None:
    """Validate application form data. Returns error message or None."""
    groom = data.get("groom_name", "")
    bride = data.get("bride_name", "")
    if not isinstance(groom, str) or not groom.strip():
        return "groom_name is required"
    if not isinstance(bride, str) or not bride.strip():
        return "bride_name is required"

    event_date = data.get("event_date", "")
    if not isinstance(event_date, str) or not DATE_PATTERN.match(event_date):
        return "event_date must be YYYY-MM-DD format"

    for field in ("start_time", "end_time"):
        val = data.get(field, "")
        if not isinstance(val, str) or not TIME_PATTERN.match(val):
            return f"{field} must be HH:MM format"

    guest_count = data.get("guest_count", "")
    if not isinstance(guest_count, str) or guest_count not in GUEST_COUNT_OPTIONS:
        return "guest_count is invalid"

    return None


def format_notification_message(data: dict) -> str:
    """Format the notification message for LINE.

    Args:
        data: Application data from request

    Returns:
        Formatted message string
    """
    groom_name = sanitize_text(data.get("groom_name", ""), MAX_NAME_LENGTH)
    bride_name = sanitize_text(data.get("bride_name", ""), MAX_NAME_LENGTH)
    event_date = sanitize_text(data.get("event_date", ""), MAX_FIELD_LENGTH)
    start_time = sanitize_text(data.get("start_time", ""), MAX_FIELD_LENGTH)
    end_time = sanitize_text(data.get("end_time", ""), MAX_FIELD_LENGTH)
    guest_count = sanitize_text(data.get("guest_count", ""), MAX_FIELD_LENGTH)

    message = f"""📩 新規申し込み

新郎新婦: {groom_name} & {bride_name}
日付: {event_date}
時間: {start_time}〜{end_time}
ゲスト数: {guest_count}

管理画面で確認してください
{ADMIN_PANEL_URL}"""

    return message


def send_email_notification(data: dict) -> bool:
    """Send email notification about new application via Gmail SMTP.

    Args:
        data: Application data from request

    Returns:
        True if successful, False otherwise
    """
    if not all([ADMIN_EMAIL, SMTP_EMAIL, SMTP_PASSWORD]):
        logger.info("Email notification skipped (ADMIN_EMAIL/SMTP_EMAIL/SMTP_PASSWORD not configured)")
        return False

    groom_name = sanitize_text(data.get("groom_name", ""), MAX_NAME_LENGTH)
    bride_name = sanitize_text(data.get("bride_name", ""), MAX_NAME_LENGTH)
    subject = f"📩 新規申し込み: {groom_name} & {bride_name}"
    body = format_notification_message(data)

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = SMTP_EMAIL
    msg["To"] = ADMIN_EMAIL

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as server:
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.sendmail(SMTP_EMAIL, ADMIN_EMAIL, msg.as_string())
        logger.info(f"Successfully sent email notification to {ADMIN_EMAIL}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email notification: {e}")
        return False


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

    # Check if any notification channel is configured
    if not ADMIN_LINE_USER_ID and not ADMIN_EMAIL:
        logger.warning("No notification channels configured, notification skipped")
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

    # Validate input
    validation_error = validate_application_data(data)
    if validation_error:
        return (jsonify({"error": validation_error}), 400, cors_headers)

    logger.info("Processing application notification request")

    # Format and send notifications
    message = format_notification_message(data)
    line_success = send_line_push_message(ADMIN_LINE_USER_ID, message)
    email_success = send_email_notification(data)

    if line_success or email_success:
        logger.info("Application notification sent successfully (LINE=%s, email=%s)", line_success, email_success)
        return (jsonify({"success": True}), 200, cors_headers)
    else:
        logger.error("Failed to send application notification via all channels")
        return (
            jsonify({"success": False, "error": "Failed to send notification"}),
            500,
            cors_headers,
        )
