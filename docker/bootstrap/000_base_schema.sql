-- ============================================================================
-- Lucid Self-Hosted: Base Schema (Milestone A)
-- ============================================================================
--
-- This file bootstraps a clean PostgreSQL database with the core tables
-- needed to run a self-hosted Lucid instance. It is designed to be run
-- once on a fresh database (e.g., docker-entrypoint-initdb.d/).
--
-- What's included (Milestone A):
--   - User management (profiles, identity_links)
--   - Multi-tenancy (organizations, organization_members)
--   - Workspace hierarchy (projects, environments)
--   - Agent definitions (ai_assistants)
--   - Chat (assistant_conversations, assistant_messages)
--   - Worker event queue (assistant_inbound_events, assistant_outbound_events)
--   - Agent memory with pgvector (assistant_memory)
--   - Plugins (plugin_catalog, org_plugin_installations, assistant_plugin_activations)
--   - Skills (skill_catalog, org_skill_installations, assistant_skill_activations)
--   - Channels (assistant_channels, encrypted_secrets)
--   - Concurrency (assistant_conversation_locks)
--   - Conversation compaction (assistant_conversation_summaries)
--   - Worker health (vps_health_snapshots)
--   - JIT user creation RPC (create_user_atomic)
--
-- What's NOT included (add via migrations when needed):
--   - Launchpad (launched_agents, staking_pools, etc.)
--   - Trading (agent_trades, polymarket_*)
--   - Mission Control (mc_*, dedicated_runtimes, runtime_events)
--   - Billing / Stripe (plans, subscriptions, checkout_attempts)
--   - Crews (crews, crew_members, crew_edges, crew_runs)
--   - OAuth / Nango (oauth_*, user_oauth_connections)
--
-- Generated: 2026-03-31
-- ============================================================================

BEGIN;

-- Ensure tables are created in 'public' schema.
-- (The postgres role may have search_path = auth,public,storage for GoTrue.)
SET search_path TO public;

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
-- Required Postgres extensions for UUIDs, crypto, vector search, and trigrams.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create the supabase_realtime publication (used by Supabase Realtime service).
-- Even without the Realtime service, migrations reference this publication.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- 2. ROLES (idempotent — only created if missing)
-- ============================================================================
-- Supabase convention: anon, authenticated, service_role.
-- Self-hosted setups without Supabase can map these to application users.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;


-- ============================================================================
-- 3. UTILITY FUNCTIONS
-- ============================================================================

-- Auto-update updated_at on any table that uses the trigger.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 4. USER MANAGEMENT
-- ============================================================================

-- --------------------------------------------------------------------------
-- 4a. auth.users — minimal Supabase-compatible auth table for self-hosted mode
-- --------------------------------------------------------------------------
-- Later migrations reference auth.users for audit ownership and human-task
-- assignments. Self-hosted Lucid does not depend on the full GoTrue schema,
-- but it does need a stable foreign-key target that matches Supabase's
-- contract closely enough for those migrations and runtime queries.

CREATE TABLE IF NOT EXISTS auth.users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT,
  raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_email
  ON auth.users (email)
  WHERE email IS NOT NULL;

-- --------------------------------------------------------------------------
-- 4b. profiles — Canonical user records
-- --------------------------------------------------------------------------
-- Internal UUIDs, not tied to any auth provider. Identity links (below)
-- map external provider IDs to these records.

CREATE TABLE profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle          TEXT UNIQUE NOT NULL,
  email           TEXT,
  name            TEXT,
  first_name      TEXT,
  last_name       TEXT,
  avatar_url      TEXT,
  bio             TEXT,
  homepage        TEXT,
  interests       TEXT[],
  github_username TEXT,
  twitter_username TEXT,
  linkedin_url    TEXT,
  profile_public  BOOLEAN NOT NULL DEFAULT false,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profiles_handle_length CHECK (char_length(handle) BETWEEN 3 AND 32)
);

CREATE INDEX idx_profiles_handle ON profiles(handle);
CREATE INDEX idx_profiles_email ON profiles(email) WHERE email IS NOT NULL;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view public profiles" ON profiles
  FOR SELECT USING (profile_public = true);

CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Service role bypass (worker needs full access)
CREATE POLICY "Service role full access on profiles" ON profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 4c. identity_links — Map external auth providers to internal profiles
-- --------------------------------------------------------------------------
-- Supports Privy, Auth0, Clerk, local email/password, etc.
-- One external_id per provider, but a user can have multiple providers.

CREATE TABLE identity_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,       -- 'privy', 'local', 'auth0', etc.
  external_id TEXT NOT NULL,       -- Provider's user ID
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_provider_external_id UNIQUE (provider, external_id)
);

CREATE INDEX idx_identity_links_user_id ON identity_links(user_id);
CREATE INDEX idx_identity_links_provider_external ON identity_links(provider, external_id);

ALTER TABLE identity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on identity_links" ON identity_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- 5. MULTI-TENANCY
-- ============================================================================

-- --------------------------------------------------------------------------
-- 5a. organizations — Teams / workspaces
-- --------------------------------------------------------------------------

CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  type            TEXT CHECK (type IN ('company', 'lab', 'university', 'nonprofit', 'community', 'personal', 'other')),
  logo_url        TEXT,
  bio             TEXT,
  homepage        TEXT,
  interests       TEXT[],
  github_username TEXT,
  twitter_username TEXT,
  linkedin_url    TEXT,
  created_by      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_created_by ON organizations(created_by);

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view organizations" ON organizations
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create organizations" ON organizations
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Service role full access on organizations" ON organizations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 5b. organization_members — Org membership + roles
-- --------------------------------------------------------------------------

