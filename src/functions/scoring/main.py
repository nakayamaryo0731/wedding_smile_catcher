"""
Wedding Smile Catcher - Scoring Function

Analyzes uploaded images using:
- Vision API for smile detection (face count + joy likelihood)
- Vertex AI (Gemini) for theme evaluation (0-100 score + comment)
- Average Hash for similarity detection (prevents spam uploads)
- Face size multiplier to penalize small faces in group photos
- Format face count as "大勢" for 10+ people
"""

import io
import json
import logging
import os
import random
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from typing import Any

import functions_framework
import google.auth
import google.auth.transport.requests
import imagehash
import vertexai
from flask import Request, jsonify
from google.cloud import firestore, storage, vision
from google.cloud import logging as cloud_logging
from linebot.v3.messaging import (
    ApiClient,
    Configuration,
    MessagingApi,
    PushMessageRequest,
    TextMessage,
)
from linebot.v3.messaging.exceptions import ApiException
from PIL import Image as PILImage
from vertexai.generative_models import GenerativeModel, Part

# Initialize Cloud Logging
logging_client = cloud_logging.Client()
logging_client.setup_logging()

# Initialize logger with Cloud Logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Initialize Google Cloud clients
db = firestore.Client()
storage_client = storage.Client()
vision_client = vision.ImageAnnotatorClient()

# Environment variables
LINE_CHANNEL_ACCESS_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "wedding-smile-catcher")
GCP_REGION = os.environ.get("GCP_REGION", "asia-northeast1")
STORAGE_BUCKET = os.environ.get("STORAGE_BUCKET", "wedding-smile-images")

# Validate required environment variables at startup
_REQUIRED_ENV_VARS = ["LINE_CHANNEL_ACCESS_TOKEN"]
_missing_vars = [var for var in _REQUIRED_ENV_VARS if not os.environ.get(var)]
if _missing_vars:
    raise RuntimeError(f"Missing required environment variables: {', '.join(_missing_vars)}")

# Initialize LINE Bot API (v3)
configuration = Configuration(access_token=LINE_CHANNEL_ACCESS_TOKEN)
api_client = ApiClient(configuration)
messaging_api = MessagingApi(api_client)

# Initialize Vertex AI
vertexai.init(project=GCP_PROJECT_ID, location=GCP_REGION)

# Initialize Gemini model once at module level to avoid re-initialization overhead
gemini_model = GenerativeModel("gemini-2.5-flash")

# Signed URL configuration (7 days - sufficient for wedding event + post-event viewing)
SIGNED_URL_EXPIRATION_HOURS = 168


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
        service_account_email = f"scoring-function-sa@{GCP_PROJECT_ID}.iam.gserviceaccount.com"

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
def scoring(request: Request):
    """
    Cloud Functions HTTP entrypoint for scoring.

    Analyzes uploaded images using Vision API for smile detection.
    Calculates scores and sends results back to LINE Bot.

    Args:
        request: Flask Request object with image_id and user_id

    Returns:
        JSON response with scoring results
    """
    # Generate request ID for tracing
    request_id = str(uuid.uuid4())

    # Parse request
    request_json = request.get_json(silent=True)

    if not request_json:
        logger.warning("No JSON body provided", extra={"request_id": request_id})
        return jsonify({"error": "No JSON body provided"}), 400

    image_id = request_json.get("image_id")
    user_id = request_json.get("user_id")

    if not image_id or not user_id:
        logger.warning(
            "Missing required parameters",
            extra={"request_id": request_id, "image_id": image_id, "user_id": user_id},
        )
        return jsonify({"error": "Missing image_id or user_id"}), 400

    # Structured logging with context
    logger.info(
        "Scoring request received",
        extra={
            "request_id": request_id,
            "image_id": image_id,
            "user_id": user_id,
            "event": "scoring_started",
        },
    )

    start_time = time.time()

    try:
        # Generate scores using Vision API
        scores = generate_scores_with_vision_api(image_id, request_id)

        # Update Firestore
        update_firestore(image_id, user_id, scores)

        # Send result to LINE
        send_result_to_line(user_id, scores)

        elapsed_time = time.time() - start_time

        # Success log with metrics
        logger.info(
            "Scoring completed successfully",
            extra={
                "request_id": request_id,
                "image_id": image_id,
                "user_id": user_id,
                "total_score": scores.get("total_score"),
                "elapsed_time": round(elapsed_time, 2),
                "event": "scoring_completed",
            },
        )

        # Return success response
        return (
            jsonify(
                {
                    "status": "success",
                    "image_id": image_id,
                    "scores": scores,
                    "request_id": request_id,
                }
            ),
            200,
        )

    except Exception as e:
        elapsed_time = time.time() - start_time

        logger.error(
            "Scoring failed",
            extra={
                "request_id": request_id,
                "image_id": image_id,
                "user_id": user_id,
                "error": str(e),
                "error_type": type(e).__name__,
                "elapsed_time": round(elapsed_time, 2),
                "event": "scoring_failed",
            },
            exc_info=True,
        )

        # Try to send error message to user
        try:
            send_error_to_line(user_id)
        except Exception:
            pass

        return (
            jsonify(
                {
                    "status": "error",
                    "error": str(e),
                    "image_id": image_id,
                    "request_id": request_id,
                }
            ),
            500,
        )


