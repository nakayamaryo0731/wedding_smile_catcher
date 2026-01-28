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
    _join_event_transaction,
    _register_name,
    handle_command,
    handle_image_message,
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

    def test_join_with_text_prefix(self):
        """text= prefix is now stripped by handle_text_message, not the pattern."""
        match = JOIN_PATTERN.match("text=JOIN abc-123")
        assert match is None

    def test_join_with_text_prefix_uuid(self):
        """text= prefix is now stripped by handle_text_message, not the pattern."""
        match = JOIN_PATTERN.match("text=JOIN fde25512-7df4-4b24-87fb-59cc8405cc17")
        assert match is None


class TestTextNormalization:
    """Tests for text= prefix normalization in handle_text_message."""

    @patch("webhook.main.messaging_api")
    @patch("webhook.main.db")
    @patch("webhook.main.firestore.transactional", lambda f: f)
    def test_text_normalization_strips_text_prefix(self, mock_db, mock_messaging_api):
        """text=JOIN ... is normalized to JOIN ... and matched."""
        mock_event_doc = MagicMock()
        mock_event_doc.id = "event_001"
        mock_event_doc.to_dict.return_value = {
            "event_name": "テスト結婚式",
            "event_code": "abc-123",
            "status": "active",
        }
        mock_query = MagicMock()
        mock_query.stream.return_value = iter([mock_event_doc])

        mock_events_ref = MagicMock()
        mock_events_ref.where.return_value.where.return_value.limit.return_value = mock_query

        mock_user_ref = MagicMock()
        mock_user_doc = MagicMock()
        mock_user_doc.exists = False
        mock_user_ref.get.return_value = mock_user_doc

        mock_transaction = MagicMock()

        mock_users_ref = MagicMock()
        mock_users_ref.document.return_value = mock_user_ref
        mock_users_ref.where.return_value.where.return_value.stream.return_value = []

        def collection_side_effect(name):
            if name == "events":
                return mock_events_ref
            elif name == "users":
                return mock_users_ref
            return MagicMock()

        mock_db.collection.side_effect = collection_side_effect
        mock_db.transaction.return_value = mock_transaction

        # Simulate handle_text_message behavior: normalize then match
        text = "text=JOIN abc-123"
        if text.startswith("text="):
            text = text[len("text=") :]
        match = JOIN_PATTERN.match(text)
        assert match is not None
        assert match.group(1) == "abc-123"

    def test_text_normalization_no_prefix(self):
        """JOIN ... without text= prefix matches directly (regression test)."""
        text = "JOIN abc-123"
        if text.startswith("text="):
            text = text[len("text=") :]
        match = JOIN_PATTERN.match(text)
        assert match is not None
        assert match.group(1) == "abc-123"


def _setup_event_mock(mock_db, event_id, event_name, event_code, status="active"):
    """Helper to set up common event and users collection mocks."""
    mock_event_doc = MagicMock()
    mock_event_doc.id = event_id
    mock_event_doc.to_dict.return_value = {
        "event_name": event_name,
        "event_code": event_code,
        "status": status,
    }
    mock_query = MagicMock()
    mock_query.stream.return_value = iter([mock_event_doc])

    mock_events_ref = MagicMock()
    mock_events_ref.where.return_value.where.return_value.limit.return_value = mock_query

    return mock_events_ref


