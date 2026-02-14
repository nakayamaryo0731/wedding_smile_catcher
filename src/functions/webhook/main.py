"""
Smile Photo Contest - Webhook Function
Handles LINE Bot webhook events for user registration and image uploads.
Multi-tenant: users join events via JOIN {event_code} command.
"""

import logging
import os
import re
import time
import uuid
from datetime import UTC, datetime, timedelta

import functions_framework
import google.auth
import requests
from flask import Request, jsonify
from google.auth import impersonated_credentials as imp_creds
from google.auth.transport.requests import Request as AuthRequest
from google.cloud import firestore, storage
from google.cloud import logging as cloud_logging
from google.oauth2 import id_token
from linebot.v3.messaging import (
    ApiClient,
    Configuration,
    MessagingApi,
    MessagingApiBlob,
    PushMessageRequest,
    ReplyMessageRequest,
    TextMessage,
)
from linebot.v3.messaging.exceptions import ApiException
from linebot.v3.webhook import InvalidSignatureError, WebhookHandler
from linebot.v3.webhooks import (
    AudioMessageContent,
    FileMessageContent,
    ImageMessageContent,
    LocationMessageContent,
    MessageEvent,
    StickerMessageContent,
    TextMessageContent,
    UnsendEvent,
    VideoMessageContent,
)

# Initialize logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

if os.environ.get("K_SERVICE"):
    # Running in Cloud Functions — use Cloud Logging
    logging_client = cloud_logging.Client()
    logging_client.setup_logging()
else:
    # Local development — log to console only
    _console_handler = logging.StreamHandler()
    _console_handler.setLevel(logging.DEBUG)
    logger.addHandler(_console_handler)

# Initialize Google Cloud clients
db = firestore.Client()
storage_client = storage.Client()

# Environment variables
LINE_CHANNEL_SECRET = os.environ.get("LINE_CHANNEL_SECRET")
LINE_CHANNEL_ACCESS_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "wedding-smile-catcher")
STORAGE_BUCKET = os.environ.get("STORAGE_BUCKET", "wedding-smile-images")
SCORING_FUNCTION_URL = os.environ.get("SCORING_FUNCTION_URL")
LIFF_CHANNEL_ID = os.environ.get("LIFF_CHANNEL_ID", "")

LIFF_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "LIFF_ALLOWED_ORIGINS",
        "https://liff.line.me,https://smile-photo-contest.web.app,https://wedding-smile-catcher.web.app",
    ).split(",")
    if origin.strip()
]


def get_liff_cors_headers(request):
    """Return CORS headers restricted to LIFF allowed origins."""
    origin = request.headers.get("Origin", "")
    if origin in LIFF_ALLOWED_ORIGINS:
        return {"Access-Control-Allow-Origin": origin, "Vary": "Origin"}
    return {}


# Validate required environment variables at startup
_REQUIRED_ENV_VARS = ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN"]
_missing_vars = [var for var in _REQUIRED_ENV_VARS if not os.environ.get(var)]
if _missing_vars:
    raise RuntimeError(f"Missing required environment variables: {', '.join(_missing_vars)}")

# Initialize LINE Bot API (v3)
configuration = Configuration(access_token=LINE_CHANNEL_ACCESS_TOKEN)
api_client = ApiClient(configuration)
messaging_api = MessagingApi(api_client)
messaging_api_blob = MessagingApiBlob(api_client)
handler = WebhookHandler(LINE_CHANNEL_SECRET)

# Pattern for JOIN command (case-insensitive)
JOIN_PATTERN = re.compile(r"^JOIN\s+(.+)$", re.IGNORECASE)

# Input validation constants
USER_NAME_MIN_LENGTH = 1
USER_NAME_MAX_LENGTH = 50
EVENT_CODE_PATTERN = re.compile(r"^[a-zA-Z0-9\-]+$")
EVENT_CODE_MAX_LENGTH = 100

# Signed URL configuration (7 days - sufficient for wedding event + post-event viewing)
SIGNED_URL_EXPIRATION_HOURS = 168


