"""
Wedding Smile Catcher - Scoring Function
Analyzes uploaded images using:
- Vision API for smile detection (face count + joy likelihood)
- Vertex AI (Gemini) for theme evaluation (0-100 score + comment)
Similarity detection (Average Hash) is still TODO.
"""

import os
import logging
import random
import json
from typing import Dict, Any

import functions_framework
from flask import Request, jsonify
from linebot import LineBotApi
from linebot.models import TextSendMessage
from linebot.exceptions import LineBotApiError
from google.cloud import firestore, storage, vision
import vertexai
from vertexai.generative_models import GenerativeModel, Part, Image

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Google Cloud clients
db = firestore.Client()
storage_client = storage.Client()
vision_client = vision.ImageAnnotatorClient()

# Environment variables
LINE_CHANNEL_ACCESS_TOKEN = os.environ.get('LINE_CHANNEL_ACCESS_TOKEN')
GCP_PROJECT_ID = os.environ.get('GCP_PROJECT_ID', 'wedding-smile-catcher')
GCP_REGION = os.environ.get('GCP_REGION', 'asia-northeast1')
STORAGE_BUCKET = os.environ.get('STORAGE_BUCKET', 'wedding-smile-images')

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
    # Parse request
    request_json = request.get_json(silent=True)

    if not request_json:
        return jsonify({'error': 'No JSON body provided'}), 400

    image_id = request_json.get('image_id')
    user_id = request_json.get('user_id')

    if not image_id or not user_id:
        return jsonify({'error': 'Missing image_id or user_id'}), 400

    logger.info(f"Scoring request: image_id={image_id}, user_id={user_id}")

    try:
        # Generate scores using Vision API
        scores = generate_scores_with_vision_api(image_id)

        # Update Firestore
        update_firestore(image_id, user_id, scores)

        # Send result to LINE
        send_result_to_line(user_id, scores)

        # Return success response
        return jsonify({
            'status': 'success',
            'image_id': image_id,
            'scores': scores
        }), 200

    except Exception as e:
        logger.error(f"Scoring failed: {str(e)}")

        # Try to send error message to user
        try:
            send_error_to_line(user_id)
        except Exception:
            pass

        return jsonify({
            'status': 'error',
            'error': str(e),
            'image_id': image_id
        }), 500


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

    Args:
        image_bytes: Image binary data

    Returns:
        Dictionary with smile_score and face_count
    """
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
            'smile_score': round(total_smile_score, 2),
            'face_count': face_count,
            'smiling_faces': smiling_faces
        }

    except Exception as e:
        logger.error(f"Vision API error: {str(e)}")
        raise


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


def evaluate_theme(image_bytes: bytes) -> Dict[str, Any]:
    """
    Evaluate image theme relevance using Vertex AI (Gemini).

    Args:
        image_bytes: Image binary data

    Returns:
        Dictionary with score (0-100) and comment
    """
    try:
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

        # Initialize Gemini model
        model = GenerativeModel("gemini-1.5-flash")

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
        if 'score' not in result or 'comment' not in result:
            raise ValueError("Invalid response format from Gemini")

        # Ensure score is an integer
        result['score'] = int(result['score'])

        logger.info(
            f"Theme evaluation complete: score={result['score']}, "
            f"comment={result['comment'][:50]}..."
        )

        return result

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini response as JSON: {str(e)}")
        logger.error(f"Response text: {response.text}")
        # Return fallback score
        return {
            'score': 50,
            'comment': 'AI評価の解析に失敗しました。デフォルトスコアを適用しています。'
        }
    except Exception as e:
        logger.error(f"Gemini API error: {str(e)}")
        # Return fallback score
        return {
            'score': 50,
            'comment': 'AI評価中にエラーが発生しました。デフォルトスコアを適用しています。'
        }


def generate_scores_with_vision_api(image_id: str) -> Dict[str, Any]:
    """
    Generate scores using Vision API for smile detection and Vertex AI for theme evaluation.
    Similarity detection is still a dummy value.

    Args:
        image_id: Image document ID in Firestore

    Returns:
        Dictionary with scoring data
    """
    # Get image document from Firestore
    image_ref = db.collection('images').document(image_id)
    image_doc = image_ref.get()

    if not image_doc.exists:
        raise Exception(f"Image document not found: {image_id}")

    image_data = image_doc.to_dict()
    storage_path = image_data.get('storage_path')

    if not storage_path:
        raise Exception(f"Storage path not found in image document: {image_id}")

    # Download image from Cloud Storage
    image_bytes = download_image_from_storage(storage_path)

    # Calculate smile score using Vision API
    vision_result = calculate_smile_score(image_bytes)
    smile_score = vision_result['smile_score']
    face_count = vision_result['face_count']

    # Evaluate theme using Vertex AI (Gemini)
    theme_result = evaluate_theme(image_bytes)
    ai_score = theme_result['score']
    ai_comment = theme_result['comment']

    # TODO: Implement Average Hash similarity detection (currently dummy)
    is_similar = False
    average_hash = 'dummy_hash_' + str(random.randint(1000, 9999))

    # Calculate penalty
    penalty = 0.33 if is_similar else 1.0

    # Calculate total score
    total_score = round((smile_score * ai_score / 100) * penalty, 2)

    comment = (
        f"{ai_comment}\n\n"
        f"笑顔検出: {vision_result['smiling_faces']}人/{face_count}人が笑顔です！"
    )

    return {
        'smile_score': smile_score,
        'ai_score': ai_score,
        'total_score': total_score,
        'comment': comment,
        'face_count': face_count,
        'is_similar': is_similar,
        'average_hash': average_hash
    }


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
        'smile_score': smile_score,
        'ai_score': ai_score,
        'total_score': total_score,
        'comment': 'これはダミーのスコアリング結果です。実装完了後は実際のAI評価に置き換わります。',
        'face_count': face_count,
        'is_similar': is_similar,
        'average_hash': 'dummy_hash_' + str(random.randint(1000, 9999))
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
    image_ref = db.collection('images').document(image_id)
    image_ref.update({
        'smile_score': scores['smile_score'],
        'ai_score': scores['ai_score'],
        'total_score': scores['total_score'],
        'comment': scores['comment'],
        'average_hash': scores['average_hash'],
        'is_similar': scores['is_similar'],
        'face_count': scores['face_count'],
        'status': 'completed',
        'scored_at': firestore.SERVER_TIMESTAMP
    })

    logger.info(f"Updated image document: {image_id}")

    # Update user statistics
    user_ref = db.collection('users').document(user_id)
    user_doc = user_ref.get()

    if user_doc.exists:
        current_best = user_doc.to_dict().get('best_score', 0)
        new_best = max(current_best, scores['total_score'])

        user_ref.update({
            'total_uploads': firestore.Increment(1),
            'best_score': new_best
        })

        logger.info(f"Updated user stats: {user_id}")


def send_result_to_line(user_id: str, scores: Dict[str, Any]):
    """
    Send scoring result to LINE user.

    Args:
        user_id: User ID (Firestore document ID, not LINE user ID)
        scores: Scoring results
    """
    # Get user's LINE user ID
    user_ref = db.collection('users').document(user_id)
    user_doc = user_ref.get()

    if not user_doc.exists:
        logger.error(f"User not found: {user_id}")
        return

    user_data = user_doc.to_dict()
    line_user_id = user_data.get('line_user_id')

    if not line_user_id:
        logger.error(f"LINE user ID not found for user: {user_id}")
        return

    # Build message
    if scores['is_similar']:
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
    user_ref = db.collection('users').document(user_id)
    user_doc = user_ref.get()

    if not user_doc.exists:
        return

    user_data = user_doc.to_dict()
    line_user_id = user_data.get('line_user_id')

    if not line_user_id:
        return

    try:
        message = TextSendMessage(
            text='❌ スコアリング処理に失敗しました。\n\nもう一度お試しください。'
        )
        line_bot_api.push_message(line_user_id, message)
        logger.info(f"Sent error message to LINE user: {line_user_id}")

    except Exception as e:
        logger.error(f"Failed to send error message: {str(e)}")
