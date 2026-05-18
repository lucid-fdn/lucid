#!/usr/bin/env bash
# Migration runner - applies base schema + incremental migrations
# Used as init container in docker-compose
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

BOOTSTRAP_DIR="/bootstrap"
MIGRATIONS_DIR="/migrations"
TRACKING_TABLE="lucid_migrations"

echo "Lucid Migration Runner"
echo "  Bootstrap: $BOOTSTRAP_DIR"
echo "  Migrations: $MIGRATIONS_DIR"

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if psql "$DATABASE_URL" -c "SELECT 1" &>/dev/null; then
    echo "PostgreSQL is ready"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "ERROR: PostgreSQL not ready after 30s"
    exit 1
  fi
  sleep 1
done

# Create tracking table if it doesn't exist
psql "$DATABASE_URL" -c "
  CREATE TABLE IF NOT EXISTS $TRACKING_TABLE (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT now()
  );
"

# Apply a named migration file (idempotent via tracking table)
apply_migration() {
  local name="$1"
  local file="$2"

  APPLIED=$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM $TRACKING_TABLE WHERE name = \$\$${name}\$\$ LIMIT 1" 2>/dev/null || echo "")
  if [ "$APPLIED" != "1" ]; then
    echo "Applying: $name"
    { echo "SET search_path TO public;"; cat "$file"; } | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f -
    psql "$DATABASE_URL" -c "INSERT INTO $TRACKING_TABLE (name) VALUES (\$\$${name}\$\$);"
  fi
}

# Apply base schema (idempotent - only runs once)
if [ -f "$BOOTSTRAP_DIR/000_base_schema.sql" ]; then
  SCHEMA_APPLIED=$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM $TRACKING_TABLE WHERE name = \$\$000_base_schema\$\$ LIMIT 1" 2>/dev/null || echo "")
  if [ "$SCHEMA_APPLIED" != "1" ]; then
    echo "Applying: 000_base_schema"
    { echo "SET search_path TO public;"; cat "$BOOTSTRAP_DIR/000_base_schema.sql"; } | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f -
    psql "$DATABASE_URL" -c "INSERT INTO $TRACKING_TABLE (name) VALUES (\$\$000_base_schema\$\$);"

    # Note: incremental migrations run on top of the base schema.
    # The base schema provides core tables; migrations add features,
    # columns, and functions. Migrations are designed to be idempotent
    # (IF NOT EXISTS, CREATE OR REPLACE, etc.) so they can safely run
    # on a database that already has the base schema applied.
  fi
fi

# Apply incremental migrations in order (only new ones not covered by base schema)
if [ -d "$MIGRATIONS_DIR" ]; then
  for migration in "$MIGRATIONS_DIR"/*.sql; do
    [ -f "$migration" ] || continue
    NAME=$(basename "$migration" .sql)
    apply_migration "$NAME" "$migration"
  done
fi

echo ""
echo "All migrations applied"
TOTAL=$(psql "$DATABASE_URL" -tAc "SELECT count(*) FROM $TRACKING_TABLE")
echo "  Total applied: $TOTAL"
