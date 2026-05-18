#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Delegating to the reviewed allowlist-only sync script."
echo "Usage: ./scripts/sync-vercel-env.sh <source-env> <target-env> <VAR_NAME...>"
node "$REPO_ROOT/scripts/sync-vercel-env.js" "$@"
