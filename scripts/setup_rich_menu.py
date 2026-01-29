#!/usr/bin/env python3
"""
Setup LINE Rich Menu with Privacy Policy link.

This script creates a rich menu for the LINE Bot with a single button
linking to the privacy policy page. This is required for LINE User Data Policy compliance.

Usage:
    # Set environment variables (or use .env file)
    export LINE_CHANNEL_ACCESS_TOKEN="your_token"

    # Run the script
    python scripts/setup_rich_menu.py

    # Or with custom privacy policy URL
    python scripts/setup_rich_menu.py --privacy-url "https://example.com/privacy"
"""

import argparse
import os
import sys
from io import BytesIO

from dotenv import load_dotenv
from linebot.v3.messaging import (
    ApiClient,
    Configuration,
    MessagingApi,
    MessagingApiBlob,
    RichMenuArea,
    RichMenuBounds,
    RichMenuRequest,
    RichMenuSize,
    URIAction,
)
from PIL import Image, ImageDraw, ImageFont

# Default privacy policy URL
DEFAULT_PRIVACY_URL = "https://wedding-smile-catcher.web.app/privacy"

# Rich menu image dimensions (compact size)
RICH_MENU_WIDTH = 2500
RICH_MENU_HEIGHT = 843

# Colors
BACKGROUND_COLOR = (76, 175, 80)  # Material Green 500
TEXT_COLOR = (255, 255, 255)  # White
ICON_COLOR = (255, 255, 255)  # White