def get_joy_likelihood_score(joy_likelihood, detection_confidence: float) -> float:
    """
    Convert joy likelihood enum to numeric score with detection_confidence adjustment.

    The base score from joy_likelihood (5 discrete levels) is adjusted by
    detection_confidence to create a more continuous score distribution.

    Args:
        joy_likelihood: Vision API joy likelihood enum
        detection_confidence: Face detection confidence (0.0-1.0)

    Returns:
        Numeric score (0-105), adjusted by confidence bonus (±10 points)
    """
    likelihood_map = {
        vision.Likelihood.VERY_LIKELY: 95.0,
        vision.Likelihood.LIKELY: 75.0,
        vision.Likelihood.POSSIBLE: 50.0,
        vision.Likelihood.UNLIKELY: 25.0,
        vision.Likelihood.VERY_UNLIKELY: 5.0,
        vision.Likelihood.UNKNOWN: 0.0,
    }
    base = likelihood_map.get(joy_likelihood, 0.0)

    # detection_confidence (0~1) を -10 〜 +10 のボーナスに変換
    # 0.5 を基準とし、高いほどプラス、低いほどマイナス
    confidence_bonus = (detection_confidence - 0.5) * 20

    return max(0.0, base + confidence_bonus)


def get_face_size_multiplier(face, image_width: int, image_height: int) -> float:
    """
    Calculate a multiplier based on face size relative to image size.

    Larger faces get higher multipliers (up to 1.2).
    Smaller faces get lower multipliers (down to 0.5).
    Goal: Minimal differentiation between close-up and group photos.

    Args:
        face: Vision API FaceAnnotation object
        image_width: Image width in pixels
        image_height: Image height in pixels

    Returns:
        Multiplier between 0.5 and 1.2
    """
    bbox = face.bounding_poly
    vertices = [(v.x, v.y) for v in bbox.vertices]
    xs = [v[0] for v in vertices]
    ys = [v[1] for v in vertices]

    face_width = max(xs) - min(xs)
    face_height = max(ys) - min(ys)
    face_area = face_width * face_height
    image_area = image_width * image_height
    relative_size = face_area / image_area if image_area > 0 else 0

    # Thresholds and multipliers (range 0.5-1.2, ratio 2.4x):
    # - 8%+ (close-up, 1-2 people): 1.2
    # - 5-8% (small group, 3-4 people): 0.9-1.2 (linear interpolation)
    # - 2-5% (medium group, 5-8 people): 0.6-0.9 (linear interpolation)
    # - 1-2% (large group, 10+ people): 0.5-0.6 (linear interpolation)
    # - <1% (crowd, distant): 0.5
    if relative_size >= 0.08:
        return 1.2
    elif relative_size >= 0.05:
        return 0.9 + (relative_size - 0.05) / (0.08 - 0.05) * 0.3
    elif relative_size >= 0.02:
        return 0.6 + (relative_size - 0.02) / (0.05 - 0.02) * 0.3
    elif relative_size >= 0.01:
        return 0.5 + (relative_size - 0.01) / (0.02 - 0.01) * 0.1
    else:
        return 0.5


def format_face_count(smiling_faces: int, face_count: int) -> str:
    """
    Format face count for display. Shows "大勢" for 10+ people.

    Args:
        smiling_faces: Number of smiling faces detected
        face_count: Total number of faces detected

    Returns:
        Formatted string like "5人/6人" or "大勢"
    """
    if face_count >= 10:
        return "大勢"
    else:
        return f"{smiling_faces}人/{face_count}人"