def validate_user_name(name: str) -> tuple[bool, str | None]:
    """
    Validate user name input.

    Args:
        name: Raw user name input

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not name or not name.strip():
        return False, "お名前を入力してください。"

    name = name.strip()
    if len(name) < USER_NAME_MIN_LENGTH:
        return False, "お名前を入力してください。"

    if len(name) > USER_NAME_MAX_LENGTH:
        return False, f"お名前は{USER_NAME_MAX_LENGTH}文字以内で入力してください。"

    return True, None


def validate_event_code(code: str) -> tuple[bool, str | None]:
    """
    Validate event code input.

    Args:
        code: Raw event code input

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not code or not code.strip():
        return False, "参加コードを入力してください。"

    code = code.strip()
    if len(code) > EVENT_CODE_MAX_LENGTH:
        return False, "参加コードが無効です。コードを確認してください。"

    if not EVENT_CODE_PATTERN.match(code):
        return False, "参加コードが無効です。コードを確認してください。"

    return True, None


def generate_signed_url(
    bucket_name: str, storage_path: str, expiration_hours: int = SIGNED_URL_EXPIRATION_HOURS
) -> tuple[str, datetime]:
    """
    Generate a signed URL for Cloud Storage object.

    Uses IAM signBlob API for signing when running in Cloud Functions
    (where ADC doesn't have a private key).

    Args:
        bucket_name: Name of the Cloud Storage bucket
        storage_path: Path to the object in the bucket
        expiration_hours: URL validity period in hours (default: 168)

    Returns:
        Tuple of (signed_url, expiration_time)
    """
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(storage_path)

    expiration = timedelta(hours=expiration_hours)
    expiration_time = datetime.now(UTC) + expiration

    # Get credentials and refresh if needed
    credentials, project = google.auth.default()
    if not credentials.valid:
        credentials.refresh(google.auth.transport.requests.Request())

    # Get service account email for IAM signing
    if hasattr(credentials, "service_account_email"):
        service_account_email = credentials.service_account_email
    else:
        # Fallback for local development or other credential types
        service_account_email = f"webhook-function-sa@{GCP_PROJECT_ID}.iam.gserviceaccount.com"

    url = blob.generate_signed_url(
        version="v4",
        expiration=expiration,
        method="GET",
        service_account_email=service_account_email,
        access_token=credentials.token,
    )

    logger.info(f"Generated signed URL for {storage_path}, expires at {expiration_time.isoformat()}")
    return url, expiration_time


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


def _find_user_by_status(line_user_id: str, join_status: str):
    """
    Find the most recent user document matching line_user_id and join_status.

    Returns:
        Tuple of (document_snapshot, document_reference) or (None, None)
    """
    users_ref = db.collection("users")
    q = (
        users_ref.where(filter=firestore.FieldFilter("line_user_id", "==", line_user_id))
        .where(filter=firestore.FieldFilter("join_status", "==", join_status))
        .order_by("created_at", direction=firestore.Query.DESCENDING)
        .limit(1)
    )
    docs = list(q.stream())
    if docs:
        doc = docs[0]
        return doc, users_ref.document(doc.id)
    return None, None


def _deactivate_other_registrations(line_user_id: str, new_event_id: str):
    """
    Deactivate user registrations in other events when joining a new one.
    Sets join_status to "left" for any active registrations in different events.
    """
    users_ref = db.collection("users")
    q = users_ref.where(filter=firestore.FieldFilter("line_user_id", "==", line_user_id)).where(
        filter=firestore.FieldFilter("join_status", "in", ["registered", "pending_name"])
    )
    for doc in q.stream():
        if doc.to_dict().get("event_id") != new_event_id:
            users_ref.document(doc.id).update({"join_status": "left"})
            logger.info(f"Deactivated registration {doc.id} for user {line_user_id}")


