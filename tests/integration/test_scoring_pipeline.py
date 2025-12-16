"""
Integration tests for the scoring pipeline.

Tests the complete flow:
1. Image upload → Firestore document creation
2. Scoring function execution (Vision API + Vertex AI + Average Hash)
3. Score calculation and Firestore update
4. Ranking queries

Requires Firestore emulator: firebase emulators:start --only firestore
"""

import sys
from pathlib import Path
from unittest.mock import Mock, patch

from google.cloud import firestore

# Add src directory to path
src_path = Path(__file__).parent.parent.parent / "src" / "functions" / "scoring"
sys.path.insert(0, str(src_path.parent))

from scoring.main import (  # noqa: E402
    calculate_average_hash,
    calculate_smile_score,
    evaluate_theme,
    is_similar_image,
)


class TestScoringPipeline:
    """Integration tests for the full scoring pipeline."""

    def test_full_scoring_flow_with_firestore(
        self,
        firestore_client,
        test_image_bytes,
        mock_vision_client_integration,
        mock_vertex_ai_integration,
    ):
        """
        Test the complete scoring flow from image upload to Firestore update.
        """
        # Setup: Create user and image documents
        user_id = "test_user_001"
        image_id = "test_image_001"

        # Create user document
        user_ref = firestore_client.collection("users").document(user_id)
        user_ref.set(
            {
                "line_user_id": user_id,
                "name": "テスト太郎",
                "total_uploads": 0,
                "best_score": 0,
            }
        )

        # Create image document (pending status)
        image_ref = firestore_client.collection("images").document(image_id)
        image_ref.set(
            {
                "user_id": user_id,
                "storage_path": f"original/{user_id}/test.jpg",
                "status": "pending",
                "upload_timestamp": firestore.SERVER_TIMESTAMP,
            }
        )

        # Verify initial state
        initial_doc = image_ref.get()
        assert initial_doc.exists
        assert initial_doc.to_dict()["status"] == "pending"

        # Execute scoring (mocked APIs)
        # Note: Patch where classes are USED (scoring.main), not where they're DEFINED
        mock_pil_image = Mock()
        mock_pil_image.size = (1000, 1000)  # 1000x1000 image

        # Calculate smile score with mocked PILImage (for image dimensions)
        with (
            patch("scoring.main.vision_client", mock_vision_client_integration),
            patch("scoring.main.PILImage.open", return_value=mock_pil_image),
        ):
            # Each face: 95.0 base score × 0.5 size multiplier (1% relative size)
            # detection_confidence = 0.5 (neutral, no bonus)
            # Total: 2 faces × 95.0 × 0.5 = 95.0
            smile_result = calculate_smile_score(test_image_bytes)
            assert smile_result["smile_score"] == 95.0  # 2 faces × 95.0 × 0.5
            assert smile_result["face_count"] == 2
            assert smile_result["smiling_faces"] == 2

        # Calculate AI score (patch gemini_model directly, no PILImage mock needed)
        with patch("scoring.main.gemini_model", mock_vertex_ai_integration):
            ai_result = evaluate_theme(test_image_bytes)
            assert ai_result["score"] == 85
            assert "素晴らしい笑顔です" in ai_result["comment"]

        # Calculate average hash (no mocking needed, uses real image bytes)
        avg_hash = calculate_average_hash(test_image_bytes)
        assert avg_hash is not None
        assert len(avg_hash) == 16  # 64-bit hash as hex

        # Check similarity (no existing images)
        existing_hashes = []
        is_similar = is_similar_image(avg_hash, existing_hashes)
        assert not is_similar

        # Calculate total score
        similarity_penalty = 1.0 if not is_similar else 1 / 3
        total_score = (smile_result["smile_score"] * ai_result["score"] / 100) * similarity_penalty

        # Update Firestore with scores
        image_ref.update(
            {
                "smile_score": smile_result["smile_score"],
                "ai_score": ai_result["score"],
                "ai_comment": ai_result["comment"],
                "total_score": total_score,
                "average_hash": avg_hash,
                "status": "completed",
                "face_count": smile_result["face_count"],
                "smiling_faces": smile_result["smiling_faces"],
                "similarity_penalty": similarity_penalty,
            }
        )

        # Verify Firestore update
        updated_doc = image_ref.get()
        assert updated_doc.exists
        doc_data = updated_doc.to_dict()
        assert doc_data["status"] == "completed"
        assert doc_data["smile_score"] == 95.0  # 2 faces × 95.0 × 0.5 (1% face size)
        assert doc_data["ai_score"] == 85
        assert doc_data["total_score"] == 80.75  # 95.0 × 85 / 100
        assert doc_data["average_hash"] == avg_hash
        assert doc_data["similarity_penalty"] == 1.0

        # Update user's best score
        user_data = user_ref.get().to_dict()
        if total_score > user_data["best_score"]:
            user_ref.update({"best_score": total_score, "total_uploads": 1})

        # Verify user update
        updated_user = user_ref.get().to_dict()
        assert updated_user["best_score"] == 80.75
        assert updated_user["total_uploads"] == 1

    def test_similarity_detection_integration(self, firestore_client, test_image_bytes, mock_vision_client_integration):
        """
        Test similarity detection with multiple images.
        """
        user_id = "test_user_002"

        # Create first image with hash
        image1_id = "test_image_001"
        image1_ref = firestore_client.collection("images").document(image1_id)

        hash1 = calculate_average_hash(test_image_bytes)
        image1_ref.set(
            {
                "user_id": user_id,
                "storage_path": f"original/{user_id}/img1.jpg",
                "status": "completed",
                "average_hash": hash1,
                "total_score": 150.0,
            }
        )

        # Create second image with same hash (similar image)
        image2_id = "test_image_002"
        hash2 = hash1  # Same hash = similar image

        # Get existing hashes
        existing_images = (
            firestore_client.collection("images")
            .where("user_id", "==", user_id)
            .where("status", "==", "completed")
            .stream()
        )
        existing_hashes = [doc.to_dict()["average_hash"] for doc in existing_images if "average_hash" in doc.to_dict()]

        # Check similarity
        is_similar = is_similar_image(hash2, existing_hashes)
        assert is_similar  # Should detect as similar

        # Apply penalty
        base_score = 150.0
        similarity_penalty = 1 / 3 if is_similar else 1.0
        penalized_score = base_score * similarity_penalty

        # Create second image with penalty
        image2_ref = firestore_client.collection("images").document(image2_id)
        image2_ref.set(
            {
                "user_id": user_id,
                "storage_path": f"original/{user_id}/img2.jpg",
                "status": "completed",
                "average_hash": hash2,
                "total_score": penalized_score,
                "similarity_penalty": similarity_penalty,
            }
        )

        # Verify penalty was applied
        image2_data = image2_ref.get().to_dict()
        assert image2_data["similarity_penalty"] == 1 / 3
        assert image2_data["total_score"] == 50.0  # 150.0 / 3

    def test_ranking_query_integration(self, firestore_client, sample_user_data, sample_scored_image_data):
        """
        Test ranking queries against Firestore.
        """
        # Create multiple users and images
        users_data = [{"line_user_id": f"user_{i}", "name": f"User {i}", "best_score": 0} for i in range(1, 6)]

        images_data = [
            {
                "user_id": f"user_{i}",
                "storage_path": f"original/user_{i}/img.jpg",
                "status": "completed",
                "total_score": 200.0 - (i * 10),  # Scores: 190, 180, 170, 160, 150
                "smile_score": 180.0,
                "ai_score": 90,
            }
            for i in range(1, 6)
        ]

        # Write to Firestore
        for user_data in users_data:
            user_id = user_data["line_user_id"]
            firestore_client.collection("users").document(user_id).set(user_data)

        for i, image_data in enumerate(images_data, 1):
            firestore_client.collection("images").document(f"img_{i}").set(image_data)

        # Query top 3 images
        top_images = (
            firestore_client.collection("images")
            .where("status", "==", "completed")
            .order_by("total_score", direction=firestore.Query.DESCENDING)
            .limit(3)
            .stream()
        )

        top_list = list(top_images)
        assert len(top_list) == 3
        assert top_list[0].to_dict()["total_score"] == 190.0
        assert top_list[1].to_dict()["total_score"] == 180.0
        assert top_list[2].to_dict()["total_score"] == 170.0

        # Verify unique users in top 3 (for frontend ranking display)
        top_users = {doc.to_dict()["user_id"] for doc in top_list}
        assert len(top_users) == 3  # All unique users

    def test_error_handling_in_pipeline(self, firestore_client, test_image_bytes, mock_vision_client_integration):
        """
        Test error handling when APIs fail.
        """
        user_id = "test_user_003"
        image_id = "test_image_error"

        # Create image document
        image_ref = firestore_client.collection("images").document(image_id)
        image_ref.set(
            {
                "user_id": user_id,
                "storage_path": f"original/{user_id}/test.jpg",
                "status": "pending",
            }
        )

        # Mock Vision API error
        mock_vision_error = Mock()
        mock_vision_error.face_detection = Mock(side_effect=Exception("Vision API error"))

        # The function should not raise exceptions, but return error dict with fallback
        with patch("scoring.main.vision_client", mock_vision_error):
            result = calculate_smile_score(test_image_bytes)

        # Verify error handling returns zero points for fairness
        assert "error" in result
        assert result["error"] == "vision_api_failed"
        assert result["smile_score"] == 0.0  # Zero points for API failures
        assert result["face_count"] == 0
        assert result["smiling_faces"] == 0

    def test_concurrent_scoring_no_conflicts(self, firestore_client, test_image_bytes, mock_vision_client_integration):
        """
        Test that concurrent scoring operations don't conflict.
        Simulates multiple images being scored simultaneously.
        """
        user_id = "test_user_004"
        num_images = 5

        # Create multiple image documents
        image_refs = []
        for i in range(num_images):
            image_id = f"test_image_concurrent_{i}"
            image_ref = firestore_client.collection("images").document(image_id)
            image_ref.set(
                {
                    "user_id": user_id,
                    "storage_path": f"original/{user_id}/img_{i}.jpg",
                    "status": "pending",
                }
            )
            image_refs.append(image_ref)

        # Score all images (sequentially in test, but simulating concurrent)
        mock_pil_image = Mock()
        mock_pil_image.size = (1000, 1000)

        for image_ref in image_refs:
            # Calculate smile score with mocked PILImage
            with (
                patch("scoring.main.vision_client", mock_vision_client_integration),
                patch("scoring.main.PILImage.open", return_value=mock_pil_image),
            ):
                smile_result = calculate_smile_score(test_image_bytes)

            # Calculate average hash without mocking (uses real image)
            avg_hash = calculate_average_hash(test_image_bytes)

            image_ref.update(
                {
                    "smile_score": smile_result["smile_score"],
                    "average_hash": avg_hash,
                    "total_score": smile_result["smile_score"],
                    "status": "completed",
                }
            )

        # Verify all images were scored
        completed_images = (
            firestore_client.collection("images")
            .where("user_id", "==", user_id)
            .where("status", "==", "completed")
            .stream()
        )

        completed_list = list(completed_images)
        assert len(completed_list) == num_images

        # Verify all have unique hashes (different images should have different hashes)
        # Note: In this test, we use the same image bytes, so hashes will be the same
        # In reality, different images would have different hashes
        hashes = {doc.to_dict()["average_hash"] for doc in completed_list}
        assert len(hashes) == 1  # All same image = same hash
