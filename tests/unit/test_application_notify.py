"""
Unit tests for the application notification function (src/functions/application-notify/main.py).
"""

import importlib.util
from pathlib import Path
from unittest.mock import Mock, patch

from flask import Flask, request

# The directory name has a hyphen, so load the module from its path
_main_path = Path(__file__).parent.parent.parent / "src" / "functions" / "application-notify" / "main.py"
_spec = importlib.util.spec_from_file_location("application_notify_main", _main_path)
application_notify_main = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(application_notify_main)

ADMIN_EMAIL = "admin@example.com"
SMTP_EMAIL = "service@example.com"

VALID_APPLICATION = {
    "groom_name": "太郎",
    "bride_name": "花子",
    "email": "customer@example.com",
    "event_date": "2026-12-05",
    "start_time": "14:00",
    "end_time": "17:00",
    "guest_count": "51~100人",
}


def _post(body: dict):
    """Call application_notify with a POST request carrying body as JSON."""
    app = Flask(__name__)
    with app.test_request_context(method="POST", json=body):
        return application_notify_main.application_notify(request)


@patch.multiple(
    application_notify_main,
    LINE_CHANNEL_ACCESS_TOKEN="test-token",
    ADMIN_LINE_USER_ID="Uadmin",
    ADMIN_EMAIL=ADMIN_EMAIL,
    SMTP_EMAIL=SMTP_EMAIL,
    SMTP_PASSWORD="test-password",
)
class TestApplicationNotify:
    """Tests for the application_notify HTTP entrypoint."""

    @patch.object(application_notify_main.smtplib, "SMTP_SSL")
    @patch.object(application_notify_main.requests, "post")
    def test_sends_email_only_to_admin(self, mock_post, mock_smtp):
        """The address in the request must not receive mail; anyone can call this endpoint."""
        mock_post.return_value = Mock(status_code=200)
        server = mock_smtp.return_value.__enter__.return_value

        response, status, _headers = _post({**VALID_APPLICATION, "email": "someone@example.com"})

        assert status == 200
        recipients = [call.args[1] for call in server.sendmail.call_args_list]
        assert recipients == [ADMIN_EMAIL]

    @patch.object(application_notify_main.smtplib, "SMTP_SSL")
    @patch.object(application_notify_main.requests, "post")
    def test_notifies_admin_by_line_and_email(self, mock_post, mock_smtp):
        mock_post.return_value = Mock(status_code=200)
        server = mock_smtp.return_value.__enter__.return_value

        response, status, _headers = _post(VALID_APPLICATION)

        assert status == 200
        assert response.get_json() == {"success": True}
        line_body = mock_post.call_args.kwargs["json"]
        assert line_body["to"] == "Uadmin"
        assert "太郎 & 花子" in line_body["messages"][0]["text"]
        server.sendmail.assert_called_once()

    @patch.object(application_notify_main.smtplib, "SMTP_SSL")
    @patch.object(application_notify_main.requests, "post")
    def test_rejects_invalid_application(self, mock_post, mock_smtp):
        response, status, _headers = _post({**VALID_APPLICATION, "guest_count": "1000人"})

        assert status == 400
        mock_post.assert_not_called()
        mock_smtp.assert_not_called()
