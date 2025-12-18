# Suggested Commands

## Initial Setup
```bash
# Install pre-commit hooks
make setup

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements-dev.txt
```

## Code Quality

### Formatting (Ruff)
```bash
# Format code
ruff format src/ tests/

# Check formatting without modifying
ruff format --check src/ tests/
```

### Linting (Ruff)
```bash
# Run linter
ruff check src/ tests/

# Auto-fix issues
ruff check --fix src/ tests/
```

### Pre-commit Hooks
```bash
# Run all pre-commit checks
pre-commit run --all-files

# Run specific hook
pre-commit run ruff --all-files
```

## Testing

### Unit Tests
```bash
# Run unit tests
pytest tests/unit/ -v

# With coverage
pytest tests/unit/ -v --cov=src --cov-report=term-missing
```

### Integration Tests (requires Firestore emulator)
```bash
# Start emulator
firebase emulators:start --only firestore --project=wedding-smile-catcher-test

# Run integration tests
FIRESTORE_EMULATOR_HOST=localhost:8080 pytest tests/integration/ -v
```

## Terraform

```bash
# Initialize
make tf-init  # or: cd terraform && terraform init

# Plan changes
make tf-plan  # or: cd terraform && terraform plan

# Apply changes
make tf-apply  # or: cd terraform && terraform apply

# Format
make tf-fmt  # or: cd terraform && terraform fmt -recursive

# Validate
make tf-validate  # or: cd terraform && terraform validate

# Lint
make tf-lint  # or: cd terraform && tflint
```

## Deployment

### Cloud Functions
```bash
# Deploy via GitHub Actions (push to main branch)
# Or use: ./scripts/deploy-functions.sh
```

### Frontend (Firebase Hosting)
```bash
cd src/frontend
firebase deploy --only hosting
```

## Utility Scripts
```bash
# Create event
python scripts/create_event.py

# List events
python scripts/list_events.py

# Switch event
./scripts/switch_event.sh <event_id>

# Download event images
./scripts/download_event_images.sh <event_id>

# Export event data
python scripts/export_event_data.py <event_id>

# Rescore images
python scripts/rescore_images.py <event_id>
```

## Cleanup
```bash
make clean
```