def calculate_smile_score(image_bytes: bytes) -> dict[str, Any]:
    """
    Calculate smile score using Vision API with face size adjustment.
    Implements exponential backoff retry for rate limit and server errors.

    Larger faces (close-up photos) get full score, while smaller faces
    (distant/crowd photos) get reduced scores.

    Args:
        image_bytes: Image binary data

    Returns:
        Dictionary with smile_score and face_count
    """
    # Get image dimensions for face size calculation
    img = PILImage.open(io.BytesIO(image_bytes))
    image_width, image_height = img.size

    # Retry configuration - generous settings for handling burst traffic
    # With 90 concurrent users, rate limits may trigger temporarily
    # Total max wait: 2 + 4 + 8 + 16 + 30 = 60 seconds (well within 300s timeout)
    max_retries = 5
    base_delay = 2.0  # seconds
    max_delay = 30.0  # seconds

    for attempt in range(max_retries):
        try:
            # Create Vision API image object
            image = vision.Image(content=image_bytes)

            # Detect faces
            response = vision_client.face_detection(image=image)

            if response.error.message:
                raise Exception(f"Vision API error: {response.error.message}")

            # Calculate total smile score with face size adjustment
            total_smile_score = 0.0
            smiling_faces = 0

            for face in response.face_annotations:
                # Only count faces with LIKELY or VERY_LIKELY joy
                if face.joy_likelihood >= vision.Likelihood.LIKELY:
                    base_score = get_joy_likelihood_score(face.joy_likelihood, face.detection_confidence)
                    size_multiplier = get_face_size_multiplier(face, image_width, image_height)
                    adjusted_score = base_score * size_multiplier
                    total_smile_score += adjusted_score
                    smiling_faces += 1
                    logger.info(
                        f"Face detected: joy={face.joy_likelihood.name}, "
                        f"confidence={face.detection_confidence:.2f}, "
                        f"base_score={base_score:.2f}, size_multiplier={size_multiplier:.2f}, "
                        f"adjusted_score={adjusted_score:.2f}"
                    )

            face_count = len(response.face_annotations)

            logger.info(
                f"Smile detection complete: {smiling_faces}/{face_count} smiling faces, "
                f"total score={total_smile_score:.2f}"
            )

            return {
                "smile_score": round(total_smile_score, 2),
                "face_count": face_count,
                "smiling_faces": smiling_faces,
            }

        except Exception as e:
            error_message = str(e)
            logger.warning(f"Vision API error (attempt {attempt + 1}/{max_retries}): {error_message}")

            # Check if error is retryable (rate limit or server error)
            is_retryable = (
                "429" in error_message  # Rate limit
                or "500" in error_message  # Internal server error
                or "502" in error_message  # Bad gateway
                or "503" in error_message  # Service unavailable
                or "504" in error_message  # Gateway timeout
                or "ResourceExhausted" in error_message
                or "DeadlineExceeded" in error_message
            )

            # If not retryable or last attempt, return fallback
            if not is_retryable or attempt == max_retries - 1:
                logger.error(f"Vision API error (final): {error_message}")
                # Return zero score to ensure fairness - API failures should not give any points
                return {
                    "smile_score": 0.0,  # Zero points for API failures
                    "face_count": 0,
                    "smiling_faces": 0,
                    "error": "vision_api_failed",
                }

            # Calculate exponential backoff delay with jitter
            delay = min(base_delay * (2**attempt), max_delay)
            jitter = random.uniform(0, delay * 0.1)  # Add 10% jitter
            sleep_time = delay + jitter

            logger.info(f"Retrying Vision API after {sleep_time:.2f} seconds...")
            time.sleep(sleep_time)

    # Should not reach here, but return fallback just in case
    # Return zero score to ensure fairness - API failures should not give any points
    return {
        "smile_score": 0.0,
        "face_count": 0,
        "smiling_faces": 0,
        "error": "vision_api_failed",
    }


def download_image_from_storage(storage_path: str) -> bytes:
    """
    Download image from Cloud Storage.

    Args:
        storage_path: Path to image in Cloud Storage bucket

    Returns:
        Image binary data
    """
    try:
        bucket = storage_client.bucket(STORAGE_BUCKET)
        blob = bucket.blob(storage_path)
        image_bytes = blob.download_as_bytes()

        logger.info(f"Downloaded image from Storage: {storage_path}")
        return image_bytes

    except Exception as e:
        logger.error(f"Failed to download image: {str(e)}")
        raise


