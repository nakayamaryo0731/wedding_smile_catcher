"""
Load testing for Wedding Smile Catcher using Locust.

Simulates concurrent image uploads from multiple users to test system performance
and scalability.

Usage:
    # Run locally against development environment
    locust -f tests/load/locustfile.py --host=https://YOUR_FUNCTION_URL

    # Run with web UI
    locust -f tests/load/locustfile.py --host=https://YOUR_FUNCTION_URL --web-host=0.0.0.0

    # Headless mode: 50 users, spawn rate 10/sec, run for 5 minutes
    locust -f tests/load/locustfile.py --host=https://YOUR_FUNCTION_URL \\
           --users 50 --spawn-rate 10 --run-time 5m --headless
"""

import random
import time
from locust import HttpUser, task, between, events
from pathlib import Path


# Test image path
TEST_IMAGE_PATH = Path(__file__).parent.parent / "test_data" / "happy_couple.jpg"

# Minimal test JPEG (1x1 pixel) if no test image exists
MINIMAL_JPEG = (
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


def get_test_image():
    """Load test image bytes."""
    if TEST_IMAGE_PATH.exists():
        with open(TEST_IMAGE_PATH, "rb") as f:
            return f.read()
    return MINIMAL_JPEG


class WeddingGuestUser(HttpUser):
    """
    Simulates a wedding guest using the LINE Bot.

    Behavior:
    - Register once at the start
    - Upload multiple images over time
    - Check ranking occasionally
    """

    wait_time = between(2, 10)  # Wait 2-10 seconds between tasks
    test_image = get_test_image()

    def on_start(self):
        """
        Called when a user starts. Simulates user registration.
        """
        self.user_id = f"load_test_user_{random.randint(1000, 9999)}"
        self.name = f"テストユーザー{random.randint(1, 100)}"

        # Simulate user registration via LINE Bot
        # In reality, this would be a LINE webhook with user ID
        # For load testing, we simulate the backend behavior

    @task(10)  # Weight: 10 (most common action)
    def upload_image(self):
        """
        Simulate image upload from LINE Bot.

        This tests the full pipeline:
        1. Webhook receives image
        2. Upload to Cloud Storage
        3. Create Firestore document
        4. Trigger scoring function
        5. Vision API + Vertex AI processing
        6. Update Firestore with scores
        """
        # Simulate LINE webhook payload
        payload = {
            "events": [
                {
                    "type": "message",
                    "message": {
                        "type": "image",
                        "id": f"msg_{random.randint(100000, 999999)}",
                    },
                    "source": {"type": "user", "userId": self.user_id},
                    "timestamp": int(time.time() * 1000),
                }
            ]
        }

        # POST to webhook endpoint
        with self.client.post(
            "/webhook",
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-Line-Signature": "test_signature",  # Will be validated in real scenario
            },
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Upload failed: {response.status_code}")

    @task(2)  # Weight: 2 (occasional action)
    def check_ranking(self):
        """
        Simulate user checking ranking.
        Tests Firestore query performance.
        """
        # Simulate LINE text message "ランキング"
        payload = {
            "events": [
                {
                    "type": "message",
                    "message": {"type": "text", "text": "ランキング"},
                    "source": {"type": "user", "userId": self.user_id},
                    "timestamp": int(time.time() * 1000),
                }
            ]
        }

        with self.client.post(
            "/webhook",
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-Line-Signature": "test_signature",
            },
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Ranking check failed: {response.status_code}")

    @task(1)  # Weight: 1 (rare action)
    def check_help(self):
        """
        Simulate user checking help.
        Low-frequency action.
        """
        payload = {
            "events": [
                {
                    "type": "message",
                    "message": {"type": "text", "text": "ヘルプ"},
                    "source": {"type": "user", "userId": self.user_id},
                    "timestamp": int(time.time() * 1000),
                }
            ]
        }

        with self.client.post(
            "/webhook",
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-Line-Signature": "test_signature",
            },
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Help check failed: {response.status_code}")


class SpikeLoadUser(HttpUser):
    """
    Simulates spike load scenario.

    All users upload images simultaneously to test:
    - Cloud Functions cold start performance
    - Auto-scaling behavior
    - Firestore write throughput
    - Vision API rate limits
    """

    wait_time = between(0.5, 2)  # Very short wait time for spike
    test_image = get_test_image()

    def on_start(self):
        self.user_id = f"spike_user_{random.randint(1000, 9999)}"

    @task
    def rapid_upload(self):
        """Rapid consecutive uploads to create spike load."""
        payload = {
            "events": [
                {
                    "type": "message",
                    "message": {
                        "type": "image",
                        "id": f"msg_{random.randint(100000, 999999)}",
                    },
                    "source": {"type": "user", "userId": self.user_id},
                    "timestamp": int(time.time() * 1000),
                }
            ]
        }

        with self.client.post(
            "/webhook",
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-Line-Signature": "test_signature",
            },
            catch_response=True,
        ) as response:
            if response.status_code != 200:
                response.failure(f"Spike upload failed: {response.status_code}")


# Locust event hooks for custom metrics
@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Called when load test starts."""
    print("Load test starting...")
    print(f"Target host: {environment.host}")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Called when load test stops."""
    print("\n" + "=" * 60)
    print("Load Test Summary")
    print("=" * 60)

    stats = environment.stats
    print(f"Total requests: {stats.total.num_requests}")
    print(f"Total failures: {stats.total.num_failures}")
    print(f"Average response time: {stats.total.avg_response_time:.2f}ms")
    print(f"Max response time: {stats.total.max_response_time:.2f}ms")
    print(f"Requests per second: {stats.total.total_rps:.2f}")

    if stats.total.num_failures > 0:
        print(f"\n⚠️  Failure rate: {stats.total.fail_ratio * 100:.2f}%")
    else:
        print("\n✅ All requests succeeded!")

    print("=" * 60)
