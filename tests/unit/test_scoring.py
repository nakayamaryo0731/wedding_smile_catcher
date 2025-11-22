"""
Unit tests for scoring functions (src/functions/scoring/main.py).
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from google.cloud import vision


# Import functions from scoring module
# Adjust import path based on your project structure
import sys
from pathlib import Path

# Add src directory to path
src_path = Path(__file__).parent.parent.parent / "src" / "functions" / "scoring"
sys.path.insert(0, str(src_path.parent))

from scoring.main import (
    calculate_smile_score,
    evaluate_theme,
    calculate_average_hash,
    is_similar_image,
    generate_scores_with_vision_api
)


class TestCalculateSmileScore:
    """Tests for calculate_smile_score function."""

    @patch('scoring.main.vision_client')
    def test_calculate_smile_score_two_happy_faces(self, mock_vision_client):
        """Test with 2 very likely smiling faces (expected score: ~190)."""
        # Setup mock
        mock_response = Mock()

        face1 = Mock()
        face1.joy_likelihood = vision.Likelihood.VERY_LIKELY  # 5 → 95.0 points

        face2 = Mock()
        face2.joy_likelihood = vision.Likelihood.VERY_LIKELY  # 5 → 95.0 points

        mock_response.face_annotations = [face1, face2]
        mock_response.error.message = ""

        mock_vision_client.face_detection.return_value = mock_response

        # Test
        result = calculate_smile_score(b"fake_image_bytes")

        # Assert
        assert result['face_count'] == 2
        assert result['smiling_faces'] == 2
        assert result['smile_score'] == 190.0  # 95.0 × 2
        assert 'error' not in result

    @patch('scoring.main.vision_client')
    def test_calculate_smile_score_no_smiles(self, mock_vision_client):
        """Test with no smiling faces (expected score: 0)."""
        # Setup mock
        mock_response = Mock()

        face1 = Mock()
        face1.joy_likelihood = vision.Likelihood.UNLIKELY  # 2 → 0 points

        face2 = Mock()
        face2.joy_likelihood = vision.Likelihood.VERY_UNLIKELY  # 1 → 0 points

        mock_response.face_annotations = [face1, face2]
        mock_response.error.message = ""

        mock_vision_client.face_detection.return_value = mock_response

        # Test
        result = calculate_smile_score(b"fake_image_bytes")

        # Assert
        assert result['face_count'] == 2
        assert result['smiling_faces'] == 0
        assert result['smile_score'] == 0.0

    @patch('scoring.main.vision_client')
    def test_calculate_smile_score_no_faces(self, mock_vision_client):
        """Test with no faces detected (expected score: 0)."""
        # Setup mock
        mock_response = Mock()
        mock_response.face_annotations = []
        mock_response.error.message = ""

        mock_vision_client.face_detection.return_value = mock_response

        # Test
        result = calculate_smile_score(b"fake_image_bytes")

        # Assert
        assert result['face_count'] == 0
        assert result['smiling_faces'] == 0
        assert result['smile_score'] == 0.0

    @patch('scoring.main.vision_client')
    def test_calculate_smile_score_api_error_fallback(self, mock_vision_client):
        """Test Vision API error triggers fallback score."""
        # Setup mock to raise exception
        mock_vision_client.face_detection.side_effect = Exception("API Error")

        # Test
        result = calculate_smile_score(b"fake_image_bytes")

        # Assert fallback values
        assert result['smile_score'] == 300.0  # Fallback
        assert result['face_count'] == 3
        assert result['smiling_faces'] == 3
        assert result['error'] == 'vision_api_failed'


class TestEvaluateTheme:
    """Tests for evaluate_theme function."""

    @patch('scoring.main.GenerativeModel')
    def test_evaluate_theme_high_score(self, mock_model):
        """Test with high score evaluation (on-theme image)."""
        # Setup mock
        mock_response = Mock()
        mock_response.text = '{"score": 85, "comment": "素晴らしい笑顔です！結婚式の雰囲気にぴったりです。"}'

        mock_model.return_value.generate_content.return_value = mock_response

        # Test
        result = evaluate_theme(b"fake_image_bytes")

        # Assert
        assert result['score'] == 85
        assert '素晴らしい' in result['comment']
        assert 'error' not in result

    @patch('scoring.main.GenerativeModel')
    def test_evaluate_theme_low_score(self, mock_model):
        """Test with low score evaluation (off-theme image)."""
        # Setup mock
        mock_response = Mock()
        mock_response.text = '{"score": 20, "comment": "風景写真のようですね。"}'

        mock_model.return_value.generate_content.return_value = mock_response

        # Test
        result = evaluate_theme(b"fake_image_bytes")

        # Assert
        assert result['score'] == 20
        assert '風景' in result['comment']

    @patch('scoring.main.GenerativeModel')
    def test_evaluate_theme_json_parse_error(self, mock_model):
        """Test JSON parse error triggers fallback."""
        # Setup mock with invalid JSON
        mock_response = Mock()
        mock_response.text = 'This is not JSON'

        mock_model.return_value.generate_content.return_value = mock_response

        # Test
        result = evaluate_theme(b"fake_image_bytes")

        # Assert fallback values
        assert result['score'] == 50  # Fallback
        assert '解析' in result['comment'] or 'エラー' in result['comment']
        assert result['error'] == 'vertex_ai_parse_failed'

    @patch('scoring.main.GenerativeModel')
    def test_evaluate_theme_api_error(self, mock_model):
        """Test Vertex AI error triggers fallback."""
        # Setup mock to raise exception
        mock_model.return_value.generate_content.side_effect = Exception("API Error")

        # Test
        result = evaluate_theme(b"fake_image_bytes")

        # Assert fallback values
        assert result['score'] == 50  # Fallback
        assert 'error' in result


class TestCalculateAverageHash:
    """Tests for calculate_average_hash function."""

    def test_calculate_average_hash_valid_image(self, test_image_bytes):
        """Test average hash calculation with valid image."""
        # Test
        hash_value = calculate_average_hash(test_image_bytes)

        # Assert
        assert isinstance(hash_value, str)
        assert len(hash_value) == 16
        assert hash_value.replace('_', '').replace('error', '').isalnum() or hash_value.startswith('error_')

    def test_calculate_average_hash_same_image_same_hash(self, test_image_bytes):
        """Test that same image produces same hash (reproducibility)."""
        # Test
        hash1 = calculate_average_hash(test_image_bytes)
        hash2 = calculate_average_hash(test_image_bytes)

        # Assert
        assert hash1 == hash2

    def test_calculate_average_hash_invalid_image(self):
        """Test with invalid image data."""
        # Test with invalid bytes
        invalid_bytes = b"not an image"

        # Test
        hash_value = calculate_average_hash(invalid_bytes)

        # Assert (should return error hash or handle gracefully)
        assert isinstance(hash_value, str)
        # Implementation may return error hash like "error_XXXX"


class TestIsSimilarImage:
    """Tests for is_similar_image function."""

    def test_is_similar_image_exact_match(self):
        """Test with exact matching hash (Hamming distance = 0)."""
        # Use valid 16-character hex strings (8x8 hash = 64 bits = 16 hex chars)
        new_hash = "0123456789abcdef"
        existing_hashes = ["0123456789abcdef"]

        # Test
        result = is_similar_image(new_hash, existing_hashes, threshold=8)

        # Assert
        assert result is True

    def test_is_similar_image_close_match(self):
        """Test with close match (Hamming distance < threshold)."""
        # Hashes differ by 1 bit (last character f vs e = 1111 vs 1110)
        new_hash = "0123456789abcdef"
        existing_hashes = ["0123456789abcdee"]  # Distance = 1

        # Test
        result = is_similar_image(new_hash, existing_hashes, threshold=8)

        # Assert
        assert result is True

    def test_is_similar_image_not_similar(self):
        """Test with non-similar hash (Hamming distance > threshold)."""
        new_hash = "0123456789abcdef"
        existing_hashes = ["0000000000000000"]  # Distance > 8

        # Test
        result = is_similar_image(new_hash, existing_hashes, threshold=8)

        # Assert
        assert result is False

    def test_is_similar_image_multiple_hashes(self):
        """Test with multiple existing hashes."""
        new_hash = "0123456789abcdef"
        existing_hashes = [
            "0000000000000000",  # Not similar
            "0123456789abcdee",  # Distance = 1 (similar)
            "ffffffffffffffff"   # Not similar
        ]

        # Test (should match the second hash)
        result = is_similar_image(new_hash, existing_hashes, threshold=8)

        # Assert
        assert result is True

    def test_is_similar_image_error_hash(self):
        """Test with error hash (should skip)."""
        new_hash = "error_1234"
        existing_hashes = ["0123456789abcdef"]

        # Test (error hashes should be skipped)
        result = is_similar_image(new_hash, existing_hashes, threshold=8)

        # Assert
        assert result is False


class TestGenerateScoresWithVisionAPI:
    """Tests for generate_scores_with_vision_api integration function."""

    @patch('scoring.main.download_image_from_storage')
    @patch('scoring.main.get_existing_hashes_for_user')
    @patch('scoring.main.calculate_average_hash')
    @patch('scoring.main.evaluate_theme')
    @patch('scoring.main.calculate_smile_score')
    @patch('scoring.main.db')
    def test_generate_scores_normal_flow(
        self,
        mock_db,
        mock_calc_smile,
        mock_eval_theme,
        mock_calc_hash,
        mock_get_hashes,
        mock_download
    ):
        """Test normal flow with all APIs succeeding."""
        # Setup mocks
        mock_download.return_value = b"fake_image"
        mock_calc_smile.return_value = {
            'smile_score': 450.0,
            'face_count': 5,
            'smiling_faces': 5
        }
        mock_eval_theme.return_value = {
            'score': 80,
            'comment': 'Great!'
        }
        mock_calc_hash.return_value = "0123456789abcdef"
        mock_get_hashes.return_value = []  # No similar images

        # Mock Firestore - need to mock get() to return image data
        mock_image_doc = Mock()
        mock_image_doc.exists = True
        mock_image_doc.to_dict.return_value = {
            'storage_path': 'test/path.jpg',
            'user_id': 'test_user_001'
        }
        mock_image_ref = Mock()
        mock_image_ref.get.return_value = mock_image_doc
        mock_db.collection.return_value.document.return_value = mock_image_ref

        # Test
        result = generate_scores_with_vision_api("img_001", "req_001")

        # Assert returned values (Firestore update happens in separate update_firestore() function)
        assert result['smile_score'] == 450.0
        assert result['ai_score'] == 80
        assert result['total_score'] == 360.0  # 450 × 80 / 100
        assert 'has_errors' not in result
        assert result['average_hash'] == "0123456789abcdef"
        assert result['is_similar'] is False

    @patch('scoring.main.download_image_from_storage')
    @patch('scoring.main.get_existing_hashes_for_user')
    @patch('scoring.main.calculate_average_hash')
    @patch('scoring.main.evaluate_theme')
    @patch('scoring.main.calculate_smile_score')
    @patch('scoring.main.db')
    def test_generate_scores_with_similar_image_penalty(
        self,
        mock_db,
        mock_calc_smile,
        mock_eval_theme,
        mock_calc_hash,
        mock_get_hashes,
        mock_download
    ):
        """Test with similar image penalty applied."""
        # Setup mocks
        mock_download.return_value = b"fake_image"
        mock_calc_smile.return_value = {'smile_score': 450.0, 'face_count': 5, 'smiling_faces': 5}
        mock_eval_theme.return_value = {'score': 80, 'comment': 'Great!'}
        mock_calc_hash.return_value = "abc123"
        mock_get_hashes.return_value = ["abc124"]  # Similar hash exists

        # Mock is_similar_image to return True
        with patch('scoring.main.is_similar_image', return_value=True):
            # Mock Firestore
            mock_image_ref = Mock()
            mock_db.collection.return_value.document.return_value = mock_image_ref

            # Test
            result = generate_scores_with_vision_api("img_001", "req_001")

            # Assert (penalty applied: × 0.33)
            expected_penalty_score = 360.0 * 0.33  # ~118.8
            assert abs(result['total_score'] - expected_penalty_score) < 1

    @patch('scoring.main.download_image_from_storage')
    @patch('scoring.main.get_existing_hashes_for_user')
    @patch('scoring.main.calculate_average_hash')
    @patch('scoring.main.evaluate_theme')
    @patch('scoring.main.calculate_smile_score')
    @patch('scoring.main.db')
    def test_generate_scores_with_vision_error(
        self,
        mock_db,
        mock_calc_smile,
        mock_eval_theme,
        mock_calc_hash,
        mock_get_hashes,
        mock_download
    ):
        """Test with Vision API error (should use fallback)."""
        # Setup mocks
        mock_download.return_value = b"fake_image"
        mock_calc_smile.return_value = {
            'smile_score': 300.0,  # Fallback
            'face_count': 3,
            'smiling_faces': 3,
            'error': 'vision_api_failed'
        }
        mock_eval_theme.return_value = {'score': 80, 'comment': 'Great!'}
        mock_calc_hash.return_value = "abc123"
        mock_get_hashes.return_value = []

        # Mock Firestore
        mock_image_ref = Mock()
        mock_db.collection.return_value.document.return_value = mock_image_ref

        # Test
        result = generate_scores_with_vision_api("img_001", "req_001")

        # Assert
        assert result['smile_score'] == 300.0  # Fallback score
        assert 'error' in result or 'has_errors' in result
