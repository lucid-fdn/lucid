#!/usr/bin/env python3
"""Create the trigger-docs-sync workflow in the SDK repo."""
import os

workflow_dir = "c:/lucid-ai-sdk-temp/.github/workflows"
os.makedirs(workflow_dir, exist_ok=True)

content = """name: Trigger Docs Sync

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

with open(os.path.join(workflow_dir, "trigger-docs-sync.yml"), "w") as f:
    f.write(content)

print("Created: .github/workflows/trigger-docs-sync.yml")