@firestore.transactional
def _join_event_transaction(transaction, user_ref, user_id: str, event_id: str, event_name: str) -> TextMessage:
    """
    Transactional check-and-set for a user document during JOIN.
    Returns a TextMessage to be sent outside the transaction.
    """
    doc = user_ref.get(transaction=transaction)

    if doc.exists:
        data = doc.to_dict()
        status = data.get("join_status")
        if status == "pending_name":
            return TextMessage(
                text=f"「{event_name}」に参加登録中です。\n\nお名前をテキストで送信してください。\n例: 山田太郎"
            )
        if status == "left":
            name = data.get("name")
            if name:
                transaction.update(user_ref, {"join_status": "registered"})
                logger.info(f"User {user_id} reactivated in event {event_id} (registered)")
                return TextMessage(
                    text=f"{name}さん、おかえりなさい！「{event_name}」に再参加しました。\n\n笑顔の写真をアップロードしよう！"
                )
            transaction.update(user_ref, {"join_status": "pending_name"})
            logger.info(f"User {user_id} reactivated in event {event_id} (pending name)")
            return TextMessage(
                text=f"「{event_name}」に再参加しました！\n\nお名前をテキストで送信してください。\n例: 山田太郎"
            )
        # "registered" or any other status
        name = data.get("name", "ゲスト")
        return TextMessage(text=f"{name}さん、「{event_name}」に既に参加済みです！\n\n笑顔の写真をアップロードしよう！")

    # New user
    transaction.set(
        user_ref,
        {
            "line_user_id": user_id,
            "event_id": event_id,
            "join_status": "pending_name",
            "created_at": firestore.SERVER_TIMESTAMP,
            "total_uploads": 0,
            "best_score": 0,
        },
    )
    logger.info(f"User {user_id} joined event {event_id} (pending name)")
    return TextMessage(
        text=f"「{event_name}」への参加を受け付けました！\n\nお名前をテキストで送信してください。\n例: 山田太郎"
    )


def handle_join_event(event_code: str, user_id: str, reply_token: str):
    """
    Handle JOIN {event_code} command.
    Looks up event by event_code, creates or reactivates user document with composite key.

    Args:
        event_code: Event code from JOIN command
        user_id: LINE user ID
        reply_token: LINE reply token
    """
    event_code = event_code.strip()

    # Validate event code format
    is_valid, error_message = validate_event_code(event_code)
    if not is_valid:
        messaging_api.reply_message(
            ReplyMessageRequest(
                reply_token=reply_token,
                messages=[TextMessage(text=error_message)],
            )
        )
        return

    logger.info(f"JOIN request from {user_id} with code: {event_code}")

    # 1. Look up event by event_code (outside transaction — events don't change during JOIN)
    events_ref = db.collection("events")
    q = (
        events_ref.where(filter=firestore.FieldFilter("event_code", "==", event_code))
        .where(filter=firestore.FieldFilter("status", "==", "active"))
        .limit(1)
    )
    event_docs = list(q.stream())

    if not event_docs:
        messaging_api.reply_message(
            ReplyMessageRequest(
                reply_token=reply_token,
                messages=[
                    TextMessage(text="参加コードが見つかりません。\n\nコードを確認して、もう一度お試しください。")
                ],
            )
        )
        return

    event_doc = event_docs[0]
    event_data = event_doc.to_dict()
    event_id = event_doc.id
    event_name = event_data.get("event_name", "イベント")

    # 2. Deactivate registrations in other events (outside transaction — idempotent)
    _deactivate_other_registrations(user_id, event_id)

    # 3. Transactional check-and-set for user document
    composite_key = f"{user_id}_{event_id}"
    user_ref = db.collection("users").document(composite_key)
    transaction = db.transaction()
    message = _join_event_transaction(transaction, user_ref, user_id, event_id, event_name)

    # 4. Reply outside transaction (executed once, retry-safe)
    messaging_api.reply_message(ReplyMessageRequest(reply_token=reply_token, messages=[message]))


@handler.add(MessageEvent, message=TextMessageContent)
def handle_text_message(event: MessageEvent):
    """
    Handle text message event.
    Routes to appropriate handler based on message content and user state:
    - JOIN {event_code}: Join an event
    - pending_name state: Register name
    - registered state: Handle commands
    - No active event: Prompt to join
    """
    user_id = event.source.user_id
    text = event.message.text.strip()
    reply_token = event.reply_token

    # Normalize: strip LINE deeplink "text=" artifact
    if text.startswith("text="):
        text = text[len("text=") :]

    logger.info(f"Text message from {user_id}: {text}")

    # Case 1: JOIN command
    match = JOIN_PATTERN.match(text)
    if match:
        handle_join_event(match.group(1), user_id, reply_token)
        return

    # Case 2: Check for pending_name status (needs to register name)
    pending_doc, pending_ref = _find_user_by_status(user_id, "pending_name")
    if pending_doc:
        _register_name(text, user_id, pending_doc, pending_ref, reply_token)
        return

    # Case 3: Check for registered status (active participant)
    registered_doc, _registered_ref = _find_user_by_status(user_id, "registered")
    if registered_doc:
        handle_command(text, reply_token)
        return

    # Case 4: Not joined any event
    message = TextMessage(
        text="イベントに参加するには、主催者から共有された参加コードを使って\n"
        "「JOIN 参加コード」と送信してください。\n\n"
        "例: JOIN abc12345-6789-..."
    )
    messaging_api.reply_message(ReplyMessageRequest(reply_token=reply_token, messages=[message]))


