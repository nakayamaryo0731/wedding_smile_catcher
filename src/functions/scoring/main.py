"""
Wedding Smile Catcher - Scoring Function (Dummy Implementation)
This is a simplified version for integration testing.
Returns dummy scores without calling Vision API or Vertex AI.
"""

import os
import logging
import random
from typing import Dict, Any

import functions_framework
from flask import Request, jsonify
from linebot import LineBotApi
from linebot.models import TextSendMessage
from linebot.exceptions import LineBotApiError
from google.cloud import firestore

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Firestore client
db = firestore.Client()

# Environment variables
LINE_CHANNEL_ACCESS_TOKEN = os.environ.get('LINE_CHANNEL_ACCESS_TOKEN')
GCP_PROJECT_ID = os.environ.get('GCP_PROJECT_ID', 'wedding-smile-catcher')

# Initialize LINE Bot API
line_bot_api = LineBotApi(LINE_CHANNEL_ACCESS_TOKEN)


@functions_framework.http
def scoring(request: Request):
    """
    Cloud Functions HTTP entrypoint for scoring.

    This is a dummy implementation that returns fixed scores
    for integration testing purposes.

    Args:
        request: Flask Request object

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
        # Generate dummy scores
        dummy_scores = generate_dummy_scores()

        # Update Firestore
        update_firestore(image_id, user_id, dummy_scores)

        # Send result to LINE
        send_result_to_line(user_id, dummy_scores)

        # Return success response
        return jsonify({
            'status': 'success',
            'image_id': image_id,
            'scores': dummy_scores
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


def generate_dummy_scores() -> Dict[str, Any]:
    """
    Generate dummy scores for testing.

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
            f"💬 {scores['comment']}\n\n"
            f"※ダミーデータによるテスト結果です"
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
