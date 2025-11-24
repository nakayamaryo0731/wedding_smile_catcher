"""
Wedding Smile Catcher - Scoring Function
Analyzes uploaded images using:
- Vision API for smile detection (face count + joy likelihood)
- Vertex AI (Gemini) for theme evaluation (0-100 score + comment)
- Average Hash for similarity detection (prevents spam uploads)
"""

import os
import logging
import random
import json
import time
import io
from typing import Dict, Any, List
import uuid
from concurrent.futures import ThreadPoolExecutor

import functions_framework
from flask import Request, jsonify
from linebot import LineBotApi
from linebot.models import TextSendMessage
from linebot.exceptions import LineBotApiError
from google.cloud import firestore, storage, vision
from google.cloud import logging as cloud_logging
import vertexai
from vertexai.generative_models import GenerativeModel, Part
from PIL import Image as PILImage
import imagehash

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
CURRENT_EVENT_ID = os.environ.get("CURRENT_EVENT_ID", "test")

# Initialize LINE Bot API
line_bot_api = LineBotApi(LINE_CHANNEL_ACCESS_TOKEN)

# Initialize Vertex AI
vertexai.init(project=GCP_PROJECT_ID, location=GCP_REGION)


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


def get_joy_likelihood_score(joy_likelihood) -> float:
    """
    Convert joy likelihood enum to numeric score.

    Args:
        joy_likelihood: Vision API joy likelihood enum

    Returns:
        Numeric score (0-95)
    """
    likelihood_map = {
        vision.Likelihood.VERY_LIKELY: 95.0,
        vision.Likelihood.LIKELY: 75.0,
        vision.Likelihood.POSSIBLE: 50.0,
        vision.Likelihood.UNLIKELY: 25.0,
        vision.Likelihood.VERY_UNLIKELY: 5.0,
        vision.Likelihood.UNKNOWN: 0.0,
    }
    return likelihood_map.get(joy_likelihood, 0.0)