def calculate_average_hash(image_bytes: bytes) -> str:
    """
    Calculate Average Hash for similarity detection.

    Args:
        image_bytes: Image binary data

    Returns:
        str: 64-bit hash value as hexadecimal string
    """
    try:
        img = PILImage.open(io.BytesIO(image_bytes))
        hash_value = imagehash.average_hash(img, hash_size=8)
        hash_str = str(hash_value)

        logger.info(f"Calculated average hash: {hash_str}")
        return hash_str

    except Exception as e:
        logger.error(f"Failed to calculate average hash: {str(e)}")
        # Return a random hash as fallback to avoid blocking the process
        return f"error_{random.randint(1000, 9999)}"


def is_similar_image(new_hash: str, existing_hashes: list[str], threshold: int = 8) -> bool:
    """
    Check if the image is similar to any existing images.

    Args:
        new_hash: Hash of the new image
        existing_hashes: List of hashes from existing images
        threshold: Hamming distance threshold (default: 8)

    Returns:
        bool: True if similar image exists
    """
    # Skip similarity check if new hash is an error hash
    if new_hash.startswith("error_"):
        logger.warning("Skipping similarity check due to hash calculation error")
        return False

    try:
        new_hash_obj = imagehash.hex_to_hash(new_hash)

        # Filter out error hashes once before the loop
        valid_hashes = [h for h in existing_hashes if not h.startswith("error_")]

        for existing_hash in valid_hashes:
            try:
                existing_hash_obj = imagehash.hex_to_hash(existing_hash)
                hamming_distance = new_hash_obj - existing_hash_obj

                logger.info(f"Comparing hashes: new={new_hash}, existing={existing_hash}, distance={hamming_distance}")

                if hamming_distance <= threshold:
                    logger.warning(f"Similar image detected! Distance={hamming_distance} <= {threshold}")
                    return True

            except Exception as e:
                logger.error(f"Error comparing hash {existing_hash}: {str(e)}")
                continue

        logger.info(f"No similar images found (checked {len(valid_hashes)} valid hashes)")
        return False

    except Exception as e:
        logger.error(f"Error in similarity check: {str(e)}")
        # On error, assume not similar to avoid blocking uploads
        return False


def get_existing_hashes_for_user(user_id: str, event_id: str) -> list[str]:
    """
    Get all existing average hashes for a user's uploaded images in the specified event.

    Args:
        user_id: User ID
        event_id: Event ID

    Returns:
        List of average hash strings
    """
    try:
        # Query images collection for this user in the event with status 'completed'
        images_query = (
            db.collection("images")
            .where("event_id", "==", event_id)
            .where("user_id", "==", user_id)
            .where("status", "==", "completed")
            .get()
        )

        hashes = []
        for doc in images_query:
            data = doc.to_dict()
            if "average_hash" in data:
                hashes.append(data["average_hash"])

        logger.info(f"Retrieved {len(hashes)} existing hashes for user {user_id}")
        return hashes

    except Exception as e:
        logger.error(f"Failed to get existing hashes: {str(e)}")
        # Return empty list on error to avoid blocking the process
        return []


