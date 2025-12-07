"""
Pytest configuration and fixtures for unit tests.

This module sets up mocks for Google Cloud clients to avoid authentication
errors during test collection and execution.
"""

import os
from unittest.mock import Mock, patch

# Set environment variables before any Google Cloud imports
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
