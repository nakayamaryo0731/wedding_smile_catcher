"""
Pytest configuration for integration tests.

Integration tests use Firestore Emulator and mock external APIs (Vision, Vertex AI).
"""

import os
import pytest
from google.cloud import firestore
from unittest.mock import Mock, patch


# Configure Firestore emulator
os.environ["FIRESTORE_EMULATOR_HOST"] = "localhost:8080"
os.environ["GCP_PROJECT_ID"] = "wedding-smile-catcher-test"
os.environ["STORAGE_BUCKET"] = "wedding-smile-images-test"
os.environ["GCP_LOCATION"] = "us-central1"

# Global patches that need to be active during module import
_patches = []


def pytest_configure(config):
    """
    Pytest hook called before test collection begins.
    Sets up mocks for Google Cloud clients at the earliest possible time.
    """
    # Mock google.auth.default
    auth_patch = patch("google.auth.default")
    mock_auth = auth_patch.start()
    mock_credentials = Mock()
    mock_credentials.token = "fake-token"
    mock_auth.return_value = (mock_credentials, "fake-project-id")
    _patches.append(auth_patch)

    # Mock Google Cloud client constructors
    logging_patch = patch("google.cloud.logging.Client")
    mock_logging = logging_patch.start()
    mock_logging.return_value = Mock()
    _patches.append(logging_patch)

    firestore_patch = patch("google.cloud.firestore.Client")
    mock_firestore = firestore_patch.start()
    mock_firestore.return_value = Mock()
    _patches.append(firestore_patch)

    storage_patch = patch("google.cloud.storage.Client")
    mock_storage = storage_patch.start()
    mock_storage.return_value = Mock()
    _patches.append(storage_patch)

    vision_patch = patch("google.cloud.vision.ImageAnnotatorClient")
    mock_vision = vision_patch.start()
    mock_vision.return_value = Mock()
    _patches.append(vision_patch)

    # Mock vertexai.init
    vertexai_patch = patch("vertexai.init")
    vertexai_patch.start()
    _patches.append(vertexai_patch)


def pytest_unconfigure(config):
    """
    Pytest hook called after all tests complete.
    Stops all patches.
    """
    for p in _patches:
        p.stop()
    _patches.clear()


@pytest.fixture(scope="session")
def firestore_client():
    """
    Create Firestore client connected to emulator.
    Requires Firestore emulator to be running: `firebase emulators:start --only firestore`
    """
    client = firestore.Client(project="wedding-smile-catcher-test")
    yield client
    # Cleanup: delete all collections after tests
    try:
        collections = client.collections()
        for collection in collections:
            for doc in collection.stream():
                doc.reference.delete()
    except Exception as e:
        print(f"Cleanup error: {e}")


@pytest.fixture(autouse=True)
def clean_firestore(firestore_client):
    """
    Clean Firestore before each test.
    """
    # Delete all documents from all collections
    for collection_name in ["users", "images", "events"]:
        collection_ref = firestore_client.collection(collection_name)
        for doc in collection_ref.stream():
            doc.reference.delete()

    yield

    # Cleanup after test (optional, since we clean before each test)


@pytest.fixture
def mock_storage_client():
    """
    Mock Google Cloud Storage client for integration tests.
    We don't need actual Storage operations for most integration tests.
    """
    with patch("google.cloud.storage.Client") as mock_client:
        mock_bucket = Mock()
        mock_blob = Mock()
        mock_blob.upload_from_string = Mock()
        mock_blob.download_as_bytes = Mock(return_value=b"fake_image_bytes")
        mock_bucket.blob = Mock(return_value=mock_blob)
        mock_client.return_value.bucket = Mock(return_value=mock_bucket)
        yield mock_client


@pytest.fixture
def mock_vision_client_integration():
    """
    Mock Vision API client for integration tests.
    """
    with patch("google.cloud.vision.ImageAnnotatorClient") as mock_client:
        mock_response = Mock()

        # Default: 2 happy faces
        face1 = Mock()
        face1.joy_likelihood = 5  # VERY_LIKELY = 95.0 points

        face2 = Mock()
        face2.joy_likelihood = 5  # VERY_LIKELY = 95.0 points

        mock_response.face_annotations = [face1, face2]
        mock_response.error.message = ""

        mock_instance = Mock()
        mock_instance.face_detection = Mock(return_value=mock_response)
        mock_client.return_value = mock_instance

        yield mock_client


@pytest.fixture
def mock_vertex_ai_integration():
    """
    Mock Vertex AI for integration tests.
    """
    with patch("vertexai.generative_models.GenerativeModel") as mock_model_class:
        mock_model = Mock()
        mock_response = Mock()
        mock_response.text = '{"score": 85, "comment": "素晴らしい笑顔です！結婚式の雰囲気にぴったりです。"}'
        mock_model.generate_content = Mock(return_value=mock_response)
        mock_model_class.return_value = mock_model

        yield mock_model_class
