.PHONY: help setup fmt lint validate test clean install-hooks tf-init tf-plan tf-apply

# Default target
help:
	@echo "Wedding Smile Catcher - Makefile Commands"
	@echo ""
	@echo "Setup & Installation:"
	@echo "  make setup          - Initial project setup (install hooks, etc.)"
	@echo "  make install-hooks  - Install pre-commit hooks"
	@echo ""
	@echo "Formatting & Linting:"
	@echo "  make fmt            - Format all code (Terraform)"
	@echo "  make lint           - Run linters (Terraform, YAML)"
	@echo "  make validate       - Validate configurations"
	@echo ""
	@echo "Terraform:"
	@echo "  make tf-init        - Initialize Terraform"
	@echo "  make tf-plan        - Run Terraform plan"
	@echo "  make tf-apply       - Apply Terraform changes"
	@echo "  make tf-fmt         - Format Terraform files"
	@echo "  make tf-validate    - Validate Terraform configuration"
	@echo "  make tf-lint        - Run tflint"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Run all tests (TBD)"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean          - Clean temporary files"

# Setup
setup: install-hooks
	@echo "✓ Setup complete!"

install-hooks:
	@echo "Installing pre-commit hooks..."
	@command -v pre-commit >/dev/null 2>&1 || { echo "Error: pre-commit not installed. Run: brew install pre-commit"; exit 1; }
	pre-commit install
	@echo "✓ Pre-commit hooks installed"

# Formatting
fmt: tf-fmt
	@echo "✓ All files formatted"

tf-fmt:
	@echo "Formatting Terraform files..."
	cd terraform && terraform fmt -recursive

# Linting
lint: tf-lint
	@echo "✓ All linting checks passed"

tf-lint:
	@echo "Running tflint..."
	@command -v tflint >/dev/null 2>&1 || { echo "Error: tflint not installed. Run: brew install tflint"; exit 1; }
	cd terraform && tflint --init && tflint

# Validation
validate: tf-validate
	@echo "✓ All validation checks passed"

tf-validate:
	@echo "Validating Terraform configuration..."
	cd terraform && terraform validate

# Terraform
tf-init:
	@echo "Initializing Terraform..."
	cd terraform && terraform init

tf-plan:
	@echo "Running Terraform plan..."
	cd terraform && terraform plan

tf-apply:
	@echo "Applying Terraform changes..."
	cd terraform && terraform apply

# Testing (placeholder for future)
test:
	@echo "No tests configured yet"
	@echo "TODO: Add pytest for Python, Jest for TypeScript"

# Cleanup
clean:
	@echo "Cleaning temporary files..."
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	find . -type d -name ".pytest_cache" -delete
	find . -type d -name ".ruff_cache" -delete
	find . -type f -name ".DS_Store" -delete
	@echo "✓ Cleanup complete"

# CI/CD simulation (run what CI runs)
ci: fmt lint validate
	@echo "✓ CI checks passed"
