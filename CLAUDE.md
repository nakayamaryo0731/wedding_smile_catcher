# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wedding Smile Catcher is a LINE Bot system for wedding receptions that collects smile photos from guests and scores them using AI. The system was inspired by a chapter in エムスリーテックブック8 (AWS implementation) and is being rebuilt on GCP.

**Current Status**: Early planning/design phase. Documentation is complete but implementation has not yet started.

**Core Concept**: Gamification through AI scoring encourages guests to take and share photos, promoting interaction between guest groups. The higher the score you want, the more people need to be in the photo with genuine smiles.

## Essential Context

**IMPORTANT**: Before starting any work, read `docs/reference/context.md` - it contains the complete background, design philosophy, and technical decisions from the original AWS system.

Key design principles:
- **Encourage group interaction**: Scoring algorithm rewards photos with more people (sum all smile scores)
- **Prevent spam**: Similar images (via Average Hash) get 1/3 penalty to promote photo diversity
- **Theme relevance**: Vertex AI evaluates if photos match wedding theme (0-100 points)
- **One-time event**: Wedding ceremonies happen once, so reliability and thorough testing are critical

## Architecture

### System Flow
```
LINE Bot → Cloud Functions (Webhook) → Cloud Storage + Firestore
                                    ↓
                        Cloud Functions (Scoring)
                        - Vision API: smile detection
                        - Vertex AI (Gemini): theme evaluation
                        - Average Hash: similarity check
                                    ↓
                        LINE Bot (reply) + Firestore (ranking)
                                    ↓
                        Cloud Run (Next.js) - Real-time display on venue screen
```

### GCP Services Mapping

| Function | Service | Purpose |
|----------|---------|---------|
| Webhook processing | Cloud Functions | Receive LINE messages, register users, save images |
| Image scoring | Cloud Functions | Execute scoring algorithm |
| Smile detection | Cloud Vision API | Detect faces and joy likelihood |
| Theme evaluation | Vertex AI (Gemini 1.5) | Evaluate image relevance (0-100) |
| Image storage | Cloud Storage | Store original photos |
| Database | Firestore | User info, image metadata, scores, rankings |
| Frontend | Cloud Run (Next.js) | Real-time display and ranking screens |
| Infrastructure | Terraform | IaC management |

### Project Structure

```
wedding_smile_catcher/
├── docs/
│   ├── architecture/
│   │   ├── overview.md          # System architecture diagram and components
│   │   └── scoring.md           # Detailed scoring algorithm explanation
│   └── reference/
│       └── context.md           # MUST READ: Complete project background
├── src/
│   ├── functions/               # Cloud Functions (not yet implemented)
│   │   ├── webhook/            # LINE webhook handler
│   │   └── scoring/            # Scoring logic
│   ├── frontend/                # Next.js app (not yet implemented)
│   └── common/                  # Shared libraries (not yet implemented)
└── terraform/                   # Infrastructure code (empty)
```

## Scoring Algorithm

The core of the system. Detailed specs in `docs/architecture/scoring.md`.

### Formula
```
Total Score = (Smile Score × AI Score ÷ 100) × Similarity Penalty
```

### Components

1. **Smile Score** (Vision API)
   - Detects all faces in image
   - Sums joy likelihood scores (0-100 per face)
   - More people = higher potential score
   - Example: 5 people with big smiles = ~450-500 points

2. **AI Evaluation** (Vertex AI)
   - Gemini 1.5 evaluates image against wedding theme
   - Returns 0-100 score + comment
   - Acts as multiplier (0 = no score, 100 = full score)
   - **Critical**: Use Gemini or Amazon Nova; GPT-4o tends to give inflated scores

3. **Similarity Penalty** (Average Hash)
   - Computes 8×8 average hash for each image
   - Compares via Hamming distance (threshold: 8)
   - Similar image detected → score × 1/3
   - Prevents consecutive shots from dominating

## Implementation Language (TBD)

Original AWS system used Rust. This GCP version will likely use:
- **Python**: For Cloud Functions (better library support for image processing, Pillow, imagehash)
- **TypeScript**: For Next.js frontend

No code has been written yet - language choice is still flexible.

## Development Workflow (When Implementation Starts)

### Phase 1: Core Backend
1. Set up GCP project and enable APIs
2. Create Cloud Functions for webhook handling
3. Implement LINE Bot message routing (text = register name, image = scoring)
4. Integrate Cloud Vision API for smile detection
5. Integrate Vertex AI for theme evaluation
6. Implement Average Hash similarity detection

### Phase 2: Data Layer
1. Design Firestore collections (users, images, rankings)
2. Implement Firestore security rules
3. Set up Cloud Storage buckets for images