def create_rich_menu_image() -> bytes:
    """Create a simple rich menu image with privacy policy text."""
    # Create image
    img = Image.new("RGB", (RICH_MENU_WIDTH, RICH_MENU_HEIGHT), BACKGROUND_COLOR)
    draw = ImageDraw.Draw(img)

    # Try to load a font, fall back to default if not available
    try:
        # Try common Japanese fonts on different systems
        font_paths = [
            "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",  # macOS
            "/System/Library/Fonts/Hiragino Sans GB.ttc",  # macOS
            "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",  # Linux
            "C:\\Windows\\Fonts\\msgothic.ttc",  # Windows
        ]
        font = None
        for font_path in font_paths:
            if os.path.exists(font_path):
                font = ImageFont.truetype(font_path, 80)
                break
        if font is None:
            font = ImageFont.load_default()
    except Exception:
        font = ImageFont.load_default()

    # Draw shield icon (simple representation)
    shield_center_x = RICH_MENU_WIDTH // 2
    shield_top_y = 180

    # Shield shape points
    shield_points = [
        (shield_center_x - 80, shield_top_y),
        (shield_center_x + 80, shield_top_y),
        (shield_center_x + 80, shield_top_y + 100),
        (shield_center_x, shield_top_y + 160),
        (shield_center_x - 80, shield_top_y + 100),
    ]
    draw.polygon(shield_points, fill=ICON_COLOR)

    # Draw checkmark inside shield
    draw.line(
        [
            (shield_center_x - 30, shield_top_y + 70),
            (shield_center_x - 5, shield_top_y + 100),
            (shield_center_x + 40, shield_top_y + 40),
        ],
        fill=BACKGROUND_COLOR,
        width=12,
    )

    # Draw text
    text_ja = "プライバシーポリシー"
    text_en = "Privacy Policy"

    # Calculate text positions (centered)
    try:
        bbox_ja = draw.textbbox((0, 0), text_ja, font=font)
        text_width_ja = bbox_ja[2] - bbox_ja[0]
    except Exception:
        text_width_ja = len(text_ja) * 40  # Fallback

    try:
        bbox_en = draw.textbbox((0, 0), text_en, font=font)
        text_width_en = bbox_en[2] - bbox_en[0]
    except Exception:
        text_width_en = len(text_en) * 40  # Fallback

    # Draw Japanese text
    draw.text(
        ((RICH_MENU_WIDTH - text_width_ja) // 2, 420),
        text_ja,
        fill=TEXT_COLOR,
        font=font,
    )

    # Draw English text (smaller)
    small_font = font
    try:
        font_path = getattr(font, "path", None)
        if font_path:
            small_font = ImageFont.truetype(font_path, 50)
    except Exception:
        pass

    try:
        bbox_en = draw.textbbox((0, 0), text_en, font=small_font)
        text_width_en = bbox_en[2] - bbox_en[0]
    except Exception:
        text_width_en = len(text_en) * 25

    draw.text(
        ((RICH_MENU_WIDTH - text_width_en) // 2, 540),
        text_en,
        fill=TEXT_COLOR,
        font=small_font,
    )

    # Draw tap hint
    hint_text = "タップして確認"
    hint_font = font
    try:
        font_path = getattr(font, "path", None)
        if font_path:
            hint_font = ImageFont.truetype(font_path, 40)
        bbox_hint = draw.textbbox((0, 0), hint_text, font=hint_font)
        hint_width = bbox_hint[2] - bbox_hint[0]
    except Exception:
        hint_width = len(hint_text) * 20

    draw.text(
        ((RICH_MENU_WIDTH - hint_width) // 2, 680),
        hint_text,
        fill=(200, 230, 201),  # Lighter green
        font=hint_font,
    )

    # Convert to bytes
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


def setup_rich_menu(access_token: str, privacy_url: str) -> str:
    """Create and set up the rich menu."""
    configuration = Configuration(access_token=access_token)

    with ApiClient(configuration) as api_client:
        messaging_api = MessagingApi(api_client)
        messaging_api_blob = MessagingApiBlob(api_client)

        # Step 1: Create rich menu
        print("Creating rich menu...")
        rich_menu_request = RichMenuRequest(
            size=RichMenuSize(width=RICH_MENU_WIDTH, height=RICH_MENU_HEIGHT),
            selected=False,
            name="Privacy Policy Menu",
            chatBarText="メニュー",
            areas=[
                RichMenuArea(
                    bounds=RichMenuBounds(
                        x=0,
                        y=0,
                        width=RICH_MENU_WIDTH,
                        height=RICH_MENU_HEIGHT,
                    ),
                    action=URIAction(
                        label="プライバシーポリシー",
                        uri=privacy_url,
                    ),
                )
            ],
        )

        result = messaging_api.create_rich_menu(rich_menu_request)
        rich_menu_id = result.rich_menu_id
        print(f"Rich menu created: {rich_menu_id}")

        # Step 2: Upload image
        print("Generating and uploading image...")
        image_data = create_rich_menu_image()
        messaging_api_blob.set_rich_menu_image(
            rich_menu_id=rich_menu_id,
            body=image_data,
            _headers={"Content-Type": "image/png"},
        )
        print("Image uploaded successfully")

        # Step 3: Set as default
        print("Setting as default rich menu...")
        messaging_api.set_default_rich_menu(rich_menu_id)
        print("Rich menu set as default")

        return rich_menu_id


def delete_existing_default_menu(access_token: str) -> None:
    """Delete existing default rich menu if present."""
    configuration = Configuration(access_token=access_token)

    with ApiClient(configuration) as api_client:
        messaging_api = MessagingApi(api_client)

        try:
            # Get current default
            default_menu = messaging_api.get_default_rich_menu_id()
            if default_menu and default_menu.rich_menu_id:
                print(f"Deleting existing default menu: {default_menu.rich_menu_id}")
                messaging_api.delete_rich_menu(default_menu.rich_menu_id)
                print("Deleted successfully")
        except Exception as e:
            # No default menu exists
            print(f"No existing default menu (or error): {e}")


def main():
    parser = argparse.ArgumentParser(description="Setup LINE Rich Menu with Privacy Policy link")
    parser.add_argument(
        "--privacy-url",
        default=DEFAULT_PRIVACY_URL,
        help=f"Privacy policy URL (default: {DEFAULT_PRIVACY_URL})",
    )
    parser.add_argument(
        "--delete-existing",
        action="store_true",
        help="Delete existing default rich menu before creating new one",
    )
    args = parser.parse_args()

    # Load environment variables
    load_dotenv()

    access_token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
    if not access_token:
        print("Error: LINE_CHANNEL_ACCESS_TOKEN environment variable is required")
        sys.exit(1)

    print(f"Privacy Policy URL: {args.privacy_url}")

    if args.delete_existing:
        delete_existing_default_menu(access_token)

    rich_menu_id = setup_rich_menu(access_token, args.privacy_url)

    print("\n" + "=" * 50)
    print("Setup completed!")
    print(f"Rich Menu ID: {rich_menu_id}")
    print("=" * 50)


if __name__ == "__main__":
    main()
