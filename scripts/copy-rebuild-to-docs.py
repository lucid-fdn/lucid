#!/usr/bin/env python3
"""Copy the rebuild script to docs repo with CI-friendly paths."""
import os

src = "scripts/rebuild-sdk-docs-from-speakeasy.py"
dst = "c:/docs/scripts/rebuild-sdk-docs.py"

os.makedirs(os.path.dirname(dst), exist_ok=True)

with open(src, "r") as f:
    content = f.read()

# Replace hardcoded path with relative path for CI
old = 'DOCS_ROOT = "c:/docs"'
new = 'DOCS_ROOT = os.environ.get("DOCS_ROOT", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))'
content = content.replace(old, new)

with open(dst, "w") as f:
    f.write(content)

print(f"Created: {dst} ({os.path.getsize(dst)} bytes)")

# Create GitHub Action workflow for docs repo
workflow_dir = "c:/docs/.github/workflows"
os.makedirs(workflow_dir, exist_ok=True)

workflow = """name: Sync SDK Docs from Speakeasy

on:
  # Triggered by SDK repo via repository_dispatch
  repository_dispatch:
    types: [sdk-updated]
  
  # Manual trigger
  workflow_dispatch:
  
  # Weekly sync as fallback
  schedule:
    - cron: '0 6 * * 1'  # Every Monday at 6 AM UTC

jobs:
  sync-sdk-docs:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    
    steps:
      - name: Checkout docs repo
        uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Run SDK docs rebuild
        run: python scripts/rebuild-sdk-docs.py
      
      - name: Check for changes
        id: changes
        run: |
          git diff --quiet && echo "changed=false" >> $GITHUB_OUTPUT || echo "changed=true" >> $GITHUB_OUTPUT
      
      - name: Commit and push
        if: steps.changes.outputs.changed == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add sdks/
          git commit -m "docs: auto-sync SDK docs from Speakeasy [skip ci]"
          git push
"""

with open(os.path.join(workflow_dir, "sync-sdk-docs.yml"), "w") as f:
    f.write(workflow)
print(f"Created: {workflow_dir}/sync-sdk-docs.yml")

# Create trigger workflow for SDK repo (to be pushed via GitHub API)
sdk_workflow = """name: Trigger Docs Sync

on:
  push:
    branches: [main]
    paths:
      - 'typescript/docs/**'
      - 'typescript/README.md'
      - 'typescript/USAGE.md'
      - 'typescript/FUNCTIONS.md'

jobs:
  trigger-docs-sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger docs repo rebuild
        uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.DOCS_SYNC_PAT }}
          repository: raijinlabs/docs
          event-type: sdk-updated
          client-payload: '{"ref": "${{ github.ref }}", "sha": "${{ github.sha }}"}'
"""

sdk_workflow_path = "c:/docs/docs/SDK_SYNC_WORKFLOW.md"
with open(sdk_workflow_path, "w", encoding="utf-8") as f:
    f.write(f"""# SDK Docs Auto-Sync Setup

## How It Works

1. When Speakeasy regenerates the SDK in `raijinlabs/lucid-ai-sdk`, it updates `typescript/docs/`
2. A GitHub Action in the SDK repo triggers `repository_dispatch` on the docs repo
3. The docs repo runs `scripts/rebuild-sdk-docs.py` to pull fresh content
4. Changes are auto-committed and pushed → Mintlify rebuilds

## Setup Steps

### 1. Docs Repo (raijinlabs/docs) — Already Done ✅
- `scripts/rebuild-sdk-docs.py` — Fetches Speakeasy docs and builds MDX
- `.github/workflows/sync-sdk-docs.yml` — Listens for `sdk-updated` dispatch

### 2. SDK Repo (raijinlabs/lucid-ai-sdk) — You Need To Add This

Create `.github/workflows/trigger-docs-sync.yml` in the SDK repo:

```yaml
{sdk_workflow}```

### 3. Create a PAT (Personal Access Token)

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Create a token with:
   - **Repository access**: `raijinlabs/docs`
   - **Permissions**: Contents (read/write)
3. Add this token as a secret in the SDK repo:
   - Go to `raijinlabs/lucid-ai-sdk` → Settings → Secrets → Actions
   - Name: `DOCS_SYNC_PAT`
   - Value: The token you created

### 4. Test

Push a change to `typescript/docs/` in the SDK repo. The docs should auto-update within 2-3 minutes.

## Manual Trigger

You can also trigger a sync manually:
- Go to `raijinlabs/docs` → Actions → "Sync SDK Docs from Speakeasy" → Run workflow

## Weekly Fallback

The sync also runs every Monday at 6 AM UTC as a safety net.
""")
print(f"Created: {sdk_workflow_path}")

print("\nAll files created!")