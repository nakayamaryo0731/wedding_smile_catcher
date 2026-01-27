"""
Unit tests for webhook functions (src/functions/webhook/main.py).
Tests the multi-tenant JOIN flow, name registration, and image handling.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add src directory to path
src_path = Path(__file__).parent.parent.parent / "src" / "functions" / "webhook"
sys.path.insert(0, str(src_path.parent))

from webhook.main import (  # noqa: E402
    JOIN_PATTERN,
    _find_user_by_status,
    _register_name,
    handle_command,
    handle_join_event,
)


def _get_reply_text(mock_messaging_api) -> str:
    """Extract text from the ReplyMessageRequest passed to messaging_api.reply_message."""
    req = mock_messaging_api.reply_message.call_args[0][0]
    return req.messages[0].text


class TestJoinPattern:
    """Tests for the JOIN command regex pattern."""

    def test_join_uppercase(self):
        match = JOIN_PATTERN.match("JOIN abc-123")
        assert match is not None
        assert match.group(1) == "abc-123"

    def test_join_lowercase(self):
        match = JOIN_PATTERN.match("join abc-123")
        assert match is not None
        assert match.group(1) == "abc-123"

    def test_join_mixed_case(self):
        match = JOIN_PATTERN.match("Join abc-123")
        assert match is not None
        assert match.group(1) == "abc-123"

    def test_join_with_uuid(self):
        match = JOIN_PATTERN.match("JOIN fde25512-7df4-4b24-87fb-59cc8405cc17")
        assert match is not None
        assert match.group(1) == "fde25512-7df4-4b24-87fb-59cc8405cc17"

    def test_join_no_code(self):
        match = JOIN_PATTERN.match("JOIN")
        assert match is None

    def test_not_join(self):
        match = JOIN_PATTERN.match("hello")
        assert match is None

    def test_join_with_extra_spaces(self):
        match = JOIN_PATTERN.match("JOIN   abc-123")
        assert match is not None
        assert match.group(1).strip() == "abc-123"


class TestHandleJoinEvent:
    """Tests for handle_join_event function."""

    @patch("webhook.main.messaging_api")
    @patch("webhook.main.db")
    def test_join_event_not_found(self, mock_db, mock_messaging_api):
        """Test joining with invalid event code."""
        # Mock empty query result
        mock_query = MagicMock()
        mock_query.stream.return_value = iter([])
        mock_events_ref = MagicMock()
        mock_events_ref.where.return_value.where.return_value.limit.return_value = mock_query
        mock_db.collection.return_value = mock_events_ref

        handle_join_event("invalid-code", "user_123", "reply_token_1")

        mock_messaging_api.reply_message.assert_called_once()
        assert "見つかりません" in _get_reply_text(mock_messaging_api)

    @patch("webhook.main.messaging_api")
    @patch("webhook.main.db")
    def test_join_event_success(self, mock_db, mock_messaging_api):
        """Test successful event join."""
        # Mock event found
        mock_event_doc = MagicMock()
        mock_event_doc.id = "event_001"
        mock_event_doc.to_dict.return_value = {
            "event_name": "テスト結婚式",
            "event_code": "valid-code",
            "status": "active",
        }
        mock_query = MagicMock()
        mock_query.stream.return_value = iter([mock_event_doc])

        # Mock events collection query
        mock_events_ref = MagicMock()
        mock_events_ref.where.return_value.where.return_value.limit.return_value = mock_query

        # Mock user document (not exists)
        mock_user_ref = MagicMock()
        mock_user_doc = MagicMock()
        mock_user_doc.exists = False
        mock_user_ref.get.return_value = mock_user_doc

        # Mock users collection
        mock_users_ref = MagicMock()
        mock_users_ref.document.return_value = mock_user_ref

        def collection_side_effect(name):
            if name == "events":
                return mock_events_ref
            elif name == "users":
                return mock_users_ref
            return MagicMock()

        mock_db.collection.side_effect = collection_side_effect

        handle_join_event("valid-code", "user_123", "reply_token_1")

        # Verify user document created with composite key
        mock_users_ref.document.assert_called_with("user_123_event_001")
        mock_user_ref.set.assert_called_once()
        set_data = mock_user_ref.set.call_args[0][0]
        assert set_data["line_user_id"] == "user_123"
        assert set_data["event_id"] == "event_001"
        assert set_data["join_status"] == "pending_name"

        # Verify reply message
        mock_messaging_api.reply_message.assert_called_once()
        assert "テスト結婚式" in _get_reply_text(mock_messaging_api)

    @patch("webhook.main.messaging_api")
    @patch("webhook.main.db")
    def test_join_event_already_registered(self, mock_db, mock_messaging_api):
        """Test joining event user already belongs to."""
        # Mock event found
        mock_event_doc = MagicMock()
        mock_event_doc.id = "event_001"
        mock_event_doc.to_dict.return_value = {
            "event_name": "テスト結婚式",
            "event_code": "valid-code",
            "status": "active",
        }
        mock_query = MagicMock()
        mock_query.stream.return_value = iter([mock_event_doc])

        mock_events_ref = MagicMock()
        mock_events_ref.where.return_value.where.return_value.limit.return_value = mock_query

        # Mock user document (already exists, registered)
        mock_user_ref = MagicMock()
        mock_user_doc = MagicMock()
        mock_user_doc.exists = True
        mock_user_doc.to_dict.return_value = {
            "name": "テスト太郎",
            "join_status": "registered",
        }
        mock_user_ref.get.return_value = mock_user_doc

        mock_users_ref = MagicMock()
        mock_users_ref.document.return_value = mock_user_ref

        def collection_side_effect(name):
            if name == "events":
                return mock_events_ref
            elif name == "users":
                return mock_users_ref
            return MagicMock()

        mock_db.collection.side_effect = collection_side_effect

        handle_join_event("valid-code", "user_123", "reply_token_1")

        # Should not create new user doc
        mock_user_ref.set.assert_not_called()
        # Should reply with already joined message
        assert "参加済み" in _get_reply_text(mock_messaging_api)


class TestFindUserByStatus:
    """Tests for _find_user_by_status helper."""

    @patch("webhook.main.db")
    def test_find_user_found(self, mock_db):
        """Test finding a user with matching status."""
        mock_doc = MagicMock()
        mock_doc.id = "user_123_event_001"

        mock_query = MagicMock()
        mock_query.stream.return_value = iter([mock_doc])

        mock_users_ref = MagicMock()
        mock_users_ref.where.return_value.where.return_value.order_by.return_value.limit.return_value = mock_query
        mock_db.collection.return_value = mock_users_ref

        doc, ref = _find_user_by_status("user_123", "registered")
        assert doc is not None
        assert doc.id == "user_123_event_001"

    @patch("webhook.main.db")
    def test_find_user_not_found(self, mock_db):
        """Test no user found with matching status."""
        mock_query = MagicMock()
        mock_query.stream.return_value = iter([])

        mock_users_ref = MagicMock()
        mock_users_ref.where.return_value.where.return_value.order_by.return_value.limit.return_value = mock_query
        mock_db.collection.return_value = mock_users_ref

        doc, ref = _find_user_by_status("user_123", "registered")
        assert doc is None
        assert ref is None


class TestRegisterName:
    """Tests for _register_name function."""

    @patch("webhook.main.messaging_api")
    def test_register_name_success(self, mock_messaging_api):
        """Test successful name registration."""
        mock_ref = MagicMock()
        mock_doc = MagicMock()

        _register_name("テスト太郎", "user_123", mock_doc, mock_ref, "reply_token_1")

        mock_ref.update.assert_called_once_with(
            {
                "name": "テスト太郎",
                "join_status": "registered",
            }
        )
        reply_text = _get_reply_text(mock_messaging_api)
        assert "テスト太郎" in reply_text
        assert "登録完了" in reply_text

    @patch("webhook.main.messaging_api")
    def test_register_name_failure(self, mock_messaging_api):
        """Test name registration failure."""
        mock_ref = MagicMock()
        mock_ref.update.side_effect = Exception("Firestore error")
        mock_doc = MagicMock()

        _register_name("テスト太郎", "user_123", mock_doc, mock_ref, "reply_token_1")

        assert "失敗" in _get_reply_text(mock_messaging_api)


class TestHandleCommand:
    """Tests for handle_command function."""

    @patch("webhook.main.messaging_api")
    def test_help_command(self, mock_messaging_api):
        """Test help command."""
        handle_command("ヘルプ", "reply_token_1")

        assert "使い方" in _get_reply_text(mock_messaging_api)

    @patch("webhook.main.messaging_api")
    def test_help_command_english(self, mock_messaging_api):
        """Test English help command."""
        handle_command("help", "reply_token_1")

        assert "使い方" in _get_reply_text(mock_messaging_api)

    @patch("webhook.main.messaging_api")
    def test_unknown_command(self, mock_messaging_api):
        """Test unknown command."""
        handle_command("random text", "reply_token_1")

        assert "アップロード" in _get_reply_text(mock_messaging_api)