def evaluate_theme(image_bytes: bytes) -> dict[str, Any]:
    """
    Evaluate image theme relevance using Vertex AI (Gemini).
    Implements exponential backoff retry for rate limit and server errors.

    Args:
        image_bytes: Image binary data

    Returns:
        Dictionary with score (0-100) and comment
    """
    prompt = """
あなたは結婚式写真の専門家です。提供された写真を分析し、以下の基準に従って笑顔の評価を行ってください：

## 分析対象
- 写真に写っている全ての人物の表情を評価
- グループショットの場合は、全体的な雰囲気も考慮

## 評価基準（100点満点）
1. 自然さ（30点）
   - 作り笑いではなく、自然な表情かどうか
   - 緊張が感じられず、リラックスしているか
   - 目元の表情が自然か

2. 幸福度（40点）
   - 純粋な喜びが表現されているか
   - 目が笑っているか（クローズドスマイル）
   - 歯が見える程度の適度な笑顔か

3. 周囲との調和（30点）
   - 周りの人々と笑顔が調和しているか
   - 場面に相応しい表情の大きさか
   - グループ全体で統一感のある雰囲気が出ているか

## 採点方法
コメントについて：
- 具体的な改善点があれば提案
- 特に優れている点は強調

## 注意事項
- 文化的背景や結婚式のスタイルを考慮
- 否定的な表現は避け、建設的なフィードバックを心がける
- プライバシーに配慮した表現を使用
- 特定の人物を「新郎新婦」と呼ばない（誤認識の可能性があるため）

## 出力
JSON形式でscoreとcommentのキーで返却する。JSONのみを出力すること。
commentは100文字以内で簡潔に記述すること。

例:
{
  "score": 85,
  "comment": "全員の目元から溢れる自然な喜びが印象的です。グループ全体の一体感も素晴らしく、幸せな瞬間が伝わってきます"
}
"""

    # Retry configuration - generous settings for handling burst traffic
    # With 90 concurrent users, rate limits may trigger temporarily
    # Total max wait: 2 + 4 + 8 + 16 + 30 = 60 seconds (well within 300s timeout)
    max_retries = 5
    base_delay = 2.0  # seconds
    max_delay = 30.0  # seconds

    for attempt in range(max_retries):
        try:
            # Create image part from bytes
            image_part = Part.from_data(image_bytes, mime_type="image/jpeg")

            # Generate content using module-level model instance
            response = gemini_model.generate_content([image_part, prompt])

            logger.info(f"Gemini response: {response.text}")

            # Parse JSON response
            # Remove markdown code blocks if present
            response_text = response.text.strip()
            if response_text.startswith("```json"):
                response_text = response_text[7:]  # Remove ```json
            if response_text.startswith("```"):
                response_text = response_text[3:]  # Remove ```
            if response_text.endswith("```"):
                response_text = response_text[:-3]  # Remove ```
            response_text = response_text.strip()

            result = json.loads(response_text)

            # Validate response structure
            if "score" not in result or "comment" not in result:
                raise ValueError("Invalid response format from Gemini")

            # Ensure score is an integer
            result["score"] = int(result["score"])

            logger.info(f"Theme evaluation complete: score={result['score']}, comment={result['comment'][:50]}...")

            return result

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response as JSON: {str(e)}")
            if "response" in locals():
                logger.error(f"Response text: {response.text}")
            # JSON parse errors are not retryable
            return {
                "score": 50,
                "comment": "AI評価の解析に失敗しました。デフォルトスコアを適用しています。",
                "error": "vertex_ai_parse_failed",
            }

        except Exception as e:
            error_message = str(e)
            logger.warning(f"Gemini API error (attempt {attempt + 1}/{max_retries}): {error_message}")

            # Check if error is retryable (rate limit or server error)
            is_retryable = (
                "429" in error_message  # Rate limit
                or "500" in error_message  # Internal server error
                or "502" in error_message  # Bad gateway
                or "503" in error_message  # Service unavailable
                or "504" in error_message  # Gateway timeout
                or "ResourceExhausted" in error_message
                or "DeadlineExceeded" in error_message
            )

            # If not retryable or last attempt, return fallback
            if not is_retryable or attempt == max_retries - 1:
                logger.error(f"Gemini API error (final): {error_message}")
                return {
                    "score": 50,
                    "comment": "AI評価中にエラーが発生しました。デフォルトスコアを適用しています。",
                    "error": "vertex_ai_failed",
                }

            # Calculate exponential backoff delay with jitter
            delay = min(base_delay * (2**attempt), max_delay)
            jitter = random.uniform(0, delay * 0.1)  # Add 10% jitter
            sleep_time = delay + jitter

            logger.info(f"Retrying after {sleep_time:.2f} seconds...")
            time.sleep(sleep_time)

    # Should not reach here, but return fallback just in case
    return {
        "score": 50,
        "comment": "AI評価中にエラーが発生しました。デフォルトスコアを適用しています。",
        "error": "vertex_ai_failed",
    }


