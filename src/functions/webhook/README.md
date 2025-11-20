# Webhook Function

LINE Bot webhook handler for Wedding Smile Catcher.

## Overview

This Cloud Function handles LINE Bot webhook events:
- **Follow events**: Welcome message when users add the bot
- **Text messages**: User registration and commands
- **Image messages**: Image upload and scoring trigger

## Project Structure

```
webhook/
├── main.py              # Main webhook handler
├── requirements.txt     # Python dependencies
├── .env.example         # Environment variable template
└── README.md            # This file
```

## Setup

### 1. Install Dependencies (Local Development)

```bash
cd src/functions/webhook
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```bash
LINE_CHANNEL_SECRET=your-actual-channel-secret
LINE_CHANNEL_ACCESS_TOKEN=your-actual-access-token
GCP_PROJECT_ID=wedding-smile-catcher
STORAGE_BUCKET=wedding-smile-images
SCORING_FUNCTION_URL=https://...  # Set after deploying scoring function
```

### 3. Local Testing

Run with Functions Framework:

```bash
functions-framework --target=webhook --debug
```

The function will be available at: `http://localhost:8080`

## Deployment

### Manual Deployment

```bash
gcloud functions deploy webhook \
  --gen2 \
  --runtime=python311 \
  --region=asia-northeast1 \
  --source=. \
  --entry-point=webhook \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=webhook-function-sa@wedding-smile-catcher.iam.gserviceaccount.com \
  --set-secrets="LINE_CHANNEL_SECRET=line-channel-secret:latest,LINE_CHANNEL_ACCESS_TOKEN=line-channel-access-token:latest" \
  --set-env-vars="GCP_PROJECT_ID=wedding-smile-catcher,STORAGE_BUCKET=wedding-smile-images"
```

### Get Function URL

```bash
gcloud functions describe webhook \
  --gen2 \
  --region=asia-northeast1 \
  --format="value(serviceConfig.uri)"
```

### Configure LINE Bot Webhook

1. Go to [LINE Developers Console](https://developers.line.biz/)
2. Select your channel
3. Navigate to "Messaging API" tab
4. Set "Webhook URL" to your Cloud Function URL
5. Enable "Use webhook"
6. Disable "Auto-reply messages"

## API Specification

### Endpoint

```
POST /webhook
```

### Request Headers

```
Content-Type: application/json
X-Line-Signature: {signature}
```

### Request Body

Standard LINE Messaging API webhook format. See [LINE Documentation](https://developers.line.biz/ja/reference/messaging-api/#webhook-event-objects).

### Response

**Success (200 OK)**:
```json
{
  "status": "ok"
}
```

**Error (400 Bad Request)**:
```json
{
  "error": "Invalid signature"
}
```

## Event Handlers

### Follow Event

Triggered when a user adds the bot as a friend.

**Flow**:
1. Check if user exists in Firestore
2. Send registration guide (if new) or welcome back message (if existing)

### Text Message Event

Triggered when a user sends a text message.

**Flow**:
- **If user not registered**: Register user with text as name
- **If user registered**: Handle commands (`ヘルプ`, `ランキング`)

### Image Message Event

Triggered when a user sends an image.

**Flow**:
1. Check if user is registered
2. Send loading message
3. Download image from LINE Content API
4. Upload to Cloud Storage
5. Create Firestore document (status: pending)
6. Trigger Scoring Function (async)

## Error Handling

- **Invalid signature**: Returns 400 Bad Request
- **LINE API errors**: Logged and error message sent to user
- **Storage errors**: Logged and error message sent to user
- **Firestore errors**: Logged and error message sent to user

## Logging

All events are logged to Cloud Logging:
- User registrations
- Image uploads
- Errors and exceptions

View logs:
```bash
gcloud functions logs read webhook \
  --gen2 \
  --region=asia-northeast1 \
  --limit=50
```

## Testing

### Test with cURL

**Simulate follow event**:
```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -H "X-Line-Signature: test" \
  -d '{
    "events": [{
      "type": "follow",
      "replyToken": "test-token",
      "source": {
        "userId": "U1234567890abcdef",
        "type": "user"
      },
      "timestamp": 1234567890123
    }]
  }'
```

**Note**: Signature verification will fail in local testing unless you disable it.

## Troubleshooting

### "Invalid signature" error

- Check that `LINE_CHANNEL_SECRET` is correct
- Ensure webhook is coming from LINE platform

### "LINE API error" logs

- Verify `LINE_CHANNEL_ACCESS_TOKEN` is valid
- Check token hasn't expired

### Images not uploading

- Verify `STORAGE_BUCKET` exists
- Check service account has `storage.objects.create` permission

### Scoring function not triggered

- Verify `SCORING_FUNCTION_URL` is set correctly
- Check scoring function is deployed and accessible

## Next Steps

- Implement Scoring Function
- Add unit tests
- Set up Terraform deployment module
- Add monitoring and alerts

## Related Documentation

- [API Specification](../../../docs/api/webhook.md)
- [Architecture Overview](../../../docs/architecture/overview.md)
- [LINE Messaging API](https://developers.line.biz/ja/docs/messaging-api/)