### Phase 3: Frontend
1. Create Next.js app for ranking display:
   - Top 1: Large display (main)
   - Top 2-3: Smaller side-by-side display
   - Real-time updates via Firestore listeners
2. Integrate Firestore real-time listeners
3. Deploy to Cloud Run

### Phase 4: Infrastructure
1. Write Terraform configs for all GCP resources
2. Implement deployment scripts
3. Set up monitoring and logging

## Key Technical Details

### LINE Bot Behavior
- First message from user must be their full name (text) → registers in Firestore
- Subsequent image messages trigger scoring flow
- Bot shows loading animation immediately (UX improvement while AI processes)
- Returns score + AI-generated comment after processing

### Ranking Display
**Important**: Same person cannot appear multiple times in top rankings
- Fetch top 100 images via Firestore real-time listener
- Filter to unique users
- Display layout:
  - Top 1: Large display (primary focus)
  - Top 2-3: Smaller side-by-side display
- Updates automatically when new high-score photos arrive

### Testing Strategy
Since weddings are one-time events:
- Thoroughly test scoring algorithm with diverse test images
- Load test Cloud Functions with concurrent requests (~50/min peak expected)
- Dry-run with test LINE Bot before production
- Monitor system during actual event (non-intrusively)

## Documentation

All design documents are in Japanese (original requirements were in Japanese).

### Must-Read Documents
1. `docs/reference/context.md` - Complete background and design philosophy
2. `docs/architecture/overview.md` - System architecture and data flow
3. `docs/architecture/scoring.md` - Scoring algorithm with code examples
4. `README.md` - Project overview and roadmap

### Incomplete Documents
These are planned but not yet created:
- Database schema (Firestore collections)
- API specifications
- Setup guides (GCP, LINE Bot)
- Local development environment setup

## Git Workflow

Standard git workflow:
```bash
git status                    # Check current state
git add <files>              # Stage changes
git commit -m "message"      # Commit with descriptive message
git log --oneline            # View history
```

No CI/CD pipeline configured yet.

## Common Pitfalls to Avoid

Based on lessons from the original AWS system:

1. **Don't skimp on error handling**: The original system had a post-wedding bug where DynamoDB returned None, causing API crashes. Implement robust error handling everywhere.

2. **Test scoring algorithm thoroughly**: The formula heavily favors group photos. Consider tuning if needed (e.g., factor in face size to balance close-ups vs. wide shots).

3. **Model selection matters**: For AI evaluation, use Gemini or Amazon Nova. GPT-4o tends to give overly generous scores even to off-theme images.

4. **Monitor API quotas**: Vision API has free tier limits. Plan for expected load (300-500 images for 50-100 guests).

5. **Handle concurrent requests**: Peak usage will have ~50 simultaneous posts. Cloud Functions should auto-scale, but test this.

## Environment Variables (Future)

When implementation starts, these will be needed:
- `LINE_CHANNEL_SECRET` - LINE Bot authentication
- `LINE_CHANNEL_ACCESS_TOKEN` - LINE Messaging API
- `GCP_PROJECT_ID` - Google Cloud project
- `STORAGE_BUCKET` - Cloud Storage bucket name
- `GEMINI_MODEL_NAME` - Vertex AI model (e.g., "gemini-1.5-pro")

## Cost Considerations

Expected costs for single wedding (~500 images, ~100 guests):
- Cloud Functions: Minimal (free tier likely sufficient)
- Cloud Vision API: First 1000 requests/month free
- Vertex AI (Gemini): Pay-per-use (main cost driver)
- Firestore: Minimal for this scale
- Cloud Storage: Minimal
- Cloud Run: Pay-per-use, minimal for Next.js frontend

Total estimated cost: $10-30 per wedding event (primarily Vertex AI).

## Next Steps for Implementation

According to `TODO.md`, the next tasks are:
1. Complete database design document
2. Write API specifications
3. Create setup guides
4. Initialize Python/Node.js environment
5. Set up Terraform configurations
6. Begin Cloud Functions implementation

## Support

This is a personal project inspired by エムスリーテックブック8 第2章. Original system was created by 中村伊吹 for their March 2025 wedding, collecting 368 photos from ~60% of guests with zero downtime.

## Important Notes
When tackling a task, design and implement with the overall optimal solution in mind, not just a local optimum.

As a rule, design first before implementation, and only proceed with implementation after obtaining approval for the design.

Write code comments primarily in English. Limit comments to areas where the implementation is not immediately clear upon glance. If extensive comments are required, it likely indicates inconsistencies in the design or implementation. In such cases, consider revising the design.

If you have any uncertainties or concerns, resolve them before proceeding; do not leave them unaddressed.

When uncertain, organize the pros and cons of each option and discuss them.
We generally prefer simple implementations that are highly readable and easy to understand.