CREATE TABLE organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner', 'admin', 'member')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, user_id)
);

-- Deferred from section 5a: references organization_members which must exist first
CREATE POLICY "Org owners/admins can update" ON organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin')
    )
  );

CREATE INDEX idx_org_members_org_id ON organization_members(organization_id);
CREATE INDEX idx_org_members_user_id ON organization_members(user_id);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view org members" ON organization_members
  FOR SELECT USING (true);

CREATE POLICY "Org owners/admins can manage members" ON organization_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members AS om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Service role full access on org_members" ON organization_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Auto-add org creator as owner
CREATE OR REPLACE FUNCTION add_org_creator_as_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_add_org_creator
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION add_org_creator_as_owner();


-- ============================================================================
-- 6. WORKSPACE HIERARCHY
-- ============================================================================

-- --------------------------------------------------------------------------
-- 6a. projects — Org-scoped project containers
-- --------------------------------------------------------------------------

CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,

  UNIQUE (org_id, slug)
);

CREATE UNIQUE INDEX one_default_project_per_org
  ON projects(org_id) WHERE is_default = true AND deleted_at IS NULL;

CREATE INDEX idx_projects_org_id ON projects(org_id) WHERE deleted_at IS NULL;

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view projects" ON projects
  FOR SELECT USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access on projects" ON projects
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 6b. environments — Per-project deployment environments
-- --------------------------------------------------------------------------

CREATE TABLE environments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (name IN ('production', 'staging', 'development', 'Development')),
  is_default  BOOLEAN NOT NULL DEFAULT false,
  config      JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,

  UNIQUE (project_id, name)
);

CREATE TRIGGER update_environments_updated_at
  BEFORE UPDATE ON environments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE environments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view environments" ON environments
  FOR SELECT USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN organization_members om ON om.organization_id = p.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access on environments" ON environments
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- 7. AI ASSISTANTS (Agent definitions)
-- ============================================================================

CREATE TABLE ai_assistants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenancy
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  env_id          UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,

  -- Identity
  name            TEXT NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  description     TEXT CHECK (char_length(description) <= 500),
  avatar_url      TEXT,

  -- AI Configuration
  system_prompt   TEXT CHECK (char_length(system_prompt) <= 10000),
  lucid_model     TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  temperature     NUMERIC(3,2) NOT NULL DEFAULT 0.7
                    CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens      INTEGER NOT NULL DEFAULT 4096
                    CHECK (max_tokens >= 100 AND max_tokens <= 32000),

  -- Tool configuration
  enabled_n8n_nodes TEXT[] NOT NULL DEFAULT '{}',

  -- Memory configuration
  memory_enabled      BOOLEAN NOT NULL DEFAULT true,
  memory_window_size  INTEGER NOT NULL DEFAULT 10
                        CHECK (memory_window_size >= 1 AND memory_window_size <= 100),
  memory_extraction_model TEXT DEFAULT 'gpt-4o-mini',
  memory_strategy     TEXT DEFAULT 'auto'
                        CHECK (memory_strategy IN ('auto', 'aggressive', 'conservative', 'off')),

  -- Model routing
  fallback_model          TEXT,
  model_routing_strategy  TEXT DEFAULT 'default'
                            CHECK (model_routing_strategy IN (
                              'default', 'cost_optimized', 'latency_optimized', 'quality_first'
                            )),

  -- Streaming
  stream_mode     TEXT CHECK (stream_mode IN ('auto', 'stream', 'queue')),

  -- Identity (L2 passport)
  passport_id     TEXT,  -- Portable agent identity

  -- Status + Mission Control fields
  is_active       BOOLEAN NOT NULL DEFAULT true,
  mc_status       TEXT NOT NULL DEFAULT 'active'
                    CHECK (mc_status IN ('active', 'paused', 'stopped', 'failed')),
  approval_required_tools TEXT[] DEFAULT '{}',

  -- Cost guardrails
  cost_limit_per_run_usd  NUMERIC(10,4),
  cost_limit_daily_usd    NUMERIC(10,4),
  cost_limit_monthly_usd  NUMERIC(10,4),

  -- Ownership
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ  -- Soft delete
);