def generate_scores_with_vision_api(image_id: str, request_id: str) -> dict[str, Any]:
    """
    Generate scores using Vision API for smile detection, Vertex AI for theme evaluation,
    and Average Hash for similarity detection.

    Uses parallel processing for Vision API, Vertex AI, and Average Hash calculations
    to reduce total processing time.

    Args:
        image_id: Image document ID in Firestore
        request_id: Request ID for tracing

    Returns:
        Dictionary with scoring data
    """
    log_context = {"request_id": request_id, "image_id": image_id}

    # Get image document from Firestore
    image_ref = db.collection("images").document(image_id)
    image_doc = image_ref.get()

    if not image_doc.exists:
        raise Exception(f"Image document not found: {image_id}")

    image_data = image_doc.to_dict()
    storage_path = image_data.get("storage_path")
    user_id = image_data.get("user_id")
    event_id = image_data.get("event_id")

    if not storage_path:
        raise Exception(f"Storage path not found in image document: {image_id}")

    if not user_id:
        raise Exception(f"User ID not found in image document: {image_id}")

    if not event_id:
        raise Exception(f"Event ID not found in image document: {image_id}")

    log_context["user_id"] = user_id

    # Get user document to retrieve LINE user ID (cached for later use)
    # User doc ID is composite key: {line_user_id}_{event_id}
    user_ref = db.collection("users").document(f"{user_id}_{event_id}")
    user_doc = user_ref.get()
    line_user_id = None
    if user_doc.exists:
        user_data = user_doc.to_dict()
        line_user_id = user_data.get("line_user_id")

    # Download image from Cloud Storage
    download_start = time.time()
    image_bytes = download_image_from_storage(storage_path)
    download_time = time.time() - download_start

    logger.info(
        "Image downloaded from storage",
        extra={
            **log_context,
            "elapsed_time": round(download_time, 2),
            "event": "image_downloaded",
        },
    )

    # Execute Vision API, Vertex AI, and Average Hash calculations in parallel
    logger.info(
        "Starting parallel API processing",
        extra={**log_context, "event": "parallel_processing_start"},
    )
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=3) as executor:
        # Submit all three tasks
        vision_future = executor.submit(calculate_smile_score, image_bytes)
        theme_future = executor.submit(evaluate_theme, image_bytes)
        hash_future = executor.submit(calculate_average_hash, image_bytes)

        # Wait for all tasks to complete
        vision_result = vision_future.result()
        theme_result = theme_future.result()
        average_hash = hash_future.result()

    elapsed_time = time.time() - start_time

    smile_score = vision_result["smile_score"]
    face_count = vision_result["face_count"]
    vision_error = vision_result.get("error")

    ai_score = theme_result["score"]
    ai_comment = theme_result["comment"]
    ai_error = theme_result.get("error")

    logger.info(
        "Parallel API processing completed",
        extra={
            **log_context,
            "smile_score": smile_score,
            "face_count": face_count,
            "ai_score": ai_score,
            "elapsed_time": round(elapsed_time, 2),
            "event": "parallel_processing_completed",
        },
    )

    # Get existing hashes for this user in the same event
    existing_hashes = get_existing_hashes_for_user(user_id, event_id)

    # Check if similar image exists
    is_similar = is_similar_image(average_hash, existing_hashes, threshold=8)

    logger.info(
        "Similarity check completed",
        extra={
            **log_context,
            "is_similar": is_similar,
            "existing_hashes_count": len(existing_hashes),
            "event": "similarity_check_completed",
        },
    )

    # Calculate penalty
    penalty = 0.33 if is_similar else 1.0

    # Calculate total score
    total_score = round((smile_score * ai_score / 100) * penalty, 2)

    # Build comment with error warnings if any
    error_warnings = []
    if vision_error:
        logger.warning(f"Vision API error occurred: {vision_error}")
        error_warnings.append("⚠️ 笑顔検出でエラーが発生しました。推定値を使用しています。")
    if ai_error:
        logger.warning(f"Vertex AI error occurred: {ai_error}")
        error_warnings.append("⚠️ AI評価でエラーが発生しました。デフォルト値を使用しています。")

    # Format face count (show "大勢" for 10+ people)
    smiling_faces = vision_result.get("smiling_faces", face_count)
    face_count_display = format_face_count(smiling_faces, face_count)

    if error_warnings:
        warning_text = "\n".join(error_warnings)
        comment = f"{warning_text}\n\n{ai_comment}\n\n笑顔検出: {face_count_display}が笑顔です！"
    else:
        comment = f"{ai_comment}\n\n笑顔検出: {face_count_display}が笑顔です！"

    result = {
        "smile_score": smile_score,
        "ai_score": ai_score,
        "total_score": total_score,
        "comment": comment,
        "face_count": face_count,
        "is_similar": is_similar,
        "average_hash": average_hash,
        "line_user_id": line_user_id,  # Cache LINE user ID to avoid duplicate Firestore read
        "event_id": event_id,  # Cache event_id for composite key construction
        "storage_path": storage_path,  # Cache storage_path for signed URL generation
    }

    # Add error flags if any occurred
    if vision_error or ai_error:
        result["has_errors"] = True
        if vision_error:
            result["vision_error"] = vision_error
        if ai_error:
            result["ai_error"] = ai_error
        logger.error(
            "Scoring completed with errors",
            extra={
                **log_context,
                "total_score": total_score,
                "penalty_applied": is_similar,
                "vision_error": vision_error,
                "ai_error": ai_error,
                "event": "score_calculated_with_errors",
            },
        )
    else:
        logger.info(
            "Scoring completed successfully",
            extra={
                **log_context,
                "total_score": total_score,
                "penalty_applied": is_similar,
                "event": "score_calculated",
            },
        )

    return result


