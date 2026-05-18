#!/usr/bin/env bash
set -euo pipefail

# Deploy migrated Nango template scripts (Phase 1: Slack + Notion)
#
# Usage: ./deploy.sh
#
# What this does:
# 1. Backs up existing Slack + Notion scripts on the server
# 2. Deploys 33 new template-based scripts (21 Slack + 12 Notion)
# 3. Removes the 2 Slack scripts marked for deletion (list-bookmarks, get-user-groups)
# 4. Keeps notion_actions_get-page.cjs untouched (custom composite action)
# 5. Restarts Nango to pick up changes

SERVER="lucid"
REMOTE_DIR="/home/debian/infrastructure/nango-actions"
BACKUP_DIR="/home/debian/infrastructure/nango-actions-backup-$(date +%Y%m%d-%H%M%S)"
SCRIPT_DIR="$(cd "$(dirname "$0")/output" && pwd)"

echo "=== Phase 1: Nango Template Migration ==="
echo "Server: $SERVER"
echo "Scripts: $SCRIPT_DIR"
echo ""

# 1. Backup existing scripts
echo "→ Backing up existing Slack + Notion scripts..."
ssh "$SERVER" "mkdir -p '$BACKUP_DIR' && cp ${REMOTE_DIR}/slack_actions_*.cjs ${REMOTE_DIR}/notion_actions_*.cjs '$BACKUP_DIR/' 2>/dev/null || true"
echo "  Backup at: $BACKUP_DIR"

# 2. Deploy new Slack scripts (21 files)
echo "→ Deploying 21 Slack template scripts..."
scp "$SCRIPT_DIR"/slack_actions_*.cjs "$SERVER:$REMOTE_DIR/"

# 3. Deploy new Notion scripts (12 files — excludes get-page which stays custom)
echo "→ Deploying 12 Notion template scripts..."
scp "$SCRIPT_DIR"/notion_actions_*.cjs "$SERVER:$REMOTE_DIR/"

# 4. Remove deprecated Slack scripts (thin wrappers, no template needed)
echo "→ Removing deprecated scripts (list-bookmarks, get-user-groups)..."
ssh "$SERVER" "rm -f ${REMOTE_DIR}/slack_actions_list-bookmarks.cjs ${REMOTE_DIR}/slack_actions_get-user-groups.cjs"

# 5. Restore custom Notion get-page (not migrated — composite action)
echo "→ Restoring custom notion_actions_get-page.cjs from backup..."
ssh "$SERVER" "cp '$BACKUP_DIR/notion_actions_get-page.cjs' '$REMOTE_DIR/notion_actions_get-page.cjs' 2>/dev/null || true"

# 6. Verify file count
echo ""
echo "→ Verifying deployment..."
ssh "$SERVER" "echo 'Slack scripts:' && ls ${REMOTE_DIR}/slack_actions_*.cjs | wc -l && echo 'Notion scripts:' && ls ${REMOTE_DIR}/notion_actions_*.cjs | wc -l"

# 7. Verify scripts load correctly
echo ""
echo "→ Syntax check (loading each script with node)..."
ssh "$SERVER" "cd $REMOTE_DIR && for f in slack_actions_*.cjs notion_actions_*.cjs; do node -e \"const m = require('./' + process.argv[1]); const a = m.default || m; if (typeof a.exec !== 'function') { console.log('FAIL: ' + process.argv[1]); process.exit(1); }\" \"\$f\" 2>&1 && echo \"  OK: \$f\" || echo \"  FAIL: \$f\"; done"

# 8. Restart Nango to clear action cache
echo ""
echo "→ Restarting Nango container..."
ssh "$SERVER" "cd /home/debian/infrastructure && docker compose restart lucid-nango"
echo "  Waiting 10s for Nango to start..."
sleep 10
ssh "$SERVER" "docker ps --filter name=lucid-nango --format '{{.Status}}'"

echo ""
echo "=== Deployment complete ==="
echo ""
echo "To rollback: ssh $SERVER \"cp $BACKUP_DIR/*.cjs $REMOTE_DIR/ && cd /home/debian/infrastructure && docker compose restart lucid-nango\""