CREATE INDEX idx_ai_assistants_org ON ai_assistants(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ai_assistants_project ON ai_assistants(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ai_assistants_active ON ai_assistants(is_active) WHERE deleted_at IS NULL;

CREATE TRIGGER update_ai_assistants_updated_at
  BEFORE UPDATE ON ai_assistants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE ai_assistants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view assistants in their org" ON ai_assistants
  FOR SELECT USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert assistants in their org" ON ai_assistants
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can update assistants" ON ai_assistants
  FOR UPDATE USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admins can delete assistants" ON ai_assistants
  FOR DELETE USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Service role full access on ai_assistants" ON ai_assistants
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- 8. CHANNELS (Telegram, WhatsApp, Discord, Slack, Web)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 8a. encrypted_secrets — Encrypted channel credentials
-- --------------------------------------------------------------------------

CREATE TABLE encrypted_secrets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encrypted_data TEXT NOT NULL,  -- AES-256-GCM encrypted JSON
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE encrypted_secrets ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_encrypted_secrets_updated_at
  BEFORE UPDATE ON encrypted_secrets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------------------------------------
-- 8b. assistant_channels — Channel connections per assistant
-- --------------------------------------------------------------------------

CREATE TABLE assistant_channels (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id          UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  channel_type          TEXT NOT NULL
                          CHECK (channel_type IN ('telegram', 'whatsapp', 'web', 'discord', 'slack')),
  secret_token_hash     TEXT NOT NULL,
  encrypted_secrets_id  UUID REFERENCES encrypted_secrets(id) ON DELETE SET NULL,
  external_channel_id   TEXT,
  webhook_url           TEXT,
  channel_config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channels_assistant ON assistant_channels(assistant_id);
CREATE INDEX idx_channels_type ON assistant_channels(channel_type) WHERE is_active = true;

CREATE TRIGGER update_assistant_channels_updated_at
  BEFORE UPDATE ON assistant_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE assistant_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view channels for their assistants" ON assistant_channels
  FOR SELECT USING (
    assistant_id IN (
      SELECT a.id FROM ai_assistants a
      JOIN organization_members om ON om.organization_id = a.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access on channels" ON assistant_channels
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- 9. CONVERSATIONS + MESSAGES (Chat)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 9a. assistant_conversations — Chat sessions
-- --------------------------------------------------------------------------

CREATE TABLE assistant_conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id     UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  channel_id       UUID NOT NULL REFERENCES assistant_channels(id) ON DELETE CASCADE,
  external_user_id TEXT NOT NULL,
  external_chat_id TEXT NOT NULL,
  title            TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at  TIMESTAMPTZ,

  UNIQUE (channel_id, external_user_id, external_chat_id)
);

CREATE INDEX idx_conversations_assistant ON assistant_conversations(assistant_id);
CREATE INDEX idx_conversations_channel ON assistant_conversations(channel_id);
CREATE INDEX idx_conversations_external ON assistant_conversations(external_user_id, external_chat_id);

CREATE TRIGGER update_assistant_conversations_updated_at
  BEFORE UPDATE ON assistant_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE assistant_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view conversations for their org" ON assistant_conversations
  FOR SELECT USING (
    channel_id IN (
      SELECT c.id FROM assistant_channels c
      JOIN ai_assistants a ON c.assistant_id = a.id
      JOIN organization_members om ON om.organization_id = a.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access on conversations" ON assistant_conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 9b. assistant_messages — Chat transcript
-- --------------------------------------------------------------------------

CREATE TABLE assistant_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,

  -- Content
  role                TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content             TEXT,  -- Plaintext (NULL if encrypted)

  -- Encryption columns (APP_LAYER / ENCLAVE support)
  content_encrypted   TEXT,
  content_iv          TEXT,
  content_auth_tag    TEXT,
  encryption_mode     TEXT NOT NULL DEFAULT 'NONE',
  key_id              TEXT,

  -- Tool call info
  tool_name           TEXT,
  tool_input          JSONB,
  tool_output         JSONB,
  external_message_id TEXT,

  -- Usage tracking
  tokens_prompt       INTEGER,
  tokens_completion   INTEGER,
  cost_usd            NUMERIC(10,6),
  model_used          TEXT,
  latency_ms          INTEGER,

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON assistant_messages(conversation_id, created_at ASC);
CREATE INDEX idx_messages_role ON assistant_messages(conversation_id, role);

ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in their org" ON assistant_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT c.id FROM assistant_conversations c
      JOIN assistant_channels ch ON c.channel_id = ch.id
      JOIN ai_assistants a ON ch.assistant_id = a.id
      JOIN organization_members om ON om.organization_id = a.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access on messages" ON assistant_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Auto-update conversation last_message_at on new message
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE assistant_conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_last_message_trigger
  AFTER INSERT ON assistant_messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();


-- ============================================================================
-- 10. WORKER EVENT QUEUE (Outbox Pattern)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 10a. assistant_inbound_events — Messages FROM channels
-- --------------------------------------------------------------------------
-- Uses FOR UPDATE SKIP LOCKED for atomic claim by workers.

CREATE TABLE assistant_inbound_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id          UUID NOT NULL REFERENCES assistant_channels(id) ON DELETE CASCADE,
  external_message_id TEXT NOT NULL,
  external_user_id    TEXT NOT NULL,
  external_chat_id    TEXT NOT NULL,
  message_text        TEXT,
  message_data        JSONB,

  -- Processing state
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts            INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts        INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  next_attempt_at     TIMESTAMPTZ,
  last_error          TEXT,

  -- Denormalized assistant_id for faster querying (populated from channel.assistant_id)
  assistant_id        UUID REFERENCES ai_assistants(id) ON DELETE CASCADE,

  -- Lease-based worker lock
  locked_at           TIMESTAMPTZ,
  locked_by           TEXT,
  locked_until        TIMESTAMPTZ,
  lease_expires_at    TIMESTAMPTZ,

  -- Delivery tracking (WhatsApp ack IDs, etc.)
  delivery_state      JSONB,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at        TIMESTAMPTZ,

  UNIQUE (channel_id, external_message_id)
);

-- Indexes for polling (critical for worker performance)
CREATE INDEX idx_inbound_pending ON assistant_inbound_events(status, next_attempt_at, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_inbound_channel ON assistant_inbound_events(channel_id, created_at DESC);
CREATE INDEX idx_inbound_stuck_scan ON assistant_inbound_events(status, locked_until)
  WHERE status = 'processing';
CREATE INDEX idx_inbound_assistant ON assistant_inbound_events(assistant_id, created_at DESC);

ALTER TABLE assistant_inbound_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on inbound_events" ON assistant_inbound_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 10b. assistant_outbound_events — Messages TO channels
-- --------------------------------------------------------------------------

CREATE TABLE assistant_outbound_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id          UUID NOT NULL REFERENCES assistant_channels(id) ON DELETE CASCADE,
  inbound_event_id    UUID REFERENCES assistant_inbound_events(id) ON DELETE SET NULL,
  conversation_id     UUID REFERENCES assistant_conversations(id) ON DELETE SET NULL,
  message_text        TEXT NOT NULL,
  reply_to_external_id TEXT,

  -- Processing state
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts            INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts        INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  next_attempt_at     TIMESTAMPTZ,
  last_error          TEXT,

  -- Lease-based worker lock
  locked_at           TIMESTAMPTZ,
  locked_by           TEXT,
  locked_until        TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at             TIMESTAMPTZ,
  external_message_id TEXT
);

CREATE INDEX idx_outbound_pending ON assistant_outbound_events(status, next_attempt_at, created_at)
  WHERE status = 'pending';
CREATE INDEX idx_outbound_channel ON assistant_outbound_events(channel_id, created_at DESC);
CREATE INDEX idx_outbound_stuck_scan ON assistant_outbound_events(status, locked_until)
  WHERE status = 'processing';

ALTER TABLE assistant_outbound_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on outbound_events" ON assistant_outbound_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- 11. AGENT MEMORY (pgvector embeddings)
-- ============================================================================

CREATE TABLE assistant_memory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id      UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  conversation_id   UUID REFERENCES assistant_conversations(id) ON DELETE SET NULL,
  scoped_user_id    TEXT,  -- Format: "channel_type:external_user_id"

  -- Content (plaintext XOR encrypted — never both)
  content           TEXT,
  content_encrypted TEXT,
  content_iv        TEXT,
  content_auth_tag  TEXT,
  encryption_mode   TEXT NOT NULL DEFAULT 'NONE',
  key_id            TEXT,

  -- Vector embedding
  embedding         vector(1536),  -- text-embedding-3-small dimension
  content_hash      TEXT,          -- MD5(lower(trim(content))) for dedup

  -- Categorization
  category          TEXT NOT NULL DEFAULT 'fact'
                      CHECK (category IN ('fact', 'preference', 'instruction', 'context')),
  importance        NUMERIC(3,2) NOT NULL DEFAULT 0.5
                      CHECK (importance >= 0 AND importance <= 1),
  metadata          JSONB DEFAULT '{}',

  -- Source tracking
  source_message_id UUID REFERENCES assistant_messages(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at  TIMESTAMPTZ
);

-- Vector similarity search (IVFFlat cosine)
CREATE INDEX idx_memory_embedding ON assistant_memory
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Recent memories by user scope
CREATE INDEX idx_memory_assistant_scoped_accessed
  ON assistant_memory(assistant_id, scoped_user_id, last_accessed_at DESC);

-- Dedup: partial unique on (assistant, scoped_user, hash)
CREATE UNIQUE INDEX idx_memory_unique_content_scoped
  ON assistant_memory(assistant_id, scoped_user_id, content_hash)
  WHERE scoped_user_id IS NOT NULL AND content_hash IS NOT NULL;

CREATE INDEX idx_memory_assistant ON assistant_memory(assistant_id);
CREATE INDEX idx_memory_content_hash ON assistant_memory(assistant_id, content_hash)
  WHERE content_hash IS NOT NULL;

ALTER TABLE assistant_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view memory for their assistants" ON assistant_memory
  FOR SELECT USING (
    assistant_id IN (
      SELECT a.id FROM ai_assistants a
      JOIN organization_members om ON om.organization_id = a.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access on memory" ON assistant_memory
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- 12. PLUGIN SYSTEM (3-tier: Catalog -> Org Install -> Assistant Activate)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 12a. plugin_catalog — Global registry of available plugins
-- --------------------------------------------------------------------------

CREATE TABLE plugin_catalog (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  description       TEXT,
  version           TEXT NOT NULL DEFAULT '1.0.0',
  author            TEXT DEFAULT 'Lucid',
  license           TEXT DEFAULT 'MIT',
  icon_url          TEXT,
  category          TEXT NOT NULL DEFAULT 'general',
  kind              TEXT NOT NULL DEFAULT 'plugin'
                      CHECK (kind IN ('plugin', 'integration', 'platform')),

  -- Tool manifest: array of { name, description, parameters }
  tool_manifest     JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Execution routing
  source            TEXT NOT NULL DEFAULT 'first-party',
  mcpgate_server_id TEXT,
  trust_level       TEXT NOT NULL DEFAULT 'internal'
                      CHECK (trust_level IN ('internal', 'verified', 'community')),
  risk_level        TEXT NOT NULL DEFAULT 'read',
  verified          BOOLEAN NOT NULL DEFAULT false,

  -- Endpoint (for integrations)
  endpoint_url      TEXT,
  requires_env      TEXT[] DEFAULT '{}',
  max_tools         INT NOT NULL DEFAULT 20,

  -- Metadata
  source_repo       TEXT,
  is_published      BOOLEAN NOT NULL DEFAULT true,
  min_plan          TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plugin_catalog_category ON plugin_catalog(category);
CREATE INDEX idx_plugin_catalog_source ON plugin_catalog(source);
CREATE INDEX idx_plugin_catalog_kind ON plugin_catalog(kind);

CREATE TRIGGER trg_plugin_catalog_updated_at
  BEFORE UPDATE ON plugin_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE plugin_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published plugins" ON plugin_catalog
  FOR SELECT USING (is_published = true);

CREATE POLICY "Service role full access on plugin_catalog" ON plugin_catalog
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 12b. org_plugin_installations — Org-scoped plugin installs
-- --------------------------------------------------------------------------

CREATE TABLE org_plugin_installations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plugin_id         UUID NOT NULL REFERENCES plugin_catalog(id) ON DELETE CASCADE,
  installed_version TEXT NOT NULL,
  manifest_snapshot JSONB NOT NULL,
  config            JSONB DEFAULT '{}',
  installed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  installed_by      UUID REFERENCES profiles(id),

  UNIQUE (org_id, plugin_id)
);

CREATE INDEX idx_org_plugins_org_id ON org_plugin_installations(org_id);

ALTER TABLE org_plugin_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view installations" ON org_plugin_installations
  FOR SELECT USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can install plugins" ON org_plugin_installations
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admins can uninstall plugins" ON org_plugin_installations
  FOR DELETE USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Service role full access on org_plugins" ON org_plugin_installations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 12c. assistant_plugin_activations — Per-assistant plugin toggles
-- --------------------------------------------------------------------------

CREATE TABLE assistant_plugin_activations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id    UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  installation_id UUID NOT NULL REFERENCES org_plugin_installations(id) ON DELETE CASCADE,
  enabled_tools   TEXT[],
  config          JSONB DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (assistant_id, installation_id)
);

CREATE INDEX idx_assistant_plugins_assistant_id ON assistant_plugin_activations(assistant_id);
CREATE INDEX idx_assistant_plugins_active ON assistant_plugin_activations(assistant_id) WHERE is_active = true;

ALTER TABLE assistant_plugin_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view activations" ON assistant_plugin_activations
  FOR SELECT USING (
    installation_id IN (
      SELECT opi.id FROM org_plugin_installations opi
      JOIN organization_members om ON om.organization_id = opi.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can manage activations" ON assistant_plugin_activations
  FOR ALL USING (
    installation_id IN (
      SELECT opi.id FROM org_plugin_installations opi
      JOIN organization_members om ON om.organization_id = opi.org_id
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Service role full access on plugin_activations" ON assistant_plugin_activations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Hard cap: max 5 active plugins per assistant
CREATE OR REPLACE FUNCTION check_max_active_plugins()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  active_count INT;
BEGIN
  IF NEW.is_active IS NOT TRUE THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO active_count
  FROM assistant_plugin_activations
  WHERE assistant_id = NEW.assistant_id
    AND is_active = true
    AND id IS DISTINCT FROM NEW.id;

  IF active_count >= 5 THEN
    RAISE EXCEPTION 'Maximum 5 active plugins per assistant';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_max_active_plugins
  BEFORE INSERT OR UPDATE ON assistant_plugin_activations
  FOR EACH ROW EXECUTE FUNCTION check_max_active_plugins();


-- ============================================================================
-- 13. SKILL SYSTEM (3-tier, mirrors plugins but for prompt-only guidance)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 13a. skill_catalog — Global registry of importable skills
-- --------------------------------------------------------------------------

CREATE TABLE skill_catalog (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  raw_content       TEXT NOT NULL,
  sanitized_content TEXT NOT NULL,
  frontmatter       JSONB NOT NULL DEFAULT '{}',
  source            TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('openclaw', 'manual')),
  source_path       TEXT,
  source_commit     TEXT,
  content_hash      TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'approved', 'deprecated')),
  content_chars     INT NOT NULL,
  import_warnings   JSONB,
  approved_at       TIMESTAMPTZ,
  approved_by       UUID REFERENCES profiles(id),
  review_notes      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_skill_catalog_status ON skill_catalog(status);
CREATE INDEX idx_skill_catalog_source ON skill_catalog(source);

ALTER TABLE skill_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view approved skills" ON skill_catalog
  FOR SELECT USING (auth.uid() IS NOT NULL AND status = 'approved');

CREATE POLICY "Service role full access on skill_catalog" ON skill_catalog
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 13b. org_skill_installations — Org-scoped skill installs
-- --------------------------------------------------------------------------

CREATE TABLE org_skill_installations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  skill_id     UUID NOT NULL REFERENCES skill_catalog(id) ON DELETE CASCADE,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  installed_by UUID REFERENCES profiles(id),

  UNIQUE (org_id, skill_id)
);

CREATE INDEX idx_org_skill_installations_org ON org_skill_installations(org_id);

ALTER TABLE org_skill_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view skill installations" ON org_skill_installations
  FOR SELECT USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can install skills" ON org_skill_installations
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admins can uninstall skills" ON org_skill_installations
  FOR DELETE USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Service role full access on skill_installations" ON org_skill_installations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- --------------------------------------------------------------------------
-- 13c. assistant_skill_activations — Per-assistant skill toggles
-- --------------------------------------------------------------------------

CREATE TABLE assistant_skill_activations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id    UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  installation_id UUID NOT NULL REFERENCES org_skill_installations(id) ON DELETE CASCADE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 100,
  activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (assistant_id, installation_id)
);

CREATE INDEX idx_assistant_skill_activations_assistant ON assistant_skill_activations(assistant_id);

ALTER TABLE assistant_skill_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view skill activations" ON assistant_skill_activations
  FOR SELECT USING (
    installation_id IN (
      SELECT osi.id FROM org_skill_installations osi
      JOIN organization_members om ON om.organization_id = osi.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can manage skill activations" ON assistant_skill_activations
  FOR ALL USING (
    installation_id IN (
      SELECT osi.id FROM org_skill_installations osi
      JOIN organization_members om ON om.organization_id = osi.org_id
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Service role full access on skill_activations" ON assistant_skill_activations
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- 14. CONVERSATION COMPACTION
-- ============================================================================
-- Rolling summaries for context window management. One per conversation.

CREATE TABLE assistant_conversation_summaries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL UNIQUE,
  content         TEXT NOT NULL,
  message_count   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conv_summaries_conversation
  ON assistant_conversation_summaries(conversation_id);


-- ============================================================================
-- 15. CONCURRENCY CONTROL
-- ============================================================================
-- Prevents two workers from processing the same conversation simultaneously.

CREATE TABLE assistant_conversation_locks (
  assistant_id     UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  channel_id       UUID NOT NULL,
  external_chat_id TEXT NOT NULL,
  locked_by        TEXT,
  locked_until     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (assistant_id, channel_id, external_chat_id)
);

CREATE INDEX idx_conversation_locks_until
  ON assistant_conversation_locks(locked_until)
  WHERE locked_until IS NOT NULL;

ALTER TABLE assistant_conversation_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on conversation_locks" ON assistant_conversation_locks
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- 16. WORKER HEALTH
-- ============================================================================

CREATE TABLE vps_health_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations(id),
  instance_id           TEXT NOT NULL,
  cpu_percent           NUMERIC(5,2),
  ram_percent           NUMERIC(5,2),
  disk_percent          NUMERIC(5,2),
  worker_pending_events INT DEFAULT 0,
  worker_dead_letters   INT DEFAULT 0,
  openclaw_version      TEXT,
  last_sync_at          TIMESTAMPTZ,
  reported_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vps_health_org ON vps_health_snapshots(org_id, reported_at DESC);

ALTER TABLE vps_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view health snapshots" ON vps_health_snapshots
  FOR SELECT USING (
    org_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access on vps_health" ON vps_health_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- 17. RPC FUNCTIONS
-- ============================================================================

-- --------------------------------------------------------------------------
-- 17a. claim_next_inbound_event — Atomic claim with FOR UPDATE SKIP LOCKED
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION claim_next_inbound_event(
  p_worker_id  TEXT,
  p_batch_size INTEGER DEFAULT 1
)
RETURNS SETOF assistant_inbound_events
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE assistant_inbound_events
  SET
    status       = 'processing',
    locked_at    = NOW(),
    locked_by    = p_worker_id,
    locked_until = NOW() + INTERVAL '15 minutes',
    attempts     = attempts + 1
  WHERE id IN (
    SELECT ie.id FROM assistant_inbound_events ie
    WHERE ie.status = 'pending'
      AND (ie.next_attempt_at IS NULL OR ie.next_attempt_at <= NOW())
      AND ie.attempts < ie.max_attempts
    ORDER BY ie.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  RETURNING *;
END;
$$;

-- --------------------------------------------------------------------------
-- 17b. claim_next_outbound_event — Same pattern for outbound
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION claim_next_outbound_event(
  p_worker_id   TEXT,
  p_batch_size  INTEGER DEFAULT 1,
  p_runtime_id  TEXT DEFAULT NULL
)
RETURNS SETOF assistant_outbound_events
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE assistant_outbound_events
  SET
    status       = 'processing',
    locked_at    = NOW(),
    locked_by    = p_worker_id,
    locked_until = NOW() + INTERVAL '15 minutes',
    attempts     = attempts + 1
  WHERE id IN (
    SELECT oe.id
    FROM assistant_outbound_events oe
    WHERE oe.status = 'pending'
      AND (oe.next_attempt_at IS NULL OR oe.next_attempt_at <= NOW())
      AND oe.attempts < oe.max_attempts
      AND (
        p_runtime_id IS NULL
        OR EXISTS (
          SELECT 1 FROM ai_assistants a
          WHERE a.id = oe.assistant_id
            AND a.runtime_id::TEXT = p_runtime_id
        )
      )
    ORDER BY oe.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  RETURNING *;
END;
$$;

-- --------------------------------------------------------------------------
-- 17c. reset_stuck_events — Cleanup job for expired leases
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reset_stuck_events()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  inbound_reset  INTEGER;
  outbound_reset INTEGER;
BEGIN
  WITH ri AS (
    UPDATE assistant_inbound_events
    SET status = 'pending', locked_at = NULL, locked_by = NULL, locked_until = NULL
    WHERE status = 'processing' AND locked_until < NOW()
    RETURNING id
  ) SELECT COUNT(*) INTO inbound_reset FROM ri;

  WITH ro AS (
    UPDATE assistant_outbound_events
    SET status = 'pending', locked_at = NULL, locked_by = NULL, locked_until = NULL
    WHERE status = 'processing' AND locked_until < NOW()
    RETURNING id
  ) SELECT COUNT(*) INTO outbound_reset FROM ro;

  RETURN json_build_object(
    'inbound_reset', inbound_reset,
    'outbound_reset', outbound_reset,
    'reset_at', NOW()
  );
END;
$$;

-- --------------------------------------------------------------------------
-- 17d. get_or_create_conversation — Upsert conversation
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_or_create_conversation(
  p_assistant_id    UUID,
  p_channel_id      UUID,
  p_external_user_id TEXT,
  p_external_chat_id TEXT
)
RETURNS assistant_conversations
LANGUAGE plpgsql
AS $$
DECLARE
  v_conversation assistant_conversations;
BEGIN
  SELECT * INTO v_conversation
  FROM assistant_conversations
  WHERE channel_id = p_channel_id
    AND external_user_id = p_external_user_id
    AND external_chat_id = p_external_chat_id
    AND is_active = true;

  IF NOT FOUND THEN
    INSERT INTO assistant_conversations (
      assistant_id, channel_id, external_user_id, external_chat_id
    ) VALUES (
      p_assistant_id, p_channel_id, p_external_user_id, p_external_chat_id
    )
    RETURNING * INTO v_conversation;
  ELSE
    UPDATE assistant_conversations SET updated_at = NOW()
    WHERE id = v_conversation.id;
  END IF;

  RETURN v_conversation;
END;
$$;

-- --------------------------------------------------------------------------
-- 17e. search_memory — Vector similarity search
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION search_memory(
  p_assistant_id     UUID,
  p_query_embedding  vector(1536),
  p_limit            INTEGER DEFAULT 5,
  p_threshold        NUMERIC DEFAULT 0.7
)
RETURNS TABLE (
  id         UUID,
  content    TEXT,
  category   TEXT,
  importance NUMERIC,
  similarity NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.category,
    m.importance,
    (1 - (m.embedding <=> p_query_embedding))::NUMERIC AS similarity
  FROM assistant_memory m
  WHERE m.assistant_id = p_assistant_id
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> p_query_embedding)) >= p_threshold
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

-- --------------------------------------------------------------------------
-- 17f. get_recent_memories_v2 — Encrypted memory retrieval
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_recent_memories_v2(
  p_assistant_id   UUID,
  p_scoped_user_id TEXT,
  p_limit          INT DEFAULT 10
)
RETURNS TABLE (
  id               UUID,
  content          TEXT,
  content_encrypted TEXT,
  content_iv       TEXT,
  content_auth_tag TEXT,
  encryption_mode  TEXT,
  key_id           TEXT,
  category         TEXT,
  importance       FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT m.id, m.content, m.content_encrypted, m.content_iv, m.content_auth_tag,
         m.encryption_mode, m.key_id, m.category, m.importance::FLOAT
  FROM assistant_memory m
  WHERE m.assistant_id = p_assistant_id
    AND m.scoped_user_id = p_scoped_user_id
  ORDER BY m.last_accessed_at DESC NULLS LAST
  LIMIT p_limit;
$$;

-- --------------------------------------------------------------------------
-- 17g. get_assistant_active_plugins — Join all 3 plugin tiers
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_assistant_active_plugins(p_assistant_id UUID)
RETURNS TABLE (
  plugin_slug       TEXT,
  plugin_name       TEXT,
  tool_manifest     JSONB,
  enabled_tools     TEXT[],
  plugin_config     JSONB,
  org_config        JSONB,
  installed_version TEXT,
  source            TEXT,
  mcpgate_server_id TEXT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    pc.slug,
    pc.name,
    opi.manifest_snapshot,
    apa.enabled_tools,
    apa.config,
    opi.config,
    opi.installed_version,
    pc.source,
    pc.mcpgate_server_id
  FROM assistant_plugin_activations apa
  JOIN org_plugin_installations opi ON opi.id = apa.installation_id
  JOIN plugin_catalog pc ON pc.id = opi.plugin_id
  WHERE apa.assistant_id = p_assistant_id
    AND apa.is_active = true
    AND pc.is_published = true;
$$;

-- --------------------------------------------------------------------------
-- 17h. get_assistant_active_skills — Join all 3 skill tiers
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_assistant_active_skills(p_assistant_id UUID)
RETURNS TABLE (
  skill_slug        TEXT,
  skill_name        TEXT,
  skill_description TEXT,
  sanitized_content TEXT,
  frontmatter       JSONB,
  sort_order        INT,
  content_chars     INT
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sc.slug,
    sc.name,
    sc.description,
    sc.sanitized_content,
    sc.frontmatter,
    asa.sort_order,
    sc.content_chars
  FROM assistant_skill_activations asa
  JOIN org_skill_installations osi ON osi.id = asa.installation_id
  JOIN skill_catalog sc ON sc.id = osi.skill_id
  JOIN ai_assistants aa ON aa.id = asa.assistant_id AND aa.org_id = osi.org_id
  WHERE asa.assistant_id = p_assistant_id
    AND asa.is_active = true
    AND sc.status = 'approved'
  ORDER BY asa.sort_order ASC, sc.name ASC;
$$;

-- --------------------------------------------------------------------------
-- 17i. create_user_atomic — JIT user creation with personal workspace
-- --------------------------------------------------------------------------
-- Atomically creates profile + identity_link + organization + project +
-- environment. Race-safe via FOR UPDATE NOWAIT on identity_links.

CREATE OR REPLACE FUNCTION create_user_atomic(
  p_privy_id    TEXT,
  p_handle      TEXT,
  p_email       TEXT DEFAULT NULL,
  p_avatar_url  TEXT DEFAULT NULL,
  p_first_name  TEXT DEFAULT NULL,
  p_last_name   TEXT DEFAULT NULL,
  p_provider    TEXT DEFAULT 'privy'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID;
  v_org_id         UUID;
  v_project_id     UUID;
  v_env_id         UUID;
  v_workspace_name TEXT;
  v_full_name      TEXT;
  v_provider       TEXT;
BEGIN
  -- Resolve provider (default 'privy' for backwards compat)
  v_provider := COALESCE(p_provider, 'privy');

  -- Step 1: Check if user already exists (race protection)
  BEGIN
    SELECT user_id INTO v_user_id
    FROM identity_links
    WHERE provider = v_provider AND external_id = p_privy_id
    FOR UPDATE NOWAIT;

    IF FOUND THEN RETURN v_user_id; END IF;
  EXCEPTION
    WHEN lock_not_available THEN
      PERFORM pg_sleep(0.1);
      SELECT user_id INTO v_user_id
      FROM identity_links
      WHERE provider = v_provider AND external_id = p_privy_id;
      IF FOUND THEN RETURN v_user_id; END IF;
  END;

  -- Step 2: Build display name
  v_full_name := TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, ''));
  IF v_full_name = '' THEN v_full_name := p_handle; END IF;

  -- Step 3: Create profile
  INSERT INTO profiles (
    handle, email, first_name, last_name, name,
    avatar_url, profile_public, last_login_at, created_at, updated_at
  ) VALUES (
    p_handle, p_email,
    COALESCE(p_first_name, ''), COALESCE(p_last_name, ''),
    v_full_name, p_avatar_url, false, NOW(), NOW(), NOW()
  )
  ON CONFLICT (handle) DO UPDATE SET last_login_at = NOW(), updated_at = NOW()
  RETURNING id INTO v_user_id;

  -- Step 4: Create identity link
  INSERT INTO identity_links (user_id, provider, external_id, created_at)
  VALUES (v_user_id, v_provider, p_privy_id, NOW())
  ON CONFLICT (provider, external_id) DO NOTHING;

  -- Step 5: Create personal workspace (organization)
  IF p_first_name IS NOT NULL AND p_first_name != '' THEN
    v_workspace_name := p_first_name || '''s Workspace';
  ELSE
    v_workspace_name := p_handle || '''s Workspace';
  END IF;

  INSERT INTO organizations (slug, name, type, created_by, created_at, updated_at)
  VALUES (p_handle, v_workspace_name, 'personal', v_user_id, NOW(), NOW())
  RETURNING id INTO v_org_id;

  -- Step 6: Create default project
  INSERT INTO projects (org_id, name, slug, created_by, is_default)
  VALUES (v_org_id, 'Default', 'default', v_user_id, true)
  RETURNING id INTO v_project_id;

  -- Step 7: Create default environment
  INSERT INTO environments (project_id, name, is_default)
  VALUES (v_project_id, 'Development', true)
  RETURNING id INTO v_env_id;

  RETURN v_user_id;
EXCEPTION
  WHEN OTHERS THEN RAISE;
END;
$$;


-- ============================================================================
-- 18. GRANTS (service_role access for the worker)
-- ============================================================================
-- The worker connects with the service_role key and needs unrestricted access
-- to event tables, conversations, messages, memory, and RPC functions.

-- Tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- RPC functions
GRANT EXECUTE ON FUNCTION claim_next_inbound_event TO service_role;
GRANT EXECUTE ON FUNCTION claim_next_outbound_event TO service_role;
GRANT EXECUTE ON FUNCTION reset_stuck_events TO service_role;
GRANT EXECUTE ON FUNCTION get_or_create_conversation TO service_role;
GRANT EXECUTE ON FUNCTION search_memory TO service_role;
GRANT EXECUTE ON FUNCTION get_recent_memories_v2 TO service_role;
GRANT EXECUTE ON FUNCTION get_assistant_active_plugins TO service_role;
GRANT EXECUTE ON FUNCTION get_assistant_active_skills TO service_role;
GRANT EXECUTE ON FUNCTION create_user_atomic TO service_role;
GRANT EXECUTE ON FUNCTION create_user_atomic TO authenticated;

-- Anon role gets read on public tables
GRANT SELECT ON profiles TO anon;
GRANT SELECT ON organizations TO anon;
GRANT SELECT ON organization_members TO anon;
GRANT SELECT ON plugin_catalog TO anon;

-- Authenticated role
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT SELECT ON organizations TO authenticated;
GRANT SELECT, INSERT ON organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON organization_members TO authenticated;
GRANT SELECT ON projects TO authenticated;
GRANT SELECT ON environments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_assistants TO authenticated;
GRANT SELECT ON assistant_channels TO authenticated;
GRANT SELECT ON assistant_conversations TO authenticated;
GRANT SELECT ON assistant_messages TO authenticated;
GRANT SELECT ON assistant_memory TO authenticated;
GRANT SELECT ON plugin_catalog TO authenticated;
GRANT SELECT, INSERT, DELETE ON org_plugin_installations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_plugin_activations TO authenticated;
GRANT SELECT ON skill_catalog TO authenticated;
GRANT SELECT, INSERT, DELETE ON org_skill_installations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assistant_skill_activations TO authenticated;
GRANT SELECT ON vps_health_snapshots TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_atomic TO authenticated;


COMMIT;

-- ============================================================================
-- DONE
-- ============================================================================
-- This schema provides everything needed for a working self-hosted Lucid
-- instance: user auth, multi-tenancy, agent CRUD, multi-channel chat,
-- worker event queue, vector memory, plugin/skill catalogs, and JIT user
-- creation.
--
-- Next steps for the self-hosted operator:
--   1. Run this file against a fresh PostgreSQL 15+ database with pgvector
--   2. Set SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or direct PG conn)
--   3. Start the Next.js app and the worker service
--   4. Create your first user via the UI (triggers create_user_atomic)
-- ============================================================================
