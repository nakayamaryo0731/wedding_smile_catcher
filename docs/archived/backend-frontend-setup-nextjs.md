# Backend/Frontend開発環境セットアップガイド

このドキュメントは、Backend（Python）およびFrontend（TypeScript/Next.js）の実装を開始する際に必要な開発環境のセットアップ手順を記載しています。

**重要**: これらの設定は、実際に Backend/Frontend の実装を開始する際に実行してください。

---

## Python Backend セットアップ

### 1. Python環境構築

```bash
# Python 3.11以上を推奨
python --version

# 仮想環境作成
cd /Users/ron/Dev/wedding_smile_catcher
python -m venv venv

# 仮想環境を有効化
source venv/bin/activate  # macOS/Linux
# または
# venv\Scripts\activate   # Windows
```

### 2. 依存関係管理ツールのインストール

#### Option A: Poetry（推奨）

```bash
# Poetry インストール
curl -sSL https://install.python-poetry.org | python3 -

# プロジェクト初期化
poetry init

# 主要な依存関係
poetry add functions-framework google-cloud-vision google-cloud-firestore google-cloud-storage pillow imagehash
poetry add --group dev black ruff mypy pytest pytest-cov
```

#### Option B: pip + requirements.txt

```bash
# requirements.txtを作成
cat > requirements.txt <<EOF
functions-framework==3.5.0
google-cloud-vision==3.7.0
google-cloud-firestore==2.16.0
google-cloud-storage==2.16.0
google-cloud-aiplatform==1.47.0
pillow==10.2.0
imagehash==4.3.1
EOF

# 開発用requirements-dev.txtを作成
cat > requirements-dev.txt <<EOF
-r requirements.txt
black==24.2.0
ruff==0.3.0
mypy==1.9.0
pytest==8.1.0
pytest-cov==4.1.0
EOF

# インストール
pip install -r requirements-dev.txt
```

### 3. Linter/Formatter設定

#### Black設定（pyproject.toml）

```toml
[tool.black]
line-length = 88
target-version = ['py311']
include = '\.pyi?$'
exclude = '''
/(
    \.git
  | \.venv
  | venv
  | build
  | dist
)/
'''
```

#### Ruff設定（pyproject.toml）

```toml
[tool.ruff]
line-length = 88
target-version = "py311"

[tool.ruff.lint]
select = [
    "E",   # pycodestyle errors
    "W",   # pycodestyle warnings
    "F",   # pyflakes
    "I",   # isort
    "B",   # flake8-bugbear
    "C4",  # flake8-comprehensions
    "UP",  # pyupgrade
]
ignore = []

[tool.ruff.lint.isort]
known-first-party = ["src"]
```

#### Mypy設定（pyproject.toml）

```toml
[tool.mypy]
python_version = "3.11"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
```

#### Pytest設定（pyproject.toml）

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = "--cov=src --cov-report=html --cov-report=term-missing"
```

### 4. pre-commitフックの有効化

`.pre-commit-config.yaml`内のPythonセクションのコメントを外す：

```yaml
# Python hooks (uncomment when implementing backend)
- repo: https://github.com/psf/black
  rev: 24.2.0
  hooks:
    - id: black
      language_version: python3.11

- repo: https://github.com/astral-sh/ruff-pre-commit
  rev: v0.3.0
  hooks:
    - id: ruff
      args: [--fix]
    - id: ruff-format

- repo: https://github.com/pre-commit/mirrors-mypy
  rev: v1.9.0
  hooks:
    - id: mypy
      additional_dependencies: [types-all]
```

### 5. Makefileコマンド追加

`Makefile`に以下を追加：

```makefile
# Python
py-fmt:
 black src/ tests/
 ruff check --fix src/ tests/

py-lint:
 ruff check src/ tests/
 mypy src/

py-test:
 pytest
```

### 6. GitHub Actions追加

`.github/workflows/python.yml`を作成：

```yaml
name: Python CI

on:
  pull_request:
    paths:
      - 'src/**/*.py'
      - 'tests/**/*.py'
      - 'requirements.txt'
  push:
    branches:
      - main
    paths:
      - 'src/**/*.py'
      - 'tests/**/*.py'
      - 'requirements.txt'

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install -r requirements-dev.txt

      - name: Format check
        run: black --check src/ tests/

      - name: Lint
        run: ruff check src/ tests/

      - name: Type check
        run: mypy src/

      - name: Test
        run: pytest --cov --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage.xml
```

---

## TypeScript/Next.js Frontend セットアップ

### 1. Node.js環境構築

```bash
# Node.js 20.x以上を推奨
node --version
npm --version

# プロジェクトディレクトリ作成
mkdir -p src/frontend
cd src/frontend
```

### 2. Next.jsプロジェクト初期化

```bash
# Next.js with TypeScript
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*"
```

### 3. 開発用依存関係のインストール

```bash
# Linter/Formatter
npm install --save-dev eslint prettier eslint-config-prettier eslint-plugin-prettier

