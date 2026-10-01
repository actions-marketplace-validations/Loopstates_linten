# Linten: Spec v2 llms.txt Auditor & Companion Compiler

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Linten-blueviolet?logo=github&style=flat-square)](https://github.com/marketplace/actions/linten)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Powered by Loopstates](https://img.shields.io/badge/Engineered%20by-Loopstates-purple?style=flat-square)](https://loopstates.com)

The definitive developer utility for auditing `llms.txt` files, checking documentation link health, budgeting frontier AI context windows, and synthesizing companion `llms-full.txt` archives directly inside your GitHub Actions CI/CD pipelines.

Engineered by **[Loopstates](https://loopstates.com)** to prevent documentation drift and guarantee AI agent readiness across your documentation suites.

---

## ⚡ Why Run Linten in CI?

When developers update documentation, add features, or refactor routes, `llms.txt` manifests quickly drift:
* **Broken Context**: Renamed URLs become 404 dead ends, starving autonomous AI agents (Cursor, Claude, OpenAI Operator) of context.
* **Syntax Violations**: Malformed markdown breaks Spec v2 parsers and crawler ingestion.
* **Token Bloat**: Oversized manifests blow past frontier LLM context limits without warning.

**Linten automates quality enforcement on every Pull Request.**

---

## 🚀 Quickstart

Add this step to your repository's `.github/workflows/docs.yml`:

```yaml
name: Documentation Audit

on:
  pull_request:
    paths:
      - '**/llms.txt'
      - 'docs/**'
  push:
    branches: [main]

jobs:
  audit-manifest:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Run Linten Audit
        uses: Loopstates/linten@v1
        with:
          path: './public/llms.txt'
          check-links: true
          fail-on-broken-links: true
```

---

## 🛠️ Inputs

| Input | Description | Required | Default |
| :--- | :--- | :--- | :--- |
| `path` | Path to the local `llms.txt` file to audit. | No | `./llms.txt` *(auto-searches `./public`, `./docs`, `./static`)* |
| `check-links` | Perform concurrent reachability probes on declared documentation URLs. | No | `true` |
| `fail-on-broken-links` | Fail the CI workflow step if any link returns a 404 or connection timeout. | No | `false` |
| `fail-on-errors` | Fail the CI workflow step if Spec v2 syntax or structural errors are detected. | No | `true` |
| `generate-full` | Automatically compile the companion `llms-full.txt` archive from declared documentation links. | No | `false` |
| `output-full` | Destination file path for the compiled `llms-full.txt` archive. | No | `./llms-full.txt` |
| `api-url` | Base URL of the Linten Cloud engine. | No | `https://linten.apps.loopstates.com` |

---

## 📤 Outputs

| Output | Description | Example |
| :--- | :--- | :--- |
| `score` | Overall Spec v2 quality score (0–100). | `96` |
| `status` | Audit status outcome. | `pass`, `warn`, `fail` |
| `total-links` | Total count of links audited in the manifest. | `42` |
| `broken-links` | Number of broken or timed-out links detected. | `0` |
| `estimated-tokens` | Estimated token count across the document. | `3420` |
| `full-archive-path` | Path where `llms-full.txt` was written (if generated). | `./public/llms-full.txt` |

---

## 📋 Comprehensive Workflow Examples

### 1. PR Gate: Prevent Broken Links & Enforce Spec v2 Quality

```yaml
name: CI Quality Gate

on:
  pull_request:
    branches: [main]

jobs:
  linten-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Audit llms.txt Quality & Links
        uses: Loopstates/linten@v1
        with:
          path: './llms.txt'
          check-links: true
          fail-on-broken-links: true
          fail-on-errors: true
```

---

### 2. Auto-Compile & Commit `llms-full.txt` on Merge to Main

```yaml
name: Compile llms-full.txt

on:
  push:
    branches: [main]
    paths:
      - '**/llms.txt'

jobs:
  compile-companion:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Compile Companion Archive
        uses: Loopstates/linten@v1
        with:
          path: './public/llms.txt'
          generate-full: true
          output-full: './public/llms-full.txt'

      - name: Commit Updated Archive
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add ./public/llms-full.txt
          git diff --quiet && git diff --staged --quiet || git commit -m "docs: sync companion llms-full.txt [skip ci]"
          git push
```

---

## 📊 Visual Job Summary in GitHub Actions

Linten automatically renders a rich, visual report directly into your GitHub Action's **Job Summary**:

* **Overall Score Badge**: 0–100 quality compliance breakdown.
* **Frontier Token Budgeting**: Live consumption gauges against context windows:
  * Google Gemini 2.0 Flash / Pro (2,000,000 tokens)
  * Anthropic Claude 3.5 Sonnet (200,000 tokens)
  * OpenAI GPT-4o (128,000 tokens)
  * DeepSeek-V3 (64,000 tokens)
* **Link Reachability Table**: Full breakdown of HTTP status codes, redirect destinations, and sub-second latencies.

---

## 🔒 Security & Privacy

* **Zero Arbitrary Repository Access**: Linten reads only the single file specified in `path`. It never scans, uploads, or indexes your source code.
* **Deterministic Timeout**: Built-in 8-second request budget guarantees CI builds never hang.
* **Zero Local Dependencies**: Self-contained runtime executed directly on standard `ubuntu-latest`, `macos-latest`, and `windows-latest` runners.

---

## 🤝 Community & Support

- **Engineered by**: [Loopstates](https://loopstates.com)
- **Web App & Badges**: [Linten Cloud](https://loopstates.com)
- **Issues & Contributions**: [GitHub Issues](https://github.com/Loopstates/linten/issues)

---

## 📄 License

Distributed under the [MIT License](LICENSE). Copyright (c) 2026 Loopstates.