def _register_name(name: str, user_id: str, user_doc, user_ref, reply_token: str):
    """
    Register user name for a pending_name user document.

    Args:
        name: User's name from text message
        user_id: LINE user ID
        user_doc: User document snapshot
        user_ref: User document reference
        reply_token: LINE reply token
    """
    # Validate user name
    is_valid, error_message = validate_user_name(name)
    if not is_valid:
        messaging_api.reply_message(
            ReplyMessageRequest(
                reply_token=reply_token,
                messages=[TextMessage(text=error_message)],
            )
        )
        return

    name = name.strip()

    try:
        user_ref.update(
            {
                "name": name,
                "join_status": "registered",
            }
        )

        logger.info(f"User registered: {user_id} - {name}")

        message = TextMessage(
            text=f"{name}さん、登録完了です！\n\n"
            "📷 写真の取り扱いについて\n"
            "送信された写真はAI分析・ランキング表示に使用されます。\n"
            "詳細: https://wedding-smile-catcher.web.app/privacy\n\n"
            "写真を送信することで上記に同意したものとみなします。\n"
            "早速、笑顔の写真を送ってみましょう！"
        )
        messaging_api.reply_message(ReplyMessageRequest(reply_token=reply_token, messages=[message]))

    except Exception as e:
        logger.error(f"Failed to register user: {str(e)}")
        message = TextMessage(text="登録に失敗しました。もう一度お試しください。")
        messaging_api.reply_message(ReplyMessageRequest(reply_token=reply_token, messages=[message]))


def handle_command(text: str, reply_token: str):
    """
    Handle commands from registered users.

    Args:
        text: Command text
        reply_token: LINE reply token
    """
    if text in ["ヘルプ", "help", "使い方"]:
        message = TextMessage(
            text="【Smile Photo Contest 使い方】\n\n"
            "📸 写真を送信\n"
            "  → AIが笑顔を分析してスコアをお伝えします\n\n"
            "❓ 「ヘルプ」\n"
            "  → この使い方を表示"
        )
    else:
        message = TextMessage(text="笑顔の写真をアップロードしよう！\n\n「ヘルプ」と送信すると使い方を確認できます。")

    messaging_api.reply_message(ReplyMessageRequest(reply_token=reply_token, messages=[message]))


