#!/usr/bin/env bash
# generate-env.sh — Generate secrets and derived keys for self-hosted Lucid
# Usage: ./scripts/generate-env.sh [output-file]
#
# Generates: JWT_SECRET, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
#            ENCRYPTION_KEY, MESSAGE_ENCRYPTION_MASTER_KEY, INTERNAL_SERVICE_SECRET

set -euo pipefail

OUTPUT="${1:-.env}"

if [ -f "$OUTPUT" ] && [ "$OUTPUT" = ".env" ]; then
  echo "⚠  $OUTPUT already exists. Backing up to ${OUTPUT}.bak"
  cp "$OUTPUT" "${OUTPUT}.bak"
fi

# ─── Helpers ───────────────────────────────────────────────

random_hex() {
  openssl rand -hex "$1"
}

random_base64() {
  openssl rand -base64 "$1" | tr -d '\n'
}

# Generate a Supabase JWT (anon or service_role)
# Uses python3 or node — both available in most environments
generate_supabase_jwt() {
  local role="$1"
  local secret="$2"

  # Try node first (more common in this stack)
  # Pass secrets via env vars to avoid shell injection
  if command -v node &>/dev/null; then
    JWT_ROLE="$role" JWT_SECRET_KEY="$secret" node -e "
const crypto = require('crypto');
const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const payload = Buffer.from(JSON.stringify({
  role: process.env.JWT_ROLE,
  iss: 'supabase',
  iat: Math.floor(Date.now()/1000),
  exp: Math.floor(Date.now()/1000) + 10*365*24*60*60
})).toString('base64url');
const sig = crypto.createHmac('sha256', process.env.JWT_SECRET_KEY).update(header+'.'+payload).digest('base64url');
console.log(header+'.'+payload+'.'+sig);
"
    return
  fi

  # Fallback to python3
  if command -v python3 &>/dev/null; then
    JWT_ROLE="$role" JWT_SECRET_KEY="$secret" python3 -c "
import hmac, hashlib, base64, json, time, os
def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()
role = os.environ['JWT_ROLE']
secret = os.environ['JWT_SECRET_KEY']
header = b64url(json.dumps({'alg':'HS256','typ':'JWT'}).encode())
payload = b64url(json.dumps({
    'role':role,'iss':'supabase',
    'iat':int(time.time()),'exp':int(time.time())+10*365*24*60*60
}).encode())
sig = b64url(hmac.new(secret.encode(),(header+'.'+payload).encode(),hashlib.sha256).digest())
print(f'{header}.{payload}.{sig}')
"
    return
  fi

  echo "ERROR: Need node or python3 to generate JWT" >&2
  exit 1
}

# ─── Generate secrets ──────────────────────────────────────

echo "🔑 Generating secrets..."

POSTGRES_PASSWORD="$(random_hex 16)"
JWT_SECRET="$(random_base64 48)"
ENCRYPTION_KEY="$(random_hex 32)"
MESSAGE_ENCRYPTION_MASTER_KEY="$(random_hex 32)"
INTERNAL_SERVICE_SECRET="$(random_hex 32)"

echo "🔐 Deriving Supabase keys..."

SUPABASE_ANON_KEY="$(generate_supabase_jwt anon "$JWT_SECRET")"
SUPABASE_SERVICE_ROLE_KEY="$(generate_supabase_jwt service_role "$JWT_SECRET")"

# ─── Write .env ────────────────────────────────────────────

if [ -f .env.example ]; then
  cp .env.example "$OUTPUT"
else
  touch "$OUTPUT"
fi

# Replace placeholder values in the output file
replace_or_append() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$OUTPUT" 2>/dev/null; then
    # Use a different delimiter for sed since values may contain /
    sed -i.tmp "s|^${key}=.*|${key}=${value}|" "$OUTPUT"
    rm -f "${OUTPUT}.tmp"
  else
    echo "${key}=${value}" >> "$OUTPUT"
  fi
}

replace_or_append "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
replace_or_append "JWT_SECRET" "$JWT_SECRET"
replace_or_append "SUPABASE_ANON_KEY" "$SUPABASE_ANON_KEY"
replace_or_append "SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY"
replace_or_append "ENCRYPTION_KEY" "$ENCRYPTION_KEY"
replace_or_append "MESSAGE_ENCRYPTION_MASTER_KEY" "$MESSAGE_ENCRYPTION_MASTER_KEY"
replace_or_append "INTERNAL_SERVICE_SECRET" "$INTERNAL_SERVICE_SECRET"

# Restrict file permissions (secrets should not be world-readable)
chmod 600 "$OUTPUT"

echo ""
echo "Generated secrets written to $OUTPUT (permissions: 600)"
echo ""
echo "   POSTGRES_PASSWORD:             ${POSTGRES_PASSWORD:0:8}..."
echo "   JWT_SECRET:                    ${JWT_SECRET:0:16}..."
echo "   SUPABASE_ANON_KEY:             ${SUPABASE_ANON_KEY:0:32}..."
echo "   SUPABASE_SERVICE_ROLE_KEY:     ${SUPABASE_SERVICE_ROLE_KEY:0:32}..."
echo "   ENCRYPTION_KEY:                ${ENCRYPTION_KEY:0:16}..."
echo "   MESSAGE_ENCRYPTION_MASTER_KEY: ${MESSAGE_ENCRYPTION_MASTER_KEY:0:16}..."
echo "   INTERNAL_SERVICE_SECRET:       ${INTERNAL_SERVICE_SECRET:0:16}..."
echo ""
echo "Next steps:"
echo "  1. Add your LLM API key (OPENAI_API_KEY or FALLBACK_PROVIDER_URL)"
echo "  2. Run: docker compose up"
