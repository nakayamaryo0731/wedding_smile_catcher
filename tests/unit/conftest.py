"""
Pytest configuration and fixtures for unit tests.

This module sets up mocks for Google Cloud clients to avoid authentication
errors during test collection and execution.
"""

import pytest
from unittest.mock import Mock, patch
import os

# Set environment variables before any Google Cloud imports
os.environ["GCP_PROJECT_ID"] = "wedding-smile-catcher-test"
os.environ["STORAGE_BUCKET"] = "wedding-smile-images-test"
os.environ["GCP_LOCATION"] = "us-central1"


@pytest.fixture(scope="session", autouse=True)
def mock_google_auth():
    """
    Mock Google Cloud authentication for the entire test session.
    This prevents DefaultCredentialsError during module imports.
    """
    with patch("google.auth.default") as mock_default:
        mock_credentials = Mock()
        mock_credentials.token = "fake-token"
        mock_default.return_value = (mock_credentials, "fake-project-id")
        yield mock_default


@pytest.fixture(scope="session", autouse=True)
def mock_google_cloud_clients():
    """
    Mock Google Cloud client constructors to avoid authentication errors
    during module imports.
    """
    with patch("google.cloud.logging.Client") as mock_logging, \
         patch("google.cloud.firestore.Client") as mock_firestore, \
         patch("google.cloud.storage.Client") as mock_storage, \
         patch("google.cloud.vision.ImageAnnotatorClient") as mock_vision:

        # Create mock instances
        mock_logging.return_value = Mock()
        mock_firestore.return_value = Mock()
        mock_storage.return_value = Mock()
        mock_vision.return_value = Mock()

        yield {
            "logging": mock_logging,
            "firestore": mock_firestore,
            "storage": mock_storage,
            "vision": mock_vision,
        }


@pytest.fixture(scope="session", autouse=True)
def mock_vertexai():
    """Mock Vertex AI initialization."""
    with patch("vertexai.init") as mock_init:
        yield mock_init