def generate_dummy_scores() -> dict[str, Any]:
    """
    Generate dummy scores for testing.
    This function is kept for backwards compatibility.

    Returns:
        Dictionary with dummy score data
    """
    # Random dummy values
    smile_score = round(random.uniform(300, 500), 2)
    ai_score = random.randint(70, 95)
    face_count = random.randint(3, 7)
    is_similar = random.choice([True, False])

    # Calculate penalty
    penalty = 0.33 if is_similar else 1.0

    # Calculate total score
    total_score = round((smile_score * ai_score / 100) * penalty, 2)

    return {
        "smile_score": smile_score,
        "ai_score": ai_score,
        "total_score": total_score,
        "comment": "これはダミーのスコアリング結果です。実装完了後は実際のAI評価に置き換わります。",
        "face_count": face_count,
        "is_similar": is_similar,
        "average_hash": "dummy_hash_" + str(random.randint(1000, 9999)),
    }


def update_firestore(image_id: str, user_id: str, scores: dict[str, Any]):
    """
    Update Firestore with scoring results.

    Args:
        image_id: Image document ID
        user_id: User ID (LINE user ID)
        scores: Scoring results (includes event_id and storage_path for composite key construction and signed URL generation)

    Raises:
        Exception: If Firestore update fails
    """
    image_ref = db.collection("images").document(image_id)

    # Construct composite key for user document: {line_user_id}_{event_id}
    event_id = scores.get("event_id")
    if event_id:
        user_ref = db.collection("users").document(f"{user_id}_{event_id}")
    else:
        logger.warning(f"No event_id in scores for image {image_id}, falling back to user_id as doc key")
        user_ref = db.collection("users").document(user_id)

    # Generate signed URL for the image
    signed_url_data = None
    storage_path = scores.get("storage_path")
    if storage_path:
        try:
            signed_url, expiration_time = generate_signed_url(STORAGE_BUCKET, storage_path)
            signed_url_data = {
                "storage_url": signed_url,
                "storage_url_expires_at": expiration_time,
            }
        except Exception as e:
            logger.warning(f"Failed to generate signed URL for image {image_id}: {str(e)}")
            # Continue without signed URL - it can be generated later by url_refresh function

    try:
        transaction = db.transaction()
        _update_image_and_user_stats(transaction, image_ref, user_ref, scores, signed_url_data)
        logger.info(f"Successfully updated image {image_id} and user stats {user_id} in transaction")

    except Exception as e:
        logger.error(
            f"Failed to update image {image_id} and user stats {user_id}: {str(e)}",
            exc_info=True,
        )
        raise


@firestore.transactional
def _update_image_and_user_stats(transaction, image_ref, user_ref, scores: dict, signed_url_data: dict | None = None):
    """
    Update image document and user statistics in a single transaction.

    This ensures atomicity - either both updates succeed or neither does,
    preventing data inconsistency between image and user documents.

    IMPORTANT: In Firestore transactions, all reads must happen before any writes.

    Args:
        transaction: Firestore transaction
        image_ref: Image document reference
        user_ref: User document reference
        scores: Scoring results containing total_score, smile_score, etc.
        signed_url_data: Optional dict with 'storage_url' and 'storage_url_expires_at'
    """
    # IMPORTANT: All reads must come before any writes in a transaction
    # Read user document first to get current best score
    user_doc = user_ref.get(transaction=transaction)

    # Build image update data
    image_update = {
        "smile_score": scores["smile_score"],
        "ai_score": scores["ai_score"],
        "total_score": scores["total_score"],
        "comment": scores["comment"],
        "average_hash": scores["average_hash"],
        "is_similar": scores["is_similar"],
        "face_count": scores["face_count"],
        "status": "completed",
        "scored_at": firestore.SERVER_TIMESTAMP,
    }

    # Add signed URL data if provided
    if signed_url_data:
        image_update["storage_url"] = signed_url_data["storage_url"]
        image_update["storage_url_expires_at"] = signed_url_data["storage_url_expires_at"]

    if not user_doc.exists:
        logger.warning(f"User document not found: {user_ref.id}")
        # Still update the image document even if user not found
        transaction.update(image_ref, image_update)
        return

    user_data = user_doc.to_dict()
    current_best = user_data.get("best_score", 0)
    new_best = max(current_best, scores["total_score"])

    # Now perform all writes
    # Update image document
    transaction.update(image_ref, image_update)

    # Update user statistics
    transaction.update(user_ref, {"total_uploads": firestore.Increment(1), "best_score": new_best})


