# Project Structure

```
wedding_smile_catcher/
├── src/
│   ├── functions/          # Cloud Functions (Python)
│   │   ├── webhook/        # LINE webhook handler
│   │   │   ├── main.py
│   │   │   └── requirements.txt
│   │   └── scoring/        # Scoring logic
│   │       ├── main.py
│   │       └── requirements.txt
│   └── frontend/           # Firebase Hosting (Vanilla JS)
│       ├── index.html      # Main ranking display
│       ├── admin.html      # Admin interface
│       ├── css/
│       ├── js/
│       │   ├── app.js
│       │   ├── admin.js
│       │   └── config.js
│       └── firebase.json
│
├── terraform/              # Infrastructure as Code
│
├── tests/
│   ├── unit/              # Unit tests
│   │   ├── conftest.py
│   │   └── test_scoring.py
│   ├── integration/       # Integration tests (Firestore emulator)
│   │   ├── conftest.py
│   │   └── test_scoring_pipeline.py
│   ├── load/              # Load tests (Locust)
│   │   └── locustfile.py
│   ├── e2e/               # End-to-end tests (placeholder)
│   └── test_data/         # Test fixtures
│
├── scripts/               # Utility scripts
│   ├── create_event.py
│   ├── list_events.py
│   ├── switch_event.sh
│   ├── export_event_data.py
│   ├── rescore_images.py
│   └── ...
│
├── docs/
│   ├── architecture/      # System design docs
│   │   ├── overview.md
│   │   └── scoring.md
│   └── reference/
│       └── context.md     # MUST READ: Project background
│
├── .github/
│   ├── workflows/         # GitHub Actions
│   │   ├── ci.yml
│   │   ├── unit-tests.yml
│   │   ├── deploy-functions.yml
│   │   └── deploy-frontend.yml
│   └── ISSUE_TEMPLATE/
│
├── Makefile               # Common commands
├── requirements.txt       # Production dependencies
├── requirements-dev.txt   # Dev dependencies
├── ruff.toml             # Python linter/formatter config
├── .pre-commit-config.yaml
├── firestore.rules       # Firestore security rules
└── CLAUDE.md             # AI coding assistant guide
```

## Key Entry Points

### Cloud Functions
- `src/functions/webhook/main.py`: LINE webhook handler
- `src/functions/scoring/main.py`: Image scoring logic

### Frontend
- `src/frontend/index.html`: Real-time ranking display
- `src/frontend/admin.html`: Admin interface

### Tests
- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/` (requires Firestore emulator)