@handler.add(MessageEvent, message=ImageMessageContent)
def handle_image_message(event: MessageEvent):
    """
    Handle image message event.
    - Look up user's registered event
    - Download image from LINE
    - Upload to Cloud Storage
    - Create Firestore document (with user_name denormalized)
    - Trigger scoring function
    """
    user_id = event.source.user_id
    message_id = event.message.id
    reply_token = event.reply_token

    logger.info(f"Image message from {user_id}: {message_id}")

    # Find user's active (registered) event
    user_doc, _user_ref = _find_user_by_status(user_id, "registered")

    if not user_doc:
        message = TextMessage(
            text="イベントに参加してからお写真を送ってください。\n\n「JOIN 参加コード」でイベントに参加できます。"
        )
        messaging_api.reply_message(ReplyMessageRequest(reply_token=reply_token, messages=[message]))
        return

    user_data = user_doc.to_dict()
    event_id = user_data.get("event_id")
    user_name = user_data.get("name", "ゲスト")

    if not event_id:
        logger.error(f"User {user_id} has no event_id in document {user_doc.id}")
        message = TextMessage(text="エラーが発生しました。もう一度イベントに参加してください。")
        messaging_api.reply_message(ReplyMessageRequest(reply_token=reply_token, messages=[message]))
        return

    # Reject image if event is no longer active
    event_doc = db.collection("events").document(event_id).get()
    if not event_doc.exists:
        logger.error(f"Event not found: {event_id}")
        message = TextMessage(text="イベントが見つかりません。\nもう一度参加してください。")
        messaging_api.reply_message(ReplyMessageRequest(reply_token=reply_token, messages=[message]))
        return

    event_status = event_doc.to_dict().get("status")
    if event_status != "active":
        logger.info(f"Image rejected: event {event_id} status is {event_status}")
        message = TextMessage(text="このイベントは終了しました。\n\n写真の投稿は受け付けていません。")
        messaging_api.reply_message(ReplyMessageRequest(reply_token=reply_token, messages=[message]))
        return

    # Send loading message
    loading_message = TextMessage(text="📸 画像を受け取りました！\n\nAIが笑顔を分析中...\nしばらくお待ちください ⏳")
    messaging_api.reply_message(ReplyMessageRequest(reply_token=reply_token, messages=[loading_message]))

    try:
        # Download image from LINE
        image_bytes = bytes(messaging_api_blob.get_message_content(message_id))

        # Generate unique image ID and path
        image_id = str(uuid.uuid4())
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        storage_path = f"{event_id}/original/{user_id}/{timestamp}_{image_id}.jpg"

        # Upload to Cloud Storage
        bucket = storage_client.bucket(STORAGE_BUCKET)
        blob = bucket.blob(storage_path)
        blob.upload_from_string(image_bytes, content_type="image/jpeg")

        logger.info(f"Image uploaded to Storage: {storage_path}")

        # Generate signed URL for immediate display
        image_doc_data = {
            "user_id": user_id,
            "user_name": user_name,
            "event_id": event_id,
            "storage_path": storage_path,
            "upload_timestamp": firestore.SERVER_TIMESTAMP,
            "status": "pending",
            "line_message_id": message_id,
        }

        try:
            signed_url, expiration_time = generate_signed_url(STORAGE_BUCKET, storage_path)
            image_doc_data["storage_url"] = signed_url
            image_doc_data["storage_url_expires_at"] = expiration_time
            logger.info(f"Signed URL generated for image {image_id}")
        except Exception as e:
            logger.warning(f"Failed to generate signed URL for image {image_id}: {str(e)}")
            # Continue without signed URL - scoring function will generate it later

        # Create Firestore document (user_name denormalized for frontend)
        image_ref = db.collection("images").document(image_id)
        image_ref.set(image_doc_data)

        logger.info(f"Firestore document created: {image_id}")

        # Trigger scoring function (asynchronously)
        if SCORING_FUNCTION_URL:
            trigger_scoring_function(image_id, user_id)
        else:
            logger.warning("SCORING_FUNCTION_URL not set, skipping scoring trigger")

    except ApiException as e:
        logger.error(f"LINE API error: {e.status} {e.reason}")
        messaging_api.push_message(
            PushMessageRequest(
                to=user_id,
                messages=[TextMessage(text="画像の取得に失敗しました。\n\nもう一度お試しください。")],
            )
        )

    except Exception as e:
        logger.error(f"Failed to process image: {str(e)}")
        messaging_api.push_message(
            PushMessageRequest(
                to=user_id,
                messages=[TextMessage(text="画像の処理に失敗しました。\n\nもう一度お試しください。")],
            )
        )


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
            if os.environ.get("K_SERVICE"):
                # Cloud Functions: use metadata server
                id_token_value = id_token.fetch_id_token(auth_req, SCORING_FUNCTION_URL)
            else:
                # Local: impersonate the webhook service account
                source_creds, _ = google.auth.default()
                impersonated = imp_creds.Credentials(
                    source_credentials=source_creds,
                    target_principal=f"webhook-function-sa@{GCP_PROJECT_ID}.iam.gserviceaccount.com",
                    target_scopes=["https://www.googleapis.com/auth/cloud-platform"],
                )
                id_token_creds = imp_creds.IDTokenCredentials(
                    target_credentials=impersonated,
                    target_audience=SCORING_FUNCTION_URL,
                )
                id_token_creds.refresh(auth_req)
                id_token_value = id_token_creds.token

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


