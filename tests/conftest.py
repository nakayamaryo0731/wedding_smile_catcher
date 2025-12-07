"""
Pytest configuration and shared fixtures for Wedding Smile Catcher tests.
"""

import os
from pathlib import Path
from typing import Any
from unittest.mock import Mock

import pytest

# Set environment variables at module level (before any imports)
os.environ["GCP_PROJECT_ID"] = "wedding-smile-catcher-test"
os.environ["STORAGE_BUCKET"] = "wedding-smile-images-test"
os.environ["LINE_CHANNEL_SECRET"] = "test_channel_secret"
os.environ["LINE_CHANNEL_ACCESS_TOKEN"] = "test_access_token"

# Don't set GOOGLE_APPLICATION_CREDENTIALS to avoid auth errors during module import
# GCP clients will be mocked in tests anyway
if "GOOGLE_APPLICATION_CREDENTIALS" in os.environ:
    del os.environ["GOOGLE_APPLICATION_CREDENTIALS"]


# Test data directory
TEST_DATA_DIR = Path(__file__).parent / "test_data"


@pytest.fixture
def test_image_bytes() -> bytes:
    """
    Load a test image as bytes.
    Falls back to a minimal JPEG if no test image exists.
    """
    test_image_path = TEST_DATA_DIR / "happy_couple.jpg"

    if test_image_path.exists():
        with open(test_image_path, "rb") as f:
            return f.read()

    # Minimal 1x1 JPEG for testing when no real image exists
    # This is a valid JPEG file (1x1 red pixel)
    minimal_jpeg = (
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
        b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c"
        b"\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c"
        b"\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xff\xc0\x00\x0b\x08\x00"
        b"\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01"
        b"\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05"
        b"\x06\x07\x08\t\n\x0b\xff\xc4\x00\xb5\x10\x00\x02\x01\x03\x03\x02\x04"
        b"\x03\x05\x05\x04\x04\x00\x00\x01}\x01\x02\x03\x00\x04\x11\x05\x12!1A"
        b'\x06\x13Qa\x07"q\x142\x81\x91\xa1\x08#B\xb1\xc1\x15R\xd1\xf0$3br\x82'
        b"\t\n\x16\x17\x18\x19\x1a%&'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz"
        b"\x83\x84\x85\x86\x87\x88\x89\x8a\x92\x93\x94\x95\x96\x97\x98\x99\x9a"
        b"\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xb2\xb3\xb4\xb5\xb6\xb7\xb8\xb9"
        b"\xba\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xd2\xd3\xd4\xd5\xd6\xd7\xd8"
        b"\xd9\xda\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xf1\xf2\xf3\xf4\xf5"
        b"\xf6\xf7\xf8\xf9\xfa\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xfe\x0f\xff"
        b"\xd9"
    )
    return minimal_jpeg


@pytest.fixture
def mock_vision_response_happy() -> Mock:
    """
    Mock Vision API response for happy faces.
    Returns a response with 2 very likely smiling faces.
    """
    mock_response = Mock()

    # Create mock face annotations
    face1 = Mock()
    face1.joy_likelihood = 5  # VERY_LIKELY

    face2 = Mock()
    face2.joy_likelihood = 5  # VERY_LIKELY

    mock_response.face_annotations = [face1, face2]
    mock_response.error.message = ""

    return mock_response


@pytest.fixture
def mock_vision_response_no_faces() -> Mock:
    """
    Mock Vision API response with no faces detected.
    """
    mock_response = Mock()
    mock_response.face_annotations = []
    mock_response.error.message = ""

    return mock_response


@pytest.fixture
def mock_vertex_response_high_score() -> Mock:
    """
    Mock Vertex AI response with high score.
    """
    mock_response = Mock()
    mock_response.text = '{"score": 85, "comment": "素晴らしい笑顔です！結婚式の雰囲気にぴったりです。"}'

    return mock_response


@pytest.fixture
def mock_vertex_response_low_score() -> Mock:
    """
    Mock Vertex AI response with low score (off-theme).
    """
    mock_response = Mock()
    mock_response.text = '{"score": 25, "comment": "風景写真のようですね。"}'

    return mock_response


@pytest.fixture
def sample_user_data() -> dict[str, Any]:
    """
    Sample user data for testing.
    """
    return {
        "line_user_id": "test_user_001",
        "name": "テスト太郎",
        "created_at": "2025-01-22T10:00:00Z",
        "total_uploads": 0,
        "best_score": 0,
    }


@pytest.fixture
def sample_image_data() -> dict[str, Any]:
    """
    Sample image data for testing.
    """
    return {
        "user_id": "test_user_001",
        "storage_path": "original/test_user_001/20250122_100000_test.jpg",
        "upload_timestamp": "2025-01-22T10:00:00Z",
        "status": "pending",
        "smile_score": 0,
        "ai_score": 0,
        "total_score": 0,
    }


@pytest.fixture
def sample_scored_image_data() -> dict[str, Any]:
    """
    Sample image data with scores calculated.
    """
    return {
        "user_id": "test_user_001",
        "storage_path": "original/test_user_001/20250122_100000_test.jpg",
        "upload_timestamp": "2025-01-22T10:00:00Z",
        "status": "completed",
        "smile_score": 190.0,  # 2 faces × 95.0
        "ai_score": 85,
        "total_score": 161.5,  # 190.0 × 85 / 100
        "comment": "素晴らしい笑顔です！",
        "face_count": 2,
        "smiling_faces": 2,
        "average_hash": "abcd1234efgh5678",
    }


@pytest.fixture(autouse=True)
def setup_test_env(monkeypatch):
    """
    Automatically set up test environment variables for all tests.
    """
    # Set test environment variables
    monkeypatch.setenv("GCP_PROJECT_ID", "wedding-smile-catcher-test")
    monkeypatch.setenv("STORAGE_BUCKET", "wedding-smile-images-test")
    monkeypatch.setenv("LINE_CHANNEL_SECRET", "test_channel_secret")
    monkeypatch.setenv("LINE_CHANNEL_ACCESS_TOKEN", "test_access_token")

    # Prevent accidental calls to real APIs
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", "/tmp/fake_credentials.json")
