# Code Style and Conventions

## Python Style

### Formatter: Ruff
- Line length: 120 characters
- Target version: Python 3.11
- Quote style: double quotes
- Indent style: spaces (4)

### Linting Rules (Ruff)
- `E`: pycodestyle errors
- `F`: Pyflakes
- `W`: pycodestyle warnings
- `I`: isort (import sorting)
- `UP`: pyupgrade

### Configuration
See `ruff.toml`:
```toml
line-length = 120
target-version = "py311"

[lint]
select = ["E", "F", "W", "I", "UP"]
ignore = ["E501"]  # line too long handled by formatter

[format]
quote-style = "double"
indent-style = "space"
```

## Comments and Documentation

From CLAUDE.md:
> Write code comments primarily in English. Limit comments to areas where the implementation is not immediately clear upon glance. If extensive comments are required, it likely indicates inconsistencies in the design or implementation.

## Design Principles

From CLAUDE.md:
- Design first before implementation, get approval before proceeding
- Prefer simple implementations that are highly readable and easy to understand
- Avoid over-engineering
- Design with the overall optimal solution in mind, not just local optimum
- If uncertain, organize the pros and cons of each option and discuss them

## Pre-commit Hooks

Configured in `.pre-commit-config.yaml`:
1. **Terraform**: fmt, validate, tflint
2. **Secret detection**: gitleaks
3. **General**: trailing-whitespace, end-of-file-fixer, check-yaml, check-json
4. **YAML**: yamllint
5. **Markdown**: markdownlint (with auto-fix)
6. **Python**: ruff (lint + format, with auto-fix)

## Naming Conventions

- Functions: `snake_case`
- Classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Private functions: `_prefixed_with_underscore`