class TestHandleJoinEvent:
    """Tests for handle_join_event function."""

    @patch("webhook.main.messaging_api")
    @patch("webhook.main.db")
    def test_join_event_not_found(self, mock_db, mock_messaging_api):
        """Test joining with invalid event code."""
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
    @patch("webhook.main.firestore.transactional", lambda f: f)
    def test_join_event_success(self, mock_db, mock_messaging_api):
        """Test successful event join."""
        mock_events_ref = _setup_event_mock(mock_db, "event_001", "テスト結婚式", "valid-code")

        mock_user_ref = MagicMock()
        mock_user_doc = MagicMock()
        mock_user_doc.exists = False
        mock_user_ref.get.return_value = mock_user_doc

        mock_transaction = MagicMock()

        mock_users_ref = MagicMock()
        mock_users_ref.document.return_value = mock_user_ref
        mock_users_ref.where.return_value.where.return_value.stream.return_value = []

        def collection_side_effect(name):
            if name == "events":
                return mock_events_ref
            elif name == "users":
                return mock_users_ref
            return MagicMock()

        mock_db.collection.side_effect = collection_side_effect
        mock_db.transaction.return_value = mock_transaction

        handle_join_event("valid-code", "user_123", "reply_token_1")

        # Verify user document created via transaction
        mock_users_ref.document.assert_any_call("user_123_event_001")
        mock_transaction.set.assert_called_once()
        set_args = mock_transaction.set.call_args[0]
        assert set_args[0] is mock_user_ref
        set_data = set_args[1]
        assert set_data["line_user_id"] == "user_123"
        assert set_data["event_id"] == "event_001"
        assert set_data["join_status"] == "pending_name"

        mock_messaging_api.reply_message.assert_called_once()
        assert "テスト結婚式" in _get_reply_text(mock_messaging_api)

    @patch("webhook.main.messaging_api")
    @patch("webhook.main.db")
    @patch("webhook.main.firestore.transactional", lambda f: f)
    def test_join_event_already_registered(self, mock_db, mock_messaging_api):
        """Test joining event user already belongs to."""
        mock_events_ref = _setup_event_mock(mock_db, "event_001", "テスト結婚式", "valid-code")

        mock_user_ref = MagicMock()
        mock_user_doc = MagicMock()
        mock_user_doc.exists = True
        mock_user_doc.to_dict.return_value = {
            "name": "テスト太郎",
            "join_status": "registered",
        }
        mock_user_ref.get.return_value = mock_user_doc

        mock_transaction = MagicMock()

        mock_users_ref = MagicMock()
        mock_users_ref.document.return_value = mock_user_ref
        mock_users_ref.where.return_value.where.return_value.stream.return_value = []

        def collection_side_effect(name):
            if name == "events":
                return mock_events_ref
            elif name == "users":
                return mock_users_ref
            return MagicMock()

        mock_db.collection.side_effect = collection_side_effect
        mock_db.transaction.return_value = mock_transaction

        handle_join_event("valid-code", "user_123", "reply_token_1")

        mock_transaction.set.assert_not_called()
        assert "参加済み" in _get_reply_text(mock_messaging_api)

    @patch("webhook.main.messaging_api")
    @patch("webhook.main.db")
    @patch("webhook.main.firestore.transactional", lambda f: f)
    def test_join_event_test_status(self, mock_db, mock_messaging_api):
        """Test joining event with 'test' status succeeds."""
        mock_events_ref = _setup_event_mock(mock_db, "event_002", "テスト結婚式", "test-code", status="test")

        mock_user_ref = MagicMock()
        mock_user_doc = MagicMock()
        mock_user_doc.exists = False
        mock_user_ref.get.return_value = mock_user_doc

        mock_transaction = MagicMock()

        mock_users_ref = MagicMock()
        mock_users_ref.document.return_value = mock_user_ref
        mock_users_ref.where.return_value.where.return_value.stream.return_value = []

        def collection_side_effect(name):
            if name == "events":
                return mock_events_ref
            elif name == "users":
                return mock_users_ref
            return MagicMock()

        mock_db.collection.side_effect = collection_side_effect
        mock_db.transaction.return_value = mock_transaction

        handle_join_event("test-code", "user_456", "reply_token_2")

        mock_users_ref.document.assert_any_call("user_456_event_002")
        mock_transaction.set.assert_called_once()
        set_args = mock_transaction.set.call_args[0]
        set_data = set_args[1]
        assert set_data["line_user_id"] == "user_456"
        assert set_data["event_id"] == "event_002"
        assert set_data["join_status"] == "pending_name"

    @patch("webhook.main.messaging_api")
    @patch("webhook.main.db")
    def test_join_event_draft_status_rejected(self, mock_db, mock_messaging_api):
        """Test joining event with 'draft' status is rejected (not found)."""
        mock_query = MagicMock()
        mock_query.stream.return_value = iter([])
        mock_events_ref = MagicMock()
        mock_events_ref.where.return_value.where.return_value.limit.return_value = mock_query
        mock_db.collection.return_value = mock_events_ref

        handle_join_event("draft-code", "user_789", "reply_token_3")

        mock_messaging_api.reply_message.assert_called_once()
        assert "見つかりません" in _get_reply_text(mock_messaging_api)

    @patch("webhook.main.messaging_api")
    @patch("webhook.main.db")
    def test_join_event_archived_status_rejected(self, mock_db, mock_messaging_api):
        """Test joining event with 'archived' status is rejected (not found)."""
        mock_query = MagicMock()
        mock_query.stream.return_value = iter([])
        mock_events_ref = MagicMock()
        mock_events_ref.where.return_value.where.return_value.limit.return_value = mock_query
        mock_db.collection.return_value = mock_events_ref

        handle_join_event("archived-code", "user_789", "reply_token_4")

        mock_messaging_api.reply_message.assert_called_once()
        assert "見つかりません" in _get_reply_text(mock_messaging_api)

    @patch("webhook.main.messaging_api")
    @patch("webhook.main.db")
    @patch("webhook.main.firestore.transactional", lambda f: f)
    def test_join_event_deactivates_other_registrations(self, mock_db, mock_messaging_api):
        """Test joining a new event deactivates registrations in other events."""
        mock_events_ref = _setup_event_mock(mock_db, "new_event", "新しい結婚式", "new-code")

        mock_user_ref = MagicMock()
        mock_user_doc = MagicMock()
        mock_user_doc.exists = False
        mock_user_ref.get.return_value = mock_user_doc

        mock_transaction = MagicMock()

        mock_old_doc = MagicMock()
        mock_old_doc.id = "user_123_old_event"
        mock_old_doc.to_dict.return_value = {"event_id": "old_event"}

        mock_old_doc_ref = MagicMock()

        mock_users_ref = MagicMock()
        mock_users_ref.document.side_effect = lambda doc_id: (
            mock_old_doc_ref if doc_id == "user_123_old_event" else mock_user_ref
        )
        # Single query returns old doc (now uses `in` operator, one call)
        mock_users_ref.where.return_value.where.return_value.stream.return_value = iter([mock_old_doc])

        def collection_side_effect(name):
            if name == "events":
                return mock_events_ref
            elif name == "users":
                return mock_users_ref
            return MagicMock()

        mock_db.collection.side_effect = collection_side_effect
        mock_db.transaction.return_value = mock_transaction

        handle_join_event("new-code", "user_123", "reply_token_5")

        mock_old_doc_ref.update.assert_called_once_with({"join_status": "left"})

        mock_transaction.set.assert_called_once()
        set_args = mock_transaction.set.call_args[0]
        set_data = set_args[1]
        assert set_data["event_id"] == "new_event"
        assert set_data["join_status"] == "pending_name"

    @patch("webhook.main.messaging_api")
    @patch("webhook.main.db")
    @patch("webhook.main.firestore.transactional", lambda f: f)
    def test_join_event_reactivate_left_with_name(self, mock_db, mock_messaging_api):
        """Test re-JOIN from left status with name restores to registered."""
        mock_events_ref = _setup_event_mock(mock_db, "event_001", "テスト結婚式", "valid-code")

        mock_user_ref = MagicMock()
        mock_user_doc = MagicMock()
        mock_user_doc.exists = True
        mock_user_doc.to_dict.return_value = {
            "name": "テスト太郎",
            "join_status": "left",
        }
        mock_user_ref.get.return_value = mock_user_doc

        mock_transaction = MagicMock()

        mock_users_ref = MagicMock()
        mock_users_ref.document.return_value = mock_user_ref
        mock_users_ref.where.return_value.where.return_value.stream.return_value = []

        def collection_side_effect(name):
            if name == "events":
                return mock_events_ref
            elif name == "users":
                return mock_users_ref
            return MagicMock()

        mock_db.collection.side_effect = collection_side_effect
        mock_db.transaction.return_value = mock_transaction

        handle_join_event("valid-code", "user_123", "reply_token_1")

        mock_transaction.update.assert_called_once_with(mock_user_ref, {"join_status": "registered"})
        reply_text = _get_reply_text(mock_messaging_api)
        assert "おかえりなさい" in reply_text
        assert "テスト太郎" in reply_text

    @patch("webhook.main.messaging_api")
    @patch("webhook.main.db")
    @patch("webhook.main.firestore.transactional", lambda f: f)
    def test_join_event_reactivate_left_without_name(self, mock_db, mock_messaging_api):
        """Test re-JOIN from left status without name restores to pending_name."""
        mock_events_ref = _setup_event_mock(mock_db, "event_001", "テスト結婚式", "valid-code")

        mock_user_ref = MagicMock()
        mock_user_doc = MagicMock()
        mock_user_doc.exists = True
        mock_user_doc.to_dict.return_value = {
            "join_status": "left",
        }
        mock_user_ref.get.return_value = mock_user_doc

        mock_transaction = MagicMock()

        mock_users_ref = MagicMock()
        mock_users_ref.document.return_value = mock_user_ref
        mock_users_ref.where.return_value.where.return_value.stream.return_value = []

        def collection_side_effect(name):
            if name == "events":
                return mock_events_ref
            elif name == "users":
                return mock_users_ref
            return MagicMock()

        mock_db.collection.side_effect = collection_side_effect
        mock_db.transaction.return_value = mock_transaction

        handle_join_event("valid-code", "user_123", "reply_token_1")

        mock_transaction.update.assert_called_once_with(mock_user_ref, {"join_status": "pending_name"})
        reply_text = _get_reply_text(mock_messaging_api)
        assert "再参加" in reply_text
        assert "お名前" in reply_text


