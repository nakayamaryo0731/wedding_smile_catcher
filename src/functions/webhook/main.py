"""
Wedding Smile Catcher - Webhook Function
Handles LINE Bot webhook events for user registration and image uploads.
"""

import logging
import os
import time
import uuid
from datetime import datetime

import functions_framework
import requests
from flask import Request, jsonify
from google.auth.transport.requests import Request as AuthRequest
from google.cloud import firestore, storage
from google.cloud import logging as cloud_logging
from google.oauth2 import id_token
from linebot import LineBotApi, WebhookHandler
from linebot.exceptions import InvalidSignatureError, LineBotApiError
from linebot.models import (
    FollowEvent,
    ImageMessage,
    MessageEvent,
    TextMessage,
    TextSendMessage,
)

# Initialize Cloud Logging
logging_client = cloud_logging.Client()
logging_client.setup_logging()

# Initialize logger with Cloud Logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Initialize Google Cloud clients
db = firestore.Client()
storage_client = storage.Client()

# Environment variables
LINE_CHANNEL_SECRET = os.environ.get("LINE_CHANNEL_SECRET")
LINE_CHANNEL_ACCESS_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "wedding-smile-catcher")
STORAGE_BUCKET = os.environ.get("STORAGE_BUCKET", "wedding-smile-images")
SCORING_FUNCTION_URL = os.environ.get("SCORING_FUNCTION_URL")
CURRENT_EVENT_ID = os.environ.get("CURRENT_EVENT_ID")

# Validate required environment variables on module load
if not CURRENT_EVENT_ID:
    raise ValueError(
        "CURRENT_EVENT_ID environment variable is required. "
        "This prevents accidentally saving production data to a test event. "
        "Set it via: gcloud functions deploy ... --set-env-vars CURRENT_EVENT_ID=your_event_id"
    )

# Initialize LINE Bot API
line_bot_api = LineBotApi(LINE_CHANNEL_ACCESS_TOKEN)
handler = WebhookHandler(LINE_CHANNEL_SECRET)


@functions_framework.http
def webhook(request: Request):
    """
    Cloud Functions HTTP entrypoint for LINE webhook.

    Args:
        request: Flask Request object containing LINE webhook event

    Returns:
        JSON response with status
    """
    # Generate request ID for tracing
    request_id = str(uuid.uuid4())

    # Get X-Line-Signature header value
    signature = request.headers.get("X-Line-Signature", "")

    # Get request body as text
    body = request.get_data(as_text=True)

    logger.info(
        "Webhook request received",
        extra={
            "request_id": request_id,
            "has_signature": bool(signature),
            "event": "webhook_received",
        },
    )

    # Handle webhook body
    try:
        handler.handle(body, signature)

        logger.info(
            "Webhook processed successfully",
            extra={"request_id": request_id, "event": "webhook_processed"},
        )

    except InvalidSignatureError:
        logger.error(
            "Invalid LINE signature",
            extra={"request_id": request_id, "event": "invalid_signature"},
        )
        return jsonify({"error": "Invalid signature"}), 400

    except Exception as e:
        logger.error(
            "Webhook processing failed",
            extra={
                "request_id": request_id,
                "error": str(e),
                "error_type": type(e).__name__,
                "event": "webhook_failed",
            },
            exc_info=True,
        )
        return jsonify({"error": str(e)}), 500

    return jsonify({"status": "ok", "request_id": request_id}), 200