# Testing
npm install --save-dev jest @testing-library/react @testing-library/jest-dom @testing-library/user-event

# TypeScript types
npm install --save-dev @types/node @types/react @types/react-dom
```

### 4. ESLint設定

`.eslintrc.json`:

```json
{
  "extends": [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "plugins": ["@typescript-eslint", "prettier"],
  "rules": {
    "prettier/prettier": "error",
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

### 5. Prettier設定

`.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 80,
  "arrowParens": "always"
}
```

`.prettierignore`:

```
node_modules
.next
out
build
dist
```

### 6. TypeScript設定強化

`tsconfig.json`を厳格化：

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    // ... その他のNext.js設定
  }
}
```

### 7. Jest設定

`jest.config.js`:

```javascript
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
}

module.exports = createJestConfig(customJestConfig)
```

### 8. pre-commitフック有効化

`.pre-commit-config.yaml`内のTypeScriptセクションのコメントを外す：

```yaml
# JavaScript/TypeScript hooks (uncomment when implementing frontend)
- repo: https://github.com/pre-commit/mirrors-prettier
  rev: v4.0.0-alpha.8
  hooks:
    - id: prettier
      types_or: [javascript, jsx, ts, tsx, json, yaml, markdown]

- repo: https://github.com/pre-commit/mirrors-eslint
  rev: v9.0.0-beta.2
  hooks:
    - id: eslint
      files: \.[jt]sx?$
      types: [file]
```

### 9. package.json scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "lint:fix": "next lint --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

### 10. Makefile追加

`Makefile`に以下を追加：

```makefile
# Frontend
fe-install:
 cd src/frontend && npm install

fe-dev:
 cd src/frontend && npm run dev

fe-build:
 cd src/frontend && npm run build

fe-test:
 cd src/frontend && npm test

fe-lint:
 cd src/frontend && npm run lint

fe-format:
 cd src/frontend && npm run format
```

### 11. GitHub Actions追加

`.github/workflows/frontend.yml`:

```yaml
name: Frontend CI

on:
  pull_request:
    paths:
      - 'src/frontend/**'
  push:
    branches:
      - main
    paths:
      - 'src/frontend/**'

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: src/frontend/package-lock.json

      - name: Install dependencies
        working-directory: ./src/frontend
        run: npm ci

      - name: Format check
        working-directory: ./src/frontend
        run: npm run format:check

      - name: Lint
        working-directory: ./src/frontend
        run: npm run lint

      - name: Type check
        working-directory: ./src/frontend
        run: npx tsc --noEmit

      - name: Test
        working-directory: ./src/frontend
        run: npm test -- --coverage

      - name: Build
        working-directory: ./src/frontend
        run: npm run build
```

---

## Dependabot設定の更新

`.github/dependabot.yml`内のPython/Node.jsセクションのコメントを外す。

---

## セットアップ完了チェックリスト

### Backend（Python）
- [ ] Python仮想環境作成
- [ ] 依存関係インストール（Poetry or pip）
- [ ] pyproject.toml設定
- [ ] pre-commitフック有効化
- [ ] Makefileコマンド追加
- [ ] GitHub Actions設定
- [ ] Dependabot有効化

### Frontend（TypeScript/Next.js）
- [ ] Node.js環境確認
- [ ] Next.jsプロジェクト初期化
- [ ] ESLint/Prettier設定
- [ ] Jest設定
- [ ] pre-commitフック有効化
- [ ] package.json scripts設定
- [ ] Makefileコマンド追加
- [ ] GitHub Actions設定
- [ ] Dependabot有効化

---

## トラブルシューティング

### Pythonエラー

**ModuleNotFoundError**
```bash
# 仮想環境を有効化しているか確認
which python  # venv/bin/python になっているはず

# 依存関係を再インストール
pip install -r requirements-dev.txt
```

**mypy型エラー**
```bash
# 型スタブをインストール
mypy --install-types
```

### TypeScript/Node.jsエラー

**Module not found**
```bash
# node_modules を削除して再インストール
rm -rf node_modules package-lock.json
npm install
```

**ESLint/Prettier競合**
```bash
# eslint-config-prettierが正しくインストールされているか確認
npm list eslint-config-prettier
```

---

## 参考リンク

### Python
- [Black](https://black.readthedocs.io/)
- [Ruff](https://docs.astral.sh/ruff/)
- [mypy](https://mypy.readthedocs.io/)
- [pytest](https://docs.pytest.org/)

### TypeScript/Next.js
- [Next.js](https://nextjs.org/docs)
- [ESLint](https://eslint.org/docs/latest/)
- [Prettier](https://prettier.io/docs/en/)
- [Jest](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