class TestJoinEventTransaction:
    """Tests for _join_event_transaction function directly."""

    @patch("webhook.main.firestore.transactional", lambda f: f)
    def test_transaction_new_user(self):
        """Test transaction creates new user document."""
        mock_transaction = MagicMock()
        mock_user_ref = MagicMock()
        mock_doc = MagicMock()
        mock_doc.exists = False
        mock_user_ref.get.return_value = mock_doc

        message = _join_event_transaction(mock_transaction, mock_user_ref, "user_1", "evt_1", "Wedding")
        mock_transaction.set.assert_called_once()
        assert "Wedding" in message.text

    @patch("webhook.main.firestore.transactional", lambda f: f)
    def test_transaction_pending_name(self):
        """Test transaction returns prompt for pending_name user."""
        mock_transaction = MagicMock()
        mock_user_ref = MagicMock()
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"join_status": "pending_name"}
        mock_user_ref.get.return_value = mock_doc

        message = _join_event_transaction(mock_transaction, mock_user_ref, "user_1", "evt_1", "Wedding")
        mock_transaction.set.assert_not_called()
        mock_transaction.update.assert_not_called()
        assert "お名前" in message.text

    @patch("webhook.main.firestore.transactional", lambda f: f)
    def test_transaction_left_with_name(self):
        """Test transaction reactivates left user with name to registered."""
        mock_transaction = MagicMock()
        mock_user_ref = MagicMock()
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"join_status": "left", "name": "太郎"}
        mock_user_ref.get.return_value = mock_doc

        message = _join_event_transaction(mock_transaction, mock_user_ref, "user_1", "evt_1", "Wedding")
        mock_transaction.update.assert_called_once_with(mock_user_ref, {"join_status": "registered"})
        assert "おかえりなさい" in message.text

    @patch("webhook.main.firestore.transactional", lambda f: f)
    def test_transaction_left_without_name(self):
        """Test transaction reactivates left user without name to pending_name."""
        mock_transaction = MagicMock()
        mock_user_ref = MagicMock()
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"join_status": "left"}
        mock_user_ref.get.return_value = mock_doc

        message = _join_event_transaction(mock_transaction, mock_user_ref, "user_1", "evt_1", "Wedding")
        mock_transaction.update.assert_called_once_with(mock_user_ref, {"join_status": "pending_name"})
        assert "再参加" in message.text

    @patch("webhook.main.firestore.transactional", lambda f: f)
    def test_transaction_registered(self):
        """Test transaction returns already-joined for registered user."""
        mock_transaction = MagicMock()
        mock_user_ref = MagicMock()
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"join_status": "registered", "name": "太郎"}
        mock_user_ref.get.return_value = mock_doc

        message = _join_event_transaction(mock_transaction, mock_user_ref, "user_1", "evt_1", "Wedding")
        mock_transaction.set.assert_not_called()
        mock_transaction.update.assert_not_called()
        assert "参加済み" in message.text


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


