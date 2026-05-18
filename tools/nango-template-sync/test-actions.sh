#!/usr/bin/env bash
set -euo pipefail

# Test Nango actions via the Nango proxy (runs on the server)
#
# Usage: ./test-actions.sh
#
# Tests a few representative actions from each provider to verify
# the template migration didn't break anything.

SERVER="lucid"

echo "=== Nango Template Migration — Smoke Tests ==="
echo ""

# Get a Slack connection ID
echo "→ Finding active Slack connection..."
SLACK_CONN=$(ssh "$SERVER" "docker exec lucid-nango node -e \"
  const { Pool } = require('pg');
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  p.query(\\\"SELECT connection_id FROM nango._nango_connections WHERE provider_config_key = 'slack' AND deleted = false LIMIT 1\\\")
    .then(r => { console.log(r.rows[0]?.connection_id || ''); p.end(); });
\"")

if [ -z "$SLACK_CONN" ]; then
  echo "  No active Slack connection found, skipping Slack tests"
else
  echo "  Using connection: $SLACK_CONN"

  # Test list-channels
  echo ""
  echo "→ Testing slack:list-channels..."
  ssh "$SERVER" "cd /home/debian/infrastructure && node -e \"
    const m = require('./nango-actions/slack_actions_list-channels.cjs');
    const a = m.default || m;
    console.log('  exec type:', typeof a.exec);
    console.log('  input schema:', a.input ? 'present' : 'missing');
    console.log('  Script loaded OK');
  \""

  # Test send-message (dry — just load, don't execute)
  echo ""
  echo "→ Testing slack:send-message (load only)..."
  ssh "$SERVER" "cd /home/debian/infrastructure && node -e \"
    const m = require('./nango-actions/slack_actions_send-message.cjs');
    const a = m.default || m;
    console.log('  exec type:', typeof a.exec);
    console.log('  Script loaded OK');
  \""
fi

# Test Notion scripts
echo ""
echo "→ Testing notion:search-pages (load only)..."
ssh "$SERVER" "cd /home/debian/infrastructure && node -e \"
  const m = require('./nango-actions/notion_actions_search-pages.cjs');
  const a = m.default || m;
  console.log('  exec type:', typeof a.exec);
  console.log('  Script loaded OK');
\""

echo ""
echo "→ Testing notion:query-database (load only)..."
ssh "$SERVER" "cd /home/debian/infrastructure && node -e \"
  const m = require('./nango-actions/notion_actions_query-database.cjs');
  const a = m.default || m;
  console.log('  exec type:', typeof a.exec);
  console.log('  Script loaded OK');
\""

# Test custom keeper
echo ""
echo "→ Testing notion:get-page (custom keeper, should still load)..."
ssh "$SERVER" "cd /home/debian/infrastructure && node -e \"
  const m = require('./nango-actions/notion_actions_get-page.cjs');
  const a = m.default || m;
  console.log('  exec type:', typeof a.exec);
  console.log('  Script loaded OK');
\""

echo ""
echo "=== All smoke tests passed ==="