@handler.add(FollowEvent)
def handle_follow(event: FollowEvent):
    """
    Handle follow event when user adds bot as friend.

    Args:
        event: LINE FollowEvent object
    """
    user_id = event.source.user_id
    logger.info(f"Follow event from user: {user_id}")

    # Check if user already exists
    user_ref = db.collection("users").document(user_id)
    user_doc = user_ref.get()

    if not user_doc.exists:
        # Send registration guide
        message = TextSendMessage(
            text="ようこそ！Wedding Smile Catcherへ\n\n"
            "まずはお名前（フルネーム）をテキストで送信してください。\n"
            "例: 山田太郎"
        )
        line_bot_api.reply_message(event.reply_token, message)
    else:
        # Already registered
        user_data = user_doc.to_dict()
        name = user_data.get("name", "ゲスト")
        message = TextSendMessage(text=f"{name}さん、おかえりなさい！\n\n笑顔の写真をアップロードしよう！")
        line_bot_api.reply_message(event.reply_token, message)


@handler.add(MessageEvent, message=TextMessage)
def handle_text_message(event: MessageEvent):
    """
    Handle text message event.
    - If user not registered: register with the text as name
    - If user registered: handle commands

    Args:
        event: LINE MessageEvent object with TextMessage
    """
    user_id = event.source.user_id
    text = event.message.text
    reply_token = event.reply_token

    logger.info(f"Text message from {user_id}: {text}")

    # Check if user is registered
    user_ref = db.collection("users").document(user_id)
    user_doc = user_ref.get()

    if not user_doc.exists:
        # Register new user with name
        try:
            user_ref.set(
                {
                    "name": text,
                    "line_user_id": user_id,
                    "event_id": CURRENT_EVENT_ID,
                    "created_at": firestore.SERVER_TIMESTAMP,
                    "total_uploads": 0,
                    "best_score": 0,
                }
            )

            logger.info(f"User registered: {user_id} - {text}")

            message = TextSendMessage(text=f"{text}さん、登録完了です！\n\n早速、笑顔の写真を送ってみましょう！📸")
            line_bot_api.reply_message(reply_token, message)

        except Exception as e:
            logger.error(f"Failed to register user: {str(e)}")
            message = TextSendMessage(text="登録に失敗しました。もう一度お試しください。")
            line_bot_api.reply_message(reply_token, message)
    else:
        # User already registered, handle commands
        handle_command(text, reply_token, user_ref)


def handle_command(text: str, reply_token: str, user_ref):
    """
    Handle commands from registered users.

    Args:
        text: Command text
        reply_token: LINE reply token
        user_ref: Firestore user document reference
    """
    if text in ["ヘルプ", "help", "使い方"]:
        message = TextSendMessage(
            text="【Wedding Smile Catcher 使い方】\n\n"
            "📸 写真を送信\n"
            "  → AIが笑顔を分析してスコアをお伝えします\n\n"
            "❓ 「ヘルプ」\n"
            "  → この使い方を表示"
        )
    else:
        message = TextSendMessage(
            text="笑顔の写真をアップロードしよう！\n\n「ヘルプ」と送信すると使い方を確認できます。"
        )

    line_bot_api.reply_message(reply_token, message)