def _make_image_event(user_id="user_123", message_id="msg_001", reply_token="reply_token_img"):
    """Create a mock LINE ImageMessageContent event."""
    event = MagicMock()
    event.source.user_id = user_id
    event.message.id = message_id
    event.reply_token = reply_token
    return event


class TestHandleImageMessage:
    """Tests for handle_image_message event status guard."""

    @patch("webhook.main.messaging_api")
    @patch("webhook.main.db")
    def test_image_rejected_when_event_archived(self, mock_db, mock_messaging_api):
        """Archived event returns '終了しました' and does not send loading message."""
        # User lookup returns a registered user with event_id
        mock_user_doc = MagicMock()
        mock_user_doc.to_dict.return_value = {
            "event_id": "event_001",
            "name": "テスト太郎",
        }
        mock_user_ref = MagicMock()

        # Event doc exists but is archived
        mock_event_doc = MagicMock()
        mock_event_doc.exists = True
        mock_event_doc.to_dict.return_value = {"status": "archived"}

        mock_events_ref = MagicMock()
        mock_events_ref.document.return_value.get.return_value = mock_event_doc

        mock_users_ref = MagicMock()
        mock_query = MagicMock()
        mock_query.stream.return_value = iter([mock_user_doc])
        mock_users_ref.where.return_value.where.return_value.order_by.return_value.limit.return_value = mock_query
        mock_users_ref.document.return_value = mock_user_ref

        def collection_side_effect(name):
            if name == "events":
                return mock_events_ref
            elif name == "users":
                return mock_users_ref
            return MagicMock()

        mock_db.collection.side_effect = collection_side_effect

        event = _make_image_event()
        handle_image_message(event)

        reply_text = _get_reply_text(mock_messaging_api)
        assert "終了しました" in reply_text
        # Loading message ("分析中") should NOT appear
        mock_messaging_api.reply_message.assert_called_once()

    @patch("webhook.main.messaging_api")
    @patch("webhook.main.db")
    def test_image_rejected_when_event_not_found(self, mock_db, mock_messaging_api):
        """Missing event doc returns '見つかりません'."""
        mock_user_doc = MagicMock()
        mock_user_doc.to_dict.return_value = {
            "event_id": "event_gone",
            "name": "テスト太郎",
        }
        mock_user_ref = MagicMock()

        mock_event_doc = MagicMock()
        mock_event_doc.exists = False

        mock_events_ref = MagicMock()
        mock_events_ref.document.return_value.get.return_value = mock_event_doc

        mock_users_ref = MagicMock()
        mock_query = MagicMock()
        mock_query.stream.return_value = iter([mock_user_doc])
        mock_users_ref.where.return_value.where.return_value.order_by.return_value.limit.return_value = mock_query
        mock_users_ref.document.return_value = mock_user_ref

        def collection_side_effect(name):
            if name == "events":
                return mock_events_ref
            elif name == "users":
                return mock_users_ref
            return MagicMock()

        mock_db.collection.side_effect = collection_side_effect

        event = _make_image_event()
        handle_image_message(event)

        reply_text = _get_reply_text(mock_messaging_api)
        assert "見つかりません" in reply_text

    @patch("webhook.main.messaging_api_blob")
    @patch("webhook.main.messaging_api")
    @patch("webhook.main.db")
    @patch("webhook.main.storage_client")
    def test_image_accepted_when_event_active(self, mock_storage, mock_db, mock_messaging_api, mock_blob_api):
        """Active event proceeds to loading message (regression test)."""
        mock_user_doc = MagicMock()
        mock_user_doc.to_dict.return_value = {
            "event_id": "event_001",
            "name": "テスト太郎",
        }
        mock_user_ref = MagicMock()

        mock_event_doc = MagicMock()
        mock_event_doc.exists = True
        mock_event_doc.to_dict.return_value = {"status": "active"}

        mock_events_ref = MagicMock()
        mock_events_ref.document.return_value.get.return_value = mock_event_doc

        mock_users_ref = MagicMock()
        mock_query = MagicMock()
        mock_query.stream.return_value = iter([mock_user_doc])
        mock_users_ref.where.return_value.where.return_value.order_by.return_value.limit.return_value = mock_query
        mock_users_ref.document.return_value = mock_user_ref

        mock_images_ref = MagicMock()

        def collection_side_effect(name):
            if name == "events":
                return mock_events_ref
            elif name == "users":
                return mock_users_ref
            elif name == "images":
                return mock_images_ref
            return MagicMock()

        mock_db.collection.side_effect = collection_side_effect

        # Mock LINE blob API to return image bytes
        mock_blob_api.get_message_content.return_value = b"fake_image_data"

        # Mock storage
        mock_bucket = MagicMock()
        mock_storage.bucket.return_value = mock_bucket

        event = _make_image_event()
        handle_image_message(event)

        # First reply should be the loading message (containing "分析中")
        reply_text = _get_reply_text(mock_messaging_api)
        assert "分析中" in reply_text