@handler.add(UnsendEvent)
def handle_unsend(event):
    """
    Handle message unsend event.
    Deletes image from Cloud Storage and Firestore when user unsends a photo.
    This is required for LINE User Data Policy compliance.

    Args:
        event: LINE UnsendEvent
    """
    message_id = event.unsend.message_id
    user_id = event.source.user_id
    logger.info(f"Unsend event from {user_id} for message: {message_id}")

    try:
        # Find image document by line_message_id
        images_ref = db.collection("images")
        query = images_ref.where(filter=firestore.FieldFilter("line_message_id", "==", message_id)).limit(1)
        image_docs = list(query.stream())

        if not image_docs:
            logger.info(f"No image found for message_id: {message_id}")
            return

        image_doc = image_docs[0]
        image_data = image_doc.to_dict()
        storage_path = image_data.get("storage_path")

        # Delete from Cloud Storage
        if storage_path:
            try:
                bucket = storage_client.bucket(STORAGE_BUCKET)
                blob = bucket.blob(storage_path)
                blob.delete()
                logger.info(f"Deleted image from Storage: {storage_path}")
            except Exception as e:
                logger.warning(f"Failed to delete from Storage: {str(e)}")

        # Delete from Firestore
        image_doc.reference.delete()
        logger.info(f"Deleted image document: {image_doc.id}")

    except Exception as e:
        logger.error(f"Failed to handle unsend event: {str(e)}")


# Message for unsupported content types
UNSUPPORTED_CONTENT_MESSAGE = "画像を投稿しよう！"


@handler.add(MessageEvent, message=VideoMessageContent)
def handle_video_message(event: MessageEvent):
    """Handle video message - inform user that only images are supported."""
    messaging_api.reply_message(
        ReplyMessageRequest(
            reply_token=event.reply_token,
            messages=[TextMessage(text=UNSUPPORTED_CONTENT_MESSAGE)],
        )
    )


@handler.add(MessageEvent, message=StickerMessageContent)
def handle_sticker_message(event: MessageEvent):
    """Handle sticker message - inform user that only images are supported."""
    messaging_api.reply_message(
        ReplyMessageRequest(
            reply_token=event.reply_token,
            messages=[TextMessage(text=UNSUPPORTED_CONTENT_MESSAGE)],
        )
    )


@handler.add(MessageEvent, message=AudioMessageContent)
def handle_audio_message(event: MessageEvent):
    """Handle audio message - inform user that only images are supported."""
    messaging_api.reply_message(
        ReplyMessageRequest(
            reply_token=event.reply_token,
            messages=[TextMessage(text=UNSUPPORTED_CONTENT_MESSAGE)],
        )
    )


@handler.add(MessageEvent, message=LocationMessageContent)
def handle_location_message(event: MessageEvent):
    """Handle location message - inform user that only images are supported."""
    messaging_api.reply_message(
        ReplyMessageRequest(
            reply_token=event.reply_token,
            messages=[TextMessage(text=UNSUPPORTED_CONTENT_MESSAGE)],
        )
    )


@handler.add(MessageEvent, message=FileMessageContent)
def handle_file_message(event: MessageEvent):
    """Handle file message - inform user that only images are supported."""
    messaging_api.reply_message(
        ReplyMessageRequest(
            reply_token=event.reply_token,
            messages=[TextMessage(text=UNSUPPORTED_CONTENT_MESSAGE)],
        )
    )


def verify_line_id_token(id_token_str: str) -> tuple[str | None, str | None, str | None]:
    """Verify a LINE ID token via LINE's verification API.

    Args:
        id_token_str: The LIFF ID token to verify

    Returns:
        Tuple of (user_id, display_name, error_message)
    """
    if not LIFF_CHANNEL_ID:
        logger.error("LIFF_CHANNEL_ID is not set")
        return None, None, "Server configuration error"

    try:
        resp = requests.post(
            "https://api.line.me/oauth2/v2.1/verify",
            data={"id_token": id_token_str, "client_id": LIFF_CHANNEL_ID},
            timeout=10,
        )
        if resp.status_code != 200:
            logger.warning(f"LINE ID token verification failed: {resp.status_code} {resp.text}")
            return None, None, "Invalid or expired ID token"

        payload = resp.json()
        user_id = payload.get("sub")
        display_name = payload.get("name", "")

        if not user_id:
            return None, None, "ID token missing user ID"

        return user_id, display_name, None
    except Exception as e:
        logger.error(f"LINE ID token verification error: {e}")
        return None, None, "Token verification failed"


