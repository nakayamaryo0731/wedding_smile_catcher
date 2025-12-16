# Wedding Smile Catcher Project Retrospective

## 1. Project Overview

| Item | Value |
|------|-------|
| Total Commits | 235 |
| Main Code Lines | ~2,850 (webhook: 384, scoring: 1,081, frontend: 1,389) |
| GitHub Actions | 5 workflows (CI, deploy-frontend, deploy-functions, etc.) |
| Testing | Unit tests (pytest) + Integration + Load tests (locust) |

---

## 2. Original Design vs Actual Implementation

| Component | Original | Actual | Eval |
|-----------|----------|--------|------|
| **Backend** | Cloud Functions (Python) | Same | ✅ |
| **Frontend** | Cloud Run (Next.js) | Firebase Hosting (Vanilla JS) | 🔄 |
| **AI Evaluation** | Gemini 1.5 Pro | gemini-2.5-flash | 🔄 |
| **Database** | Firestore | Firestore | ✅ |
| **Image Storage** | Cloud Storage | Cloud Storage | ✅ |
| **IaC** | Terraform | Terraform (modular) | ✅ |
| **CI/CD** | TBD | GitHub Actions | ✅ |

---

## 3. Technology Selection Evaluation

### ✅ What Worked Well

#### 1. Python for Cloud Functions

- Excellent library support for Vision API, Vertex AI, Pillow
- imagehash integration was straightforward
- Fast development speed

#### 2. Firebase Hosting (Vanilla JS) - Changed from Next.js

- Next.js was overkill (no SSR needed, no routing needed)
- No build process, instant deployment
- Implemented all features in ~1,400 lines
- Low maintenance cost

#### 3. Terraform Modules Structure

- Each resource (storage, firestore, functions, iam) modularized
- High reusability and readability

#### 4. Firestore Real-time Listeners

- No polling needed on frontend
- Smooth real-time updates

#### 5. Parallel API Processing

- Vision API, Vertex AI, Average Hash via `ThreadPoolExecutor`
- Contributed to reduced processing time

### ⚠️ Areas for Improvement

#### 1. Testing Strategy

- Unit tests are comprehensive, but E2E tests are minimal
- No automated LINE Bot integration testing

#### 2. Multi-event Support

- `CURRENT_EVENT_ID` managed via environment variables
- Requires redeployment for concurrent events

#### 3. Error Handling Redundancy

- Retry logic implemented separately for both Vision API and Vertex AI
- Opportunity for consolidation

---

## 4. What Would We Change If Starting Over

### Keep As-Is

- **Cloud Functions (Python)**: Correct choice
- **Firestore + Cloud Storage**: Optimal for GCP
- **Terraform modules**: Good structure
- **GitHub Actions CI/CD**: Functioning well

### Changes to Consider

#### 1. Frontend: Keep Vanilla JS

- Next.js was unnecessary
- React/Vue would also be overkill
- **Conclusion**: Vanilla JS + Firebase Hosting was the optimal choice

#### 2. AI Evaluation Model

- `gemini-2.5-flash` is sufficiently fast and high quality
- Good cost-performance balance
- **Consider**: Evaluate `gemini-2.0-flash` in future

#### 3. Multi-tenant Support

- Event ID managed via environment variable instead of path parameter
- **Improvement**: Single deployment receiving event_id in request body

#### 4. Similar Image Detection

- Average Hash is lightweight but may have false positives
- **Consider**: Also use pHash (perceptual hash)

#### 5. Frontend Framework Options

```text
Options:
├── Vanilla JS (current) ← Simple, sufficient
├── Svelte/SvelteKit ← Compile-time optimization, small bundle
├── htmx + alpine.js ← Even simpler
└── Next.js/React ← Overkill ❌
```

---

## 5. Recommended Architecture (If Starting Over)

```text
┌─────────────────────────────────────────────────┐
│                  LINE Bot                        │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│           Cloud Functions (Python)               │
│  ┌─────────────┐  ┌─────────────────────────┐   │
│  │   Webhook   │  │       Scoring           │   │
│  │  (HTTP)     │──▶│ Vision + Gemini + Hash │   │
│  └─────────────┘  └─────────────────────────┘   │
└─────────────────────┬───────────────────────────┘
                      │
     ┌────────────────┼────────────────┐
     ▼                ▼                ▼
┌─────────┐    ┌──────────┐    ┌─────────────┐
│Firestore│    │  Cloud   │    │   Firebase  │
│         │    │ Storage  │    │  Hosting    │
│ users   │    │  images  │    │ Vanilla JS  │
│ images  │    │          │    │             │
└─────────┘    └──────────┘    └─────────────┘
```

**No Changes Needed** - Current architecture is optimal

---

## 6. Cost Estimate

| Service | Monthly Estimate |
|---------|-----------------|
| Cloud Functions | $0-5 |
| Cloud Vision API | $0 (within free tier) |
| Vertex AI (Gemini Flash) | $5-15 |
| Firestore | $0-1 |
| Cloud Storage | $0-1 |
| Firebase Hosting | $0 |
| **Total** | **$5-22/event** |

---

## 7. Conclusion

**Technology selection was mostly appropriate.**
The decision to change frontend from Next.js to Vanilla JS was correct.

### If Doing It Again

1. Choose Vanilla JS from the start (skip Next.js consideration)
2. Incorporate multi-tenant support in initial design
3. Consider E2E test automation earlier

### Key Takeaway

> "Simple requirements deserve simple technology"
>
> Single page, real-time updates, static hosting
> → Vanilla JS + Firebase Hosting is sufficient

---

## 8. Technical Details

### Scoring Algorithm

```text
Total Score = (Smile Score × AI Score ÷ 100) × Similarity Penalty

Where:
- Smile Score: Sum of joy likelihood scores for all faces (Vision API)
- AI Score: Theme relevance score 0-100 (Vertex AI Gemini)
- Similarity Penalty: 1.0 (unique) or 0.33 (similar to previous upload)
```

### Face Size Multiplier

- 5%+ of image area: 1.0x (full score)
- 2-5%: 0.7-1.0x (interpolated)
- 1-2%: 0.4-0.7x (interpolated)
- <1%: 0.4x (minimum)

### Average Hash Similarity

- 8x8 grayscale hash (64 bits)
- Hamming distance threshold: 8
- Similar images receive 1/3 penalty

---

## 9. Project Timeline Highlights

- **Phase 1**: Core backend (Cloud Functions webhook + scoring)
- **Phase 2**: Data layer (Firestore, Cloud Storage, Terraform)
- **Phase 3**: Frontend (Changed from Next.js to Vanilla JS)
- **Phase 4**: CI/CD (GitHub Actions workflows)
- **Phase 5**: Iteration (Performance, UX improvements, slideshow mode)

---

## 10. Files Structure

```text
wedding_smile_catcher/
├── src/
│   ├── functions/
│   │   ├── webhook/main.py    # LINE webhook handler (384 lines)
│   │   └── scoring/main.py    # Scoring logic (1,081 lines)
│   └── frontend/
│       ├── index.html
│       ├── css/style.css
│       └── js/
│           ├── app.js         # Main application (1,389 lines)
│           ├── config.js      # Firebase config
│           └── admin.js       # Admin panel
├── terraform/
│   ├── main.tf
│   └── modules/
│       ├── storage/
│       ├── firestore/
│       ├── functions/
│       ├── iam/
│       └── secret_manager/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── load/
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy-frontend.yml
│   ├── deploy-functions.yml
│   └── unit-tests.yml
└── docs/
    ├── architecture/
    │   ├── overview.md
    │   └── scoring.md
    └── retrospective.md (this file)
```
