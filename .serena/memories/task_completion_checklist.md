# Task Completion Checklist

## Before Committing Code

### 1. Code Quality
```bash
# Format code
ruff format src/ tests/

# Lint code
ruff check src/ tests/
```

### 2. Tests
```bash
# Run unit tests
pytest tests/unit/ -v

# Run integration tests (if applicable)
FIRESTORE_EMULATOR_HOST=localhost:8080 pytest tests/integration/ -v
```

### 3. Pre-commit Hooks
```bash
# Run all hooks
pre-commit run --all-files
```

### 4. Terraform (if changed)
```bash
# Format
cd terraform && terraform fmt -recursive

# Validate
cd terraform && terraform validate

# Plan (review changes)
cd terraform && terraform plan
```

## CI Checks (Automatically Run on PR)

1. **Python** (if `src/**` changed):
   - `ruff format --check src/`
   - `ruff check src/`

2. **Terraform** (if `terraform/**` changed):
   - `terraform fmt -check -recursive`
   - `terraform validate`
   - `tflint`
   - `terraform plan` (posted as PR comment)

3. **Unit Tests** (on push/PR to main/develop):
   - `pytest tests/unit/ -v --cov=src`
   - `ruff format --check src/ tests/`
   - `ruff check src/ tests/`

4. **Integration Tests** (on push/PR to main/develop):
   - Firestore emulator started
   - `pytest tests/integration/ -v`

## After Merging

- GitHub Actions will automatically:
  - Deploy Cloud Functions (on changes to `src/functions/**`)
  - Deploy Frontend (on changes to `src/frontend/**`)
  - Apply Terraform (manual approval required)