@handler.add(MessageEvent, message=ImageMessage)
def handle_image_message(event: MessageEvent):
    """
    Handle image message event.
    - Check if user is registered
    - Download image from LINE
    - Upload to Cloud Storage
    - Create Firestore document
    - Trigger scoring function

    Args:
        event: LINE MessageEvent object with ImageMessage
    """
    user_id = event.source.user_id
    message_id = event.message.id
    reply_token = event.reply_token

    logger.info(f"Image message from {user_id}: {message_id}")

    # Check if user is registered
    user_ref = db.collection("users").document(user_id)
    user_doc = user_ref.get()

    if not user_doc.exists:
        message = TextSendMessage(
            text="まずはお名前を登録してください。\n\nお名前（フルネーム）をテキストで送信してください。"
        )
        line_bot_api.reply_message(reply_token, message)
        return

    # Send loading message
    loading_message = TextSendMessage(
        text="📸 画像を受け取りました！\n\nAIが笑顔を分析中...\nしばらくお待ちください ⏳"
    )
    line_bot_api.reply_message(reply_token, loading_message)

    try:
        # Download image from LINE
        message_content = line_bot_api.get_message_content(message_id)
        image_bytes = message_content.content

        # Generate unique image ID and path
        image_id = str(uuid.uuid4())
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        storage_path = f"{CURRENT_EVENT_ID}/original/{user_id}/{timestamp}_{image_id}.jpg"

        # Upload to Cloud Storage
        bucket = storage_client.bucket(STORAGE_BUCKET)
        blob = bucket.blob(storage_path)
        blob.upload_from_string(image_bytes, content_type="image/jpeg")

        logger.info(f"Image uploaded to Storage: {storage_path}")

        # Create Firestore document
        image_ref = db.collection("images").document(image_id)
        image_ref.set(
            {
                "user_id": user_id,
                "event_id": CURRENT_EVENT_ID,
                "storage_path": storage_path,
                "upload_timestamp": firestore.SERVER_TIMESTAMP,
                "status": "pending",
                "line_message_id": message_id,
            }
        )

        logger.info(f"Firestore document created: {image_id}")

        # Trigger scoring function (asynchronously)
        if SCORING_FUNCTION_URL:
            trigger_scoring_function(image_id, user_id)
        else:
            logger.warning("SCORING_FUNCTION_URL not set, skipping scoring trigger")

    except LineBotApiError as e:
        logger.error(f"LINE API error: {e.status_code} {e.message}")
        error_message = TextSendMessage(text="❌ 画像の取得に失敗しました。\n\nもう一度お試しください。")
        # Can't use reply_message here as reply_token might be consumed
        line_bot_api.push_message(user_id, error_message)

    except Exception as e:
        logger.error(f"Failed to process image: {str(e)}")
        error_message = TextSendMessage(text="❌ 画像の処理に失敗しました。\n\nもう一度お試しください。")
        line_bot_api.push_message(user_id, error_message)


def trigger_scoring_function(image_id: str, user_id: str):
    """
    Trigger scoring function via HTTP with authentication.
    Implements retry logic for authentication failures.

    Args:
        image_id: Image document ID
        user_id: User ID
    """
    max_retries = 3
    retry_delay = 1.0  # seconds

    for attempt in range(max_retries):
        try:
            payload = {"image_id": image_id, "user_id": user_id}

            # Get ID token for authenticating to the scoring function
            auth_req = AuthRequest()
            id_token_value = id_token.fetch_id_token(auth_req, SCORING_FUNCTION_URL)

            headers = {
                "Authorization": f"Bearer {id_token_value}",
                "Content-Type": "application/json",
            }

            response = requests.post(
                SCORING_FUNCTION_URL,
                json=payload,
                headers=headers,
                timeout=5,  # Don't wait for response
            )

            logger.info(
                f"Scoring function triggered: {response.status_code}",
                extra={"attempt": attempt + 1},
            )
            return  # Success, exit function

        except requests.exceptions.Timeout:
            logger.info(
                "Scoring function triggered (timeout expected)",
                extra={"attempt": attempt + 1},
            )
            return  # Timeout is expected for async trigger, not an error

        except Exception as e:
            error_message = str(e)
            is_last_attempt = attempt == max_retries - 1

            # Check if this is a retryable error (auth/network issues)
            is_retryable = (
                "authentication" in error_message.lower()
                or "credential" in error_message.lower()
                or "token" in error_message.lower()
                or "Connection" in error_message
                or "Timeout" in error_message
            )

            if is_retryable and not is_last_attempt:
                logger.warning(
                    f"Retryable error triggering scoring function: {error_message}",
                    extra={"attempt": attempt + 1, "retrying": True},
                )
                time.sleep(retry_delay * (attempt + 1))  # Exponential backoff
                continue

            # Final attempt or non-retryable error
            logger.error(
                f"Failed to trigger scoring function: {error_message}",
                extra={"attempt": attempt + 1, "final": is_last_attempt},
            )
            return  # Give up after max retries or non-retryable error
