#!/bin/bash
# Bootstrap schemas and extensions for the Lucid self-hosted stack.
# Runs once on first DB initialization via docker-entrypoint-initdb.d.

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- Create the auth schema required by GoTrue
  CREATE SCHEMA IF NOT EXISTS auth;

  -- Create the storage schema (used by PostgREST schema config)
  CREATE SCHEMA IF NOT EXISTS storage;

  -- PostgREST JWT roles (used by supabase-js for row-level security)
  CREATE ROLE anon NOLOGIN NOINHERIT;
  CREATE ROLE authenticated NOLOGIN NOINHERIT;
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;

  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

  -- Allow future tables/sequences to inherit permissions
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

  -- GoTrue migrations create types (factor_type, etc.) without schema
  -- qualification, relying on search_path to place them in auth schema.
  -- Grant usage and set search_path so GoTrue migrations work correctly.
  GRANT ALL ON SCHEMA auth TO postgres;
  GRANT ALL ON SCHEMA storage TO postgres;
  ALTER ROLE postgres SET search_path TO auth, public, storage;

  -- auth.uid() and auth.role() — standard PostgREST/Supabase helpers
  -- Used by RLS policies. PostgREST sets request.jwt.claims from the JWT.
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS \$\$
      SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
    \$\$;

  CREATE OR REPLACE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS \$\$
      SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'role', '')::text
    \$\$;

  -- Extensions
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  CREATE EXTENSION IF NOT EXISTS "pg_trgm";
  CREATE EXTENSION IF NOT EXISTS "vector";
EOSQL