@functions_framework.http
def liff_join(request: Request):
    """
    LIFF endpoint for automatic event joining.
    If id_token is provided, verifies it server-side to extract user identity.
    Otherwise falls back to client-supplied user_id/display_name.

    Expected JSON body:
    {
        "user_id": "LINE user ID",
        "display_name": "LINE display name",
        "id_token": "LINE LIFF ID token (optional)",
        "event_code": "event code"
    }
    """
    # Handle CORS preflight
    cors_headers = get_liff_cors_headers(request)
    if request.method == "OPTIONS":
        headers = {
            **cors_headers,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "3600",
        }
        return ("", 204, headers)

    if request.method != "POST":
        return (jsonify({"error": "Method not allowed"}), 405, cors_headers)

    try:
        data = request.get_json()
        if not data:
            return (jsonify({"error": "Invalid JSON"}), 400, cors_headers)

        event_code = data.get("event_code")
        if not event_code:
            return (
                jsonify({"error": "Missing required field: event_code"}),
                400,
                cors_headers,
            )

        # Prefer ID token verification if available
        id_token_str = data.get("id_token")
        if id_token_str:
            user_id, display_name, token_error = verify_line_id_token(id_token_str)
            if token_error:
                return (jsonify({"error": token_error}), 401, cors_headers)
        else:
            user_id = data.get("user_id")
            display_name = data.get("display_name")
            if not user_id or not display_name:
                return (
                    jsonify({"error": "Missing required fields: user_id, display_name"}),
                    400,
                    cors_headers,
                )

        # Validate event code
        is_valid, error_message = validate_event_code(event_code)
        if not is_valid:
            return (jsonify({"error": error_message}), 400, cors_headers)

        logger.info(f"LIFF JOIN request from {user_id} ({display_name}) with code: {event_code}")

        # Look up event by event_code
        events_ref = db.collection("events")
        q = (
            events_ref.where(filter=firestore.FieldFilter("event_code", "==", event_code))
            .where(filter=firestore.FieldFilter("status", "==", "active"))
            .limit(1)
        )
        event_docs = list(q.stream())

        if not event_docs:
            return (jsonify({"error": "参加コードが見つかりません"}), 404, cors_headers)

        event_doc = event_docs[0]
        event_data = event_doc.to_dict()
        event_id = event_doc.id
        event_name = event_data.get("event_name", "イベント")

        # Deactivate registrations in other events
        _deactivate_other_registrations(user_id, event_id)

        # Create or update user document
        composite_key = f"{user_id}_{event_id}"
        user_ref = db.collection("users").document(composite_key)

        @firestore.transactional
        def join_with_name(transaction, user_ref):
            doc = user_ref.get(transaction=transaction)

            if doc.exists:
                data = doc.to_dict()
                status = data.get("join_status")
                existing_name = data.get("name")

                if status == "left":
                    # Reactivate with existing name or new display name
                    transaction.update(
                        user_ref,
                        {
                            "join_status": "registered",
                            "name": existing_name or display_name,
                        },
                    )
                    return {"status": "reactivated", "name": existing_name or display_name}
                else:
                    # Already registered
                    return {"status": "already_joined", "name": existing_name or display_name}
            else:
                # New user - register with LINE display name
                transaction.set(
                    user_ref,
                    {
                        "line_user_id": user_id,
                        "event_id": event_id,
                        "name": display_name,
                        "join_status": "registered",
                        "created_at": firestore.SERVER_TIMESTAMP,
                        "total_uploads": 0,
                        "best_score": 0,
                    },
                )
                return {"status": "joined", "name": display_name}

        transaction = db.transaction()
        result = join_with_name(transaction, user_ref)

        logger.info(f"LIFF JOIN result for {user_id}: {result['status']}")

        return (
            jsonify(
                {
                    "success": True,
                    "status": result["status"],
                    "event_name": event_name,
                    "user_name": result["name"],
                }
            ),
            200,
            cors_headers,
        )

    except Exception as e:
        logger.error(f"LIFF JOIN error: {str(e)}")
        return (jsonify({"error": "サーバーエラーが発生しました"}), 500, cors_headers)