def _send_line_message_with_retry(line_user_id: str, message, max_retries: int = 3):
    """
    Send LINE message with retry logic for transient failures.

    Args:
        line_user_id: LINE user ID
        message: LINE message object
        max_retries: Maximum number of retry attempts (default: 3)
    """
    for attempt in range(max_retries):
        try:
            messaging_api.push_message(PushMessageRequest(to=line_user_id, messages=[message]))
            logger.info(f"Successfully sent message to LINE user: {line_user_id}")
            return

        except ApiException as e:
            is_last_attempt = attempt == max_retries - 1

            # Check if error is retryable (5xx server errors or rate limit)
            is_retryable = (
                500 <= e.status < 600  # Server errors
                or e.status == 429  # Rate limit
            )

            if is_retryable and not is_last_attempt:
                wait_time = 2**attempt  # Exponential backoff: 1s, 2s, 4s
                logger.warning(
                    f"LINE API error {e.status}, retrying in {wait_time}s "
                    f"(attempt {attempt + 1}/{max_retries}): {e.reason}"
                )
                time.sleep(wait_time)
                continue

            # Non-retryable error or final attempt
            logger.error(
                f"LINE API error (final, status={e.status}): {e.reason}",
                exc_info=True,
            )
            return

        except Exception as e:
            is_last_attempt = attempt == max_retries - 1

            if not is_last_attempt:
                wait_time = 2**attempt
                logger.warning(
                    f"Failed to send LINE message, retrying in {wait_time}s "
                    f"(attempt {attempt + 1}/{max_retries}): {str(e)}"
                )
                time.sleep(wait_time)
                continue

            logger.error(
                f"Failed to send LINE message after {max_retries} attempts: {str(e)}",
                exc_info=True,
            )
            return


def send_result_to_line(user_id: str, scores: dict[str, Any]):
    """
    Send scoring result to LINE user.

    Args:
        user_id: User ID (Firestore document ID, not LINE user ID)
        scores: Scoring results (includes cached line_user_id)
    """
    # Use cached LINE user ID from scores to avoid duplicate Firestore read
    line_user_id = scores.get("line_user_id")

    if not line_user_id:
        logger.error(f"LINE user ID not found in scores for user: {user_id}")
        return

    # Build message with face count display (show "大勢" for 10+ people)
    face_count = scores["face_count"]
    if face_count >= 10:
        face_count_display = "大勢"
    else:
        face_count_display = f"{face_count}人"

    if scores["is_similar"]:
        message_text = (
            f"📸 スコア: {scores['total_score']}点\n\n"
            f"⚠️ この写真は、以前の投稿と似ています。\n"
            f"連写ではなく、違う構図で撮影してみましょう！\n\n"
            f"😊 笑顔スコア: {scores['smile_score']}点（{face_count_display}）\n"
            f"🤖 AIテーマ評価: {scores['ai_score']}点"
        )
    else:
        message_text = (
            f"🎉 採点完了！\n\n"
            f"【最終スコア】{scores['total_score']}点\n\n"
            f"😊 笑顔スコア: {scores['smile_score']}点（{face_count_display}）\n"
            f"🤖 AIテーマ評価: {scores['ai_score']}点\n"
            f"💬 {scores['comment']}"
        )

    # Send message with retry logic
    message = TextMessage(text=message_text)
    _send_line_message_with_retry(line_user_id, message)


def send_error_to_line(user_id: str):
    """
    Send error message to LINE user.

    Args:
        user_id: LINE user ID (stored directly in image documents)
    """
    message = TextMessage(text="❌ スコアリング処理に失敗しました。\n\nもう一度お試しください。")
    _send_line_message_with_retry(user_id, message)
