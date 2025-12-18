# Project Overview

## Wedding Smile Catcher

A LINE Bot system for wedding receptions that collects smile photos from guests and scores them using AI.

### Core Purpose
- Gamification through AI scoring encourages guests to take and share photos
- Promotes interaction between guest groups
- Higher scores require more people in the photo with genuine smiles

### Tech Stack
- **Language**: Python 3.11
- **Cloud Platform**: Google Cloud Platform (GCP)
- **Infrastructure as Code**: Terraform
- **Frontend**: Vanilla JS + Firebase Hosting

### GCP Services Used
| Service | Purpose |
|---------|---------|
| Cloud Functions | Webhook handling, Scoring logic |
| Cloud Vision API | Smile detection |
| Vertex AI (Gemini 1.5) | Theme evaluation |
| Cloud Storage | Image storage |
| Firestore | User info, image metadata, scores, rankings |
| Cloud Run | Frontend hosting |

### Scoring Algorithm
```
Total Score = (Smile Score × AI Score ÷ 100) × Similarity Penalty
```

Components:
1. **Smile Score** (Vision API): Sum of joy likelihood scores for all faces
2. **AI Evaluation** (Vertex AI): Theme relevance score (0-100)
3. **Similarity Penalty** (Average Hash): 1/3 penalty for similar images

### Key Design Principles
- Encourage group interaction: more people = higher potential score
- Prevent spam: similar images get penalty
- One-time event: reliability and thorough testing are critical