def calculate_smile_score(image_bytes: bytes) -> Dict[str, Any]:
    """
    Calculate smile score using Vision API.
    Implements exponential backoff retry for rate limit and server errors.

    Args:
        image_bytes: Image binary data

    Returns:
        Dictionary with smile_score and face_count
    """
    # Retry configuration
    max_retries = 3
    base_delay = 1.0  # seconds
    max_delay = 10.0  # seconds

    for attempt in range(max_retries):
        try:
            # Create Vision API image object
            image = vision.Image(content=image_bytes)

            # Detect faces
            response = vision_client.face_detection(image=image)

            if response.error.message:
                raise Exception(f"Vision API error: {response.error.message}")

            # Calculate total smile score
            total_smile_score = 0.0
            smiling_faces = 0

            for face in response.face_annotations:
                # Only count faces with LIKELY or VERY_LIKELY joy
                if face.joy_likelihood >= vision.Likelihood.LIKELY:
                    score = get_joy_likelihood_score(face.joy_likelihood)
                    total_smile_score += score
                    smiling_faces += 1
                    logger.info(
                        f"Face detected: joy={face.joy_likelihood.name}, score={score}"
                    )

            face_count = len(response.face_annotations)

            logger.info(
                f"Smile detection complete: {smiling_faces}/{face_count} smiling faces, "
                f"total score={total_smile_score}"
            )

            return {
                "smile_score": round(total_smile_score, 2),
                "face_count": face_count,
                "smiling_faces": smiling_faces,
            }

        except Exception as e:
            error_message = str(e)
            logger.warning(
                f"Vision API error (attempt {attempt + 1}/{max_retries}): {error_message}"
            )

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
    return {
        "smile_score": 300.0,
        "face_count": 3,
        "smiling_faces": 3,
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


def is_similar_image(
    new_hash: str, existing_hashes: List[str], threshold: int = 8
) -> bool:
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

        for existing_hash in existing_hashes:
            # Skip error hashes
            if existing_hash.startswith("error_"):
                continue

            try:
                existing_hash_obj = imagehash.hex_to_hash(existing_hash)
                hamming_distance = new_hash_obj - existing_hash_obj

                logger.info(
                    f"Comparing hashes: new={new_hash}, existing={existing_hash}, "
                    f"distance={hamming_distance}"
                )

                if hamming_distance <= threshold:
                    logger.warning(
                        f"Similar image detected! Distance={hamming_distance} <= {threshold}"
                    )
                    return True

            except Exception as e:
                logger.error(f"Error comparing hash {existing_hash}: {str(e)}")
                continue

        logger.info(f"No similar images found (checked {len(existing_hashes)} hashes)")
        return False

    except Exception as e:
        logger.error(f"Error in similarity check: {str(e)}")
        # On error, assume not similar to avoid blocking uploads
        return False


def get_existing_hashes_for_user(user_id: str) -> List[str]:
    """
    Get all existing average hashes for a user's uploaded images in the current event.

    Args:
        user_id: User ID

    Returns:
        List of average hash strings
    """
    try:
        # Query images collection for this user in current event with status 'completed'
        images_query = (
            db.collection("images")
            .where("event_id", "==", CURRENT_EVENT_ID)
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


def evaluate_theme(image_bytes: bytes) -> Dict[str, Any]:
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
- 新郎新婦を中心に、写真に写っている全ての人物の表情を評価
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

## 出力
JSON形式でscoreとcommentのキーで返却する。JSONのみを出力すること。

例:
{
  "score": 85,
  "comment": "新郎新婦の目元から溢れる自然な喜びが印象的で、周囲の参列者との一体感も素晴らしい"
}
"""

    # Retry configuration
    max_retries = 3
    base_delay = 1.0  # seconds
    max_delay = 10.0  # seconds

    for attempt in range(max_retries):
        try:
            # Initialize Gemini model (using latest Flash model)
            model = GenerativeModel("gemini-2.5-flash")

            # Create image part from bytes
            image_part = Part.from_data(image_bytes, mime_type="image/jpeg")

            # Generate content
            response = model.generate_content([image_part, prompt])

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

            logger.info(
                f"Theme evaluation complete: score={result['score']}, "
                f"comment={result['comment'][:50]}..."
            )

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
            logger.warning(
                f"Gemini API error (attempt {attempt + 1}/{max_retries}): {error_message}"
            )

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


def generate_scores_with_vision_api(image_id: str, request_id: str) -> Dict[str, Any]:
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

    if not storage_path:
        raise Exception(f"Storage path not found in image document: {image_id}")

    if not user_id:
        raise Exception(f"User ID not found in image document: {image_id}")

    log_context["user_id"] = user_id

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

    # Get existing hashes for this user
    existing_hashes = get_existing_hashes_for_user(user_id)

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
        error_warnings.append(
            "⚠️ 笑顔検出でエラーが発生しました。推定値を使用しています。"
        )
    if ai_error:
        logger.warning(f"Vertex AI error occurred: {ai_error}")
        error_warnings.append(
            "⚠️ AI評価でエラーが発生しました。デフォルト値を使用しています。"
        )

    if error_warnings:
        warning_text = "\n".join(error_warnings)
        comment = (
            f"{warning_text}\n\n"
            f"{ai_comment}\n\n"
            f"笑顔検出: {vision_result.get('smiling_faces', face_count)}人/{face_count}人が笑顔です！"
        )
    else:
        comment = (
            f"{ai_comment}\n\n"
            f"笑顔検出: {vision_result['smiling_faces']}人/{face_count}人が笑顔です！"
        )

    result = {
        "smile_score": smile_score,
        "ai_score": ai_score,
        "total_score": total_score,
        "comment": comment,
        "face_count": face_count,
        "is_similar": is_similar,
        "average_hash": average_hash,
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


def generate_dummy_scores() -> Dict[str, Any]:
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


def update_firestore(image_id: str, user_id: str, scores: Dict[str, Any]):
    """
    Update Firestore with scoring results.

    Args:
        image_id: Image document ID
        user_id: User ID
        scores: Scoring results
    """
    # Update image document
    image_ref = db.collection("images").document(image_id)
    image_ref.update(
        {
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
    )

    logger.info(f"Updated image document: {image_id}")

    # Update user statistics
    user_ref = db.collection("users").document(user_id)
    user_doc = user_ref.get()

    if user_doc.exists:
        current_best = user_doc.to_dict().get("best_score", 0)
        new_best = max(current_best, scores["total_score"])

        user_ref.update(
            {"total_uploads": firestore.Increment(1), "best_score": new_best}
        )

        logger.info(f"Updated user stats: {user_id}")


def send_result_to_line(user_id: str, scores: Dict[str, Any]):
    """
    Send scoring result to LINE user.

    Args:
        user_id: User ID (Firestore document ID, not LINE user ID)
        scores: Scoring results
    """
    # Get user's LINE user ID
    user_ref = db.collection("users").document(user_id)
    user_doc = user_ref.get()

    if not user_doc.exists:
        logger.error(f"User not found: {user_id}")
        return

    user_data = user_doc.to_dict()
    line_user_id = user_data.get("line_user_id")

    if not line_user_id:
        logger.error(f"LINE user ID not found for user: {user_id}")
        return

    # Build message
    if scores["is_similar"]:
        message_text = (
            f"📸 スコア: {scores['total_score']}点\n\n"
            f"⚠️ この写真は、以前の投稿と似ています。\n"
            f"連写ではなく、違う構図で撮影してみましょう！\n\n"
            f"😊 笑顔スコア: {scores['smile_score']}点（{scores['face_count']}人）\n"
            f"🤖 AIテーマ評価: {scores['ai_score']}点"
        )
    else:
        message_text = (
            f"🎉 採点完了！\n\n"
            f"【最終スコア】{scores['total_score']}点\n\n"
            f"😊 笑顔スコア: {scores['smile_score']}点（{scores['face_count']}人）\n"
            f"🤖 AIテーマ評価: {scores['ai_score']}点\n"
            f"💬 {scores['comment']}"
        )

    try:
        message = TextSendMessage(text=message_text)
        line_bot_api.push_message(line_user_id, message)
        logger.info(f"Sent result to LINE user: {line_user_id}")

    except LineBotApiError as e:
        logger.error(f"LINE API error: {e.status_code} {e.message}")
    except Exception as e:
        logger.error(f"Failed to send message: {str(e)}")


def send_error_to_line(user_id: str):
    """
    Send error message to LINE user.

    Args:
        user_id: User ID
    """
    # Get user's LINE user ID
    user_ref = db.collection("users").document(user_id)
    user_doc = user_ref.get()

    if not user_doc.exists:
        return

    user_data = user_doc.to_dict()
    line_user_id = user_data.get("line_user_id")

    if not line_user_id:
        return

    try:
        message = TextSendMessage(
            text="❌ スコアリング処理に失敗しました。\n\nもう一度お試しください。"
        )
        line_bot_api.push_message(line_user_id, message)
        logger.info(f"Sent error message to LINE user: {line_user_id}")

    except Exception as e:
        logger.error(f"Failed to send error message: {str(e)}")
