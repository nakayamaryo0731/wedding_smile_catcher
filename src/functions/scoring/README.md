# Scoring Function (Dummy Implementation)

Image scoring function for Wedding Smile Catcher.

**Note**: This is a simplified dummy implementation for integration testing. It returns random scores without calling Vision API or Vertex AI.

## Overview

This Cloud Function:
- Receives scoring requests from Webhook Function
- Generates dummy scores for testing
- Updates Firestore with results
- Sends score notification to LINE users

## Project Structure

```
scoring/
├── main.py              # Main scoring handler (dummy)
├── requirements.txt     # Python dependencies
├── .env.example         # Environment variable template
└── README.md            # This file
```

## Dummy Score Generation

The function generates random values:
- **smile_score**: 300-500 points
- **ai_score**: 70-95 points
- **face_count**: 3-7 people
- **is_similar**: Random true/false
- **total_score**: Calculated as `(smile_score × ai_score / 100) × penalty`

## Setup

### 1. Install Dependencies (Local Development)

```bash
cd src/functions/scoring
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env`:
```bash
LINE_CHANNEL_ACCESS_TOKEN=your-actual-access-token
GCP_PROJECT_ID=wedding-smile-catcher
```

### 3. Local Testing

Run with Functions Framework:

```bash
functions-framework --target=scoring --debug
```

The function will be available at: `http://localhost:8080`

Test with cURL:

```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{
    "image_id": "test-image-123",
    "user_id": "test-user-456"
  }'
```

## Deployment

### Manual Deployment

```bash
gcloud functions deploy scoring \
  --gen2 \
  --runtime=python311 \
  --region=asia-northeast1 \
  --source=. \
  --entry-point=scoring \
  --trigger-http \
  --no-allow-unauthenticated \
  --service-account=scoring-function-sa@wedding-smile-catcher.iam.gserviceaccount.com \
  --set-secrets="LINE_CHANNEL_ACCESS_TOKEN=line-channel-access-token:latest" \
  --set-env-vars="GCP_PROJECT_ID=wedding-smile-catcher" \
  --timeout=300s \
  --memory=1GB
```

**Note**: This function should NOT be publicly accessible (`--no-allow-unauthenticated`). Only the webhook function should be able to call it.

### Get Function URL

```bash
gcloud functions describe scoring \
  --gen2 \
  --region=asia-northeast1 \
  --format="value(serviceConfig.uri)"
```

Use this URL as `SCORING_FUNCTION_URL` in webhook function environment.

## API Specification

### Endpoint

```
POST /scoring
```

### Request

```json
{
  "image_id": "uuid-string",
  "user_id": "user-document-id"
}
```

### Response

**Success (200 OK)**:
```json
{
  "status": "success",
  "image_id": "uuid-string",
  "scores": {
    "smile_score": 450.5,
    "ai_score": 85,
    "total_score": 382.93,
    "comment": "これはダミーのスコアリング結果です...",
    "face_count": 5,
    "is_similar": false,
    "average_hash": "dummy_hash_1234"
  }
}
```

**Error (400 Bad Request)**:
```json
{
  "error": "Missing image_id or user_id"
}
```

**Error (500 Internal Server Error)**:
```json
{
  "status": "error",
  "error": "Error message",
  "image_id": "uuid-string"
}
```

## Integration Test Flow

1. User sends image to LINE Bot
2. Webhook Function:
   - Downloads image
   - Saves to Cloud Storage
   - Creates Firestore document (status: pending)
   - Calls Scoring Function
3. Scoring Function:
   - Generates dummy scores
   - Updates Firestore (status: completed)
   - Sends result to LINE user
4. User receives score notification

## Future Implementation

To implement real scoring, replace `generate_dummy_scores()` with:

1. **Vision API Integration**
   - Load image from Cloud Storage
   - Call `vision.face_detection()`
   - Calculate smile scores

2. **Vertex AI Integration**
   - Call Gemini model for theme evaluation
   - Parse JSON response

3. **Average Hash Calculation**
   - Calculate image hash
   - Compare with existing images
   - Determine similarity penalty

See `docs/api/scoring.md` for full specification.

## Logging

View logs:
```bash
gcloud functions logs read scoring \
  --gen2 \
  --region=asia-northeast1 \
  --limit=50
```

## Troubleshooting

### "User not found" error

- Verify user was registered via webhook function
- Check Firestore users collection

### LINE messages not sent

- Verify `LINE_CHANNEL_ACCESS_TOKEN` is valid
- Check user's `line_user_id` field in Firestore

### Firestore update failed

- Check service account has `datastore.user` role
- Verify Firestore database exists

## Related Documentation

- [API Specification](../../../docs/api/scoring.md)
- [Architecture Overview](../../../docs/architecture/overview.md)
- [Webhook Function](../webhook/README.md)
