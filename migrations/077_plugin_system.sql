-- Migration 077: Plugin System
-- Adds plugin catalog, org installations, assistant activations
-- Follows 3-layer model: Catalog → Org Install → Assistant Activate

-- =============================================================================
-- Table 1: plugin_catalog (global registry of available plugins)
-- =============================================================================

CREATE TABLE plugin_catalog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  version       TEXT NOT NULL DEFAULT '1.0.0',
  author        TEXT DEFAULT 'RaijinLabs',
  license       TEXT DEFAULT 'MIT',
  icon_url      TEXT,
  category      TEXT NOT NULL DEFAULT 'general',

  -- Tool manifest: Array of { name, description, parameters (JSON Schema) }
  tool_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Requirements
  requires_env  TEXT[] DEFAULT '{}',

  -- Execution routing
  source        TEXT NOT NULL DEFAULT 'first-party',
  mcpgate_server_id TEXT,
  risk_level    TEXT NOT NULL DEFAULT 'read',
  verified      BOOLEAN NOT NULL DEFAULT false,

  -- Safety cap for system prompt size
  max_tools     INT NOT NULL DEFAULT 20,

  -- Metadata
  source_repo   TEXT,
  is_published  BOOLEAN NOT NULL DEFAULT true,

  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- Table 2: org_plugin_installations (per-tenant, pins version + manifest snapshot)
-- =============================================================================

CREATE TABLE org_plugin_installations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plugin_id          UUID NOT NULL REFERENCES plugin_catalog(id) ON DELETE CASCADE,
  installed_version  TEXT NOT NULL,
  manifest_snapshot  JSONB NOT NULL,

  config             JSONB DEFAULT '{}'::jsonb,
  installed_at       TIMESTAMPTZ DEFAULT now(),
  installed_by       UUID REFERENCES profiles(id),

  UNIQUE(org_id, plugin_id)
);

-- =============================================================================
-- Table 3: assistant_plugin_activations (per-assistant, FK to installation)
-- =============================================================================

CREATE TABLE assistant_plugin_activations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id    UUID NOT NULL REFERENCES ai_assistants(id) ON DELETE CASCADE,
  installation_id UUID NOT NULL REFERENCES org_plugin_installations(id) ON DELETE CASCADE,

  enabled_tools   TEXT[],
  config          JSONB DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  activated_at    TIMESTAMPTZ DEFAULT now(),

  UNIQUE(assistant_id, installation_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_plugin_catalog_category ON plugin_catalog(category);
CREATE INDEX idx_plugin_catalog_source ON plugin_catalog(source);
CREATE INDEX idx_org_plugins_org_id ON org_plugin_installations(org_id);
CREATE INDEX idx_assistant_plugins_assistant_id ON assistant_plugin_activations(assistant_id);
CREATE INDEX idx_assistant_plugins_active ON assistant_plugin_activations(assistant_id) WHERE is_active = true;

-- =============================================================================
-- Updated_at trigger for plugin_catalog
-- =============================================================================

CREATE OR REPLACE FUNCTION update_plugin_catalog_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_plugin_catalog_updated_at
  BEFORE UPDATE ON plugin_catalog
  FOR EACH ROW EXECUTE FUNCTION update_plugin_catalog_updated_at();

-- =============================================================================
-- Max active plugins per assistant (hard cap = 5, defense in depth)
-- =============================================================================

CREATE OR REPLACE FUNCTION check_max_active_plugins()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  active_count INT;
BEGIN
  IF NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

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

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- plugin_catalog: readable by all authenticated users
ALTER TABLE plugin_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published plugins" ON plugin_catalog
  FOR SELECT
  USING (is_published = true);

-- org_plugin_installations: org members only
ALTER TABLE org_plugin_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view installations" ON org_plugin_installations
  FOR SELECT
  USING (
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can install plugins" ON org_plugin_installations
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admins can uninstall plugins" ON org_plugin_installations
  FOR DELETE
  USING (
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- assistant_plugin_activations: org members who own the assistant's org
ALTER TABLE assistant_plugin_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view activations" ON assistant_plugin_activations
  FOR SELECT
  USING (
    installation_id IN (
      SELECT opi.id FROM org_plugin_installations opi
      JOIN organization_members om ON om.org_id = opi.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can activate plugins" ON assistant_plugin_activations
  FOR INSERT
  WITH CHECK (
    installation_id IN (
      SELECT opi.id FROM org_plugin_installations opi
      JOIN organization_members om ON om.org_id = opi.org_id
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org members can update activations" ON assistant_plugin_activations
  FOR UPDATE
  USING (
    installation_id IN (
      SELECT opi.id FROM org_plugin_installations opi
      JOIN organization_members om ON om.org_id = opi.org_id
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org members can deactivate plugins" ON assistant_plugin_activations
  FOR DELETE
  USING (
    installation_id IN (
      SELECT opi.id FROM org_plugin_installations opi
      JOIN organization_members om ON om.org_id = opi.org_id
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- RPC: get_assistant_active_plugins (called from worker with service role key)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_assistant_active_plugins(p_assistant_id UUID)
RETURNS TABLE (
  plugin_slug        TEXT,
  plugin_name        TEXT,
  tool_manifest      JSONB,
  enabled_tools      TEXT[],
  plugin_config      JSONB,
  org_config         JSONB,
  installed_version  TEXT,
  source             TEXT,
  mcpgate_server_id  TEXT
) LANGUAGE sql STABLE AS $$
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

-- =============================================================================
-- Plan Gating: Feature flags + limits
-- =============================================================================

-- Feature: plugins_enabled
UPDATE plans SET features = COALESCE(features, '{}'::jsonb) || '{"plugins_enabled": false}'::jsonb
  WHERE name = 'starter';
UPDATE plans SET features = COALESCE(features, '{}'::jsonb) || '{"plugins_enabled": true}'::jsonb
  WHERE name IN ('pro', 'business');

-- Limit: max_plugins_per_assistant
UPDATE plans SET limits = COALESCE(limits, '{}'::jsonb) || '{"max_plugins_per_assistant": 0}'::jsonb
  WHERE name = 'starter';
UPDATE plans SET limits = COALESCE(limits, '{}'::jsonb) || '{"max_plugins_per_assistant": 3}'::jsonb
  WHERE name = 'pro';
UPDATE plans SET limits = COALESCE(limits, '{}'::jsonb) || '{"max_plugins_per_assistant": 5}'::jsonb
  WHERE name = 'business';

-- Limit: max_plugin_tools_total (across all plugins per assistant)
UPDATE plans SET limits = COALESCE(limits, '{}'::jsonb) || '{"max_plugin_tools_total": 0}'::jsonb
  WHERE name = 'starter';
UPDATE plans SET limits = COALESCE(limits, '{}'::jsonb) || '{"max_plugin_tools_total": 30}'::jsonb
  WHERE name = 'pro';
UPDATE plans SET limits = COALESCE(limits, '{}'::jsonb) || '{"max_plugin_tools_total": 100}'::jsonb
  WHERE name = 'business';

-- =============================================================================
-- Service role grants (worker access)
-- =============================================================================

GRANT SELECT ON plugin_catalog TO service_role;
GRANT SELECT ON org_plugin_installations TO service_role;
GRANT SELECT ON assistant_plugin_activations TO service_role;
GRANT EXECUTE ON FUNCTION get_assistant_active_plugins TO service_role;

-- =============================================================================
-- Seed: Lucid Skills catalog entries
-- =============================================================================

INSERT INTO plugin_catalog (slug, name, description, version, category, tool_manifest, source_repo, source, verified) VALUES
('lucid-trade', 'Lucid Trade', 'Crypto trading intelligence: technical analysis, position sizing, risk management, backtesting', '5.0.0', 'trading',
 '[{"name":"market_analysis","description":"Run technical analysis on a crypto market","parameters":{"type":"object","properties":{"symbol":{"type":"string","description":"Trading pair symbol"},"timeframe":{"type":"string","description":"Analysis timeframe"}},"required":["symbol"]}},{"name":"position_sizing","description":"Calculate optimal position size based on risk parameters","parameters":{"type":"object","properties":{"symbol":{"type":"string"},"risk_percent":{"type":"number"}},"required":["symbol"]}},{"name":"risk_assessment","description":"Assess portfolio risk exposure","parameters":{"type":"object","properties":{"portfolio":{"type":"array","items":{"type":"object"}}},"required":["portfolio"]}},{"name":"backtest","description":"Backtest a trading strategy on historical data","parameters":{"type":"object","properties":{"strategy":{"type":"string"},"symbol":{"type":"string"},"period":{"type":"string"}},"required":["strategy","symbol"]}},{"name":"portfolio_analysis","description":"Analyze current portfolio allocation and performance","parameters":{"type":"object","properties":{"portfolio":{"type":"array","items":{"type":"object"}}},"required":["portfolio"]}},{"name":"entry_exit_signals","description":"Generate entry and exit signals for a trading pair","parameters":{"type":"object","properties":{"symbol":{"type":"string"},"strategy":{"type":"string"}},"required":["symbol"]}},{"name":"correlation_matrix","description":"Calculate correlation between multiple assets","parameters":{"type":"object","properties":{"symbols":{"type":"array","items":{"type":"string"}}},"required":["symbols"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-seo', 'Lucid SEO', 'SEO intelligence: keyword research, SERP analysis, content optimization, competitor tracking', '1.0.0', 'marketing',
 '[{"name":"research_keywords","description":"Research keywords for SEO targeting","parameters":{"type":"object","properties":{"seed":{"type":"string"},"language":{"type":"string"}},"required":["seed"]}},{"name":"analyze_serp","description":"Analyze search engine results page","parameters":{"type":"object","properties":{"keyword":{"type":"string"}},"required":["keyword"]}},{"name":"optimize_content","description":"Suggest SEO optimizations for content","parameters":{"type":"object","properties":{"content":{"type":"string"},"target_keyword":{"type":"string"}},"required":["content","target_keyword"]}},{"name":"competitor_analysis","description":"Analyze competitor SEO strategy","parameters":{"type":"object","properties":{"domain":{"type":"string"}},"required":["domain"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-veille', 'Lucid Veille', 'Competitive intelligence: market monitoring, trend detection, news aggregation', '1.0.0', 'intelligence',
 '[{"name":"monitor_market","description":"Monitor market trends and news","parameters":{"type":"object","properties":{"topics":{"type":"array","items":{"type":"string"}}},"required":["topics"]}},{"name":"detect_trends","description":"Detect emerging trends in a sector","parameters":{"type":"object","properties":{"sector":{"type":"string"}},"required":["sector"]}},{"name":"aggregate_news","description":"Aggregate relevant news from multiple sources","parameters":{"type":"object","properties":{"query":{"type":"string"},"sources":{"type":"array","items":{"type":"string"}}},"required":["query"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-predict', 'Lucid Predict', 'Market prediction with sentiment analysis and on-chain data', '1.0.0', 'trading',
 '[{"name":"sentiment_analysis","description":"Analyze market sentiment from social media and news","parameters":{"type":"object","properties":{"asset":{"type":"string"}},"required":["asset"]}},{"name":"price_prediction","description":"Generate price prediction based on multiple signals","parameters":{"type":"object","properties":{"symbol":{"type":"string"},"horizon":{"type":"string"}},"required":["symbol"]}},{"name":"onchain_signals","description":"Analyze on-chain metrics for trading signals","parameters":{"type":"object","properties":{"chain":{"type":"string"},"address":{"type":"string"}},"required":["chain"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-content', 'Lucid Content', 'Content creation: blog posts, social media, copywriting with brand voice', '1.0.0', 'content',
 '[{"name":"generate_blog_post","description":"Generate a blog post on a given topic","parameters":{"type":"object","properties":{"topic":{"type":"string"},"tone":{"type":"string"},"length":{"type":"string"}},"required":["topic"]}},{"name":"social_media_post","description":"Create social media content","parameters":{"type":"object","properties":{"platform":{"type":"string"},"topic":{"type":"string"}},"required":["platform","topic"]}},{"name":"copywriting","description":"Generate marketing copy","parameters":{"type":"object","properties":{"product":{"type":"string"},"audience":{"type":"string"},"style":{"type":"string"}},"required":["product"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-research', 'Lucid Research', 'Deep research: multi-source synthesis, fact-checking, citation generation', '1.0.0', 'research',
 '[{"name":"deep_research","description":"Conduct deep research on a topic across multiple sources","parameters":{"type":"object","properties":{"query":{"type":"string"},"depth":{"type":"string"}},"required":["query"]}},{"name":"fact_check","description":"Verify claims against reliable sources","parameters":{"type":"object","properties":{"claim":{"type":"string"}},"required":["claim"]}},{"name":"generate_citations","description":"Generate properly formatted citations","parameters":{"type":"object","properties":{"sources":{"type":"array","items":{"type":"string"}},"format":{"type":"string"}},"required":["sources"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-data', 'Lucid Data', 'Data analysis: CSV/JSON processing, visualization, statistical analysis', '1.0.0', 'data',
 '[{"name":"analyze_data","description":"Analyze structured data and generate insights","parameters":{"type":"object","properties":{"data":{"type":"string"},"question":{"type":"string"}},"required":["data"]}},{"name":"visualize","description":"Generate data visualization specifications","parameters":{"type":"object","properties":{"data":{"type":"string"},"chart_type":{"type":"string"}},"required":["data"]}},{"name":"statistics","description":"Run statistical analysis on dataset","parameters":{"type":"object","properties":{"data":{"type":"string"},"tests":{"type":"array","items":{"type":"string"}}},"required":["data"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-email', 'Lucid Email', 'Email automation: drafting, scheduling, campaign management', '1.0.0', 'communication',
 '[{"name":"draft_email","description":"Draft a professional email","parameters":{"type":"object","properties":{"to":{"type":"string"},"subject":{"type":"string"},"context":{"type":"string"},"tone":{"type":"string"}},"required":["context"]}},{"name":"email_campaign","description":"Create an email campaign sequence","parameters":{"type":"object","properties":{"goal":{"type":"string"},"audience":{"type":"string"},"steps":{"type":"number"}},"required":["goal"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-code', 'Lucid Code', 'Code generation: scaffolding, refactoring, code review, documentation', '1.0.0', 'development',
 '[{"name":"generate_code","description":"Generate code from a specification","parameters":{"type":"object","properties":{"spec":{"type":"string"},"language":{"type":"string"},"framework":{"type":"string"}},"required":["spec"]}},{"name":"code_review","description":"Review code for issues and improvements","parameters":{"type":"object","properties":{"code":{"type":"string"},"language":{"type":"string"}},"required":["code"]}},{"name":"refactor","description":"Suggest refactoring improvements","parameters":{"type":"object","properties":{"code":{"type":"string"},"goals":{"type":"array","items":{"type":"string"}}},"required":["code"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-legal', 'Lucid Legal', 'Legal document analysis: contract review, clause extraction, compliance check', '1.0.0', 'legal',
 '[{"name":"review_contract","description":"Review a legal contract and highlight key clauses","parameters":{"type":"object","properties":{"document":{"type":"string"},"focus_areas":{"type":"array","items":{"type":"string"}}},"required":["document"]}},{"name":"compliance_check","description":"Check document against regulatory requirements","parameters":{"type":"object","properties":{"document":{"type":"string"},"regulations":{"type":"array","items":{"type":"string"}}},"required":["document"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-finance', 'Lucid Finance', 'Financial analysis: DCF modeling, ratio analysis, earnings reports', '1.0.0', 'finance',
 '[{"name":"dcf_model","description":"Build a discounted cash flow model","parameters":{"type":"object","properties":{"company":{"type":"string"},"projections":{"type":"object"}},"required":["company"]}},{"name":"ratio_analysis","description":"Calculate and interpret financial ratios","parameters":{"type":"object","properties":{"financials":{"type":"object"}},"required":["financials"]}},{"name":"earnings_analysis","description":"Analyze quarterly earnings report","parameters":{"type":"object","properties":{"ticker":{"type":"string"},"quarter":{"type":"string"}},"required":["ticker"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-social', 'Lucid Social', 'Social media management: scheduling, analytics, audience insights', '1.0.0', 'marketing',
 '[{"name":"schedule_post","description":"Schedule a social media post","parameters":{"type":"object","properties":{"platform":{"type":"string"},"content":{"type":"string"},"schedule_time":{"type":"string"}},"required":["platform","content"]}},{"name":"audience_insights","description":"Analyze audience demographics and behavior","parameters":{"type":"object","properties":{"platform":{"type":"string"},"account":{"type":"string"}},"required":["platform"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-translate', 'Lucid Translate', 'Translation and localization with context awareness', '1.0.0', 'content',
 '[{"name":"translate","description":"Translate text with context awareness","parameters":{"type":"object","properties":{"text":{"type":"string"},"source_lang":{"type":"string"},"target_lang":{"type":"string"},"context":{"type":"string"}},"required":["text","target_lang"]}},{"name":"localize","description":"Adapt content for a specific locale","parameters":{"type":"object","properties":{"content":{"type":"string"},"locale":{"type":"string"}},"required":["content","locale"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-security', 'Lucid Security', 'Security analysis: vulnerability scanning, threat assessment, compliance', '1.0.0', 'security',
 '[{"name":"scan_vulnerabilities","description":"Scan code or config for security vulnerabilities","parameters":{"type":"object","properties":{"target":{"type":"string"},"scan_type":{"type":"string"}},"required":["target"]}},{"name":"threat_assessment","description":"Assess threat landscape for a system","parameters":{"type":"object","properties":{"system_description":{"type":"string"}},"required":["system_description"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-defi', 'Lucid DeFi', 'DeFi analytics: yield farming, liquidity analysis, protocol comparison', '1.0.0', 'defi',
 '[{"name":"yield_analysis","description":"Analyze yield farming opportunities","parameters":{"type":"object","properties":{"protocol":{"type":"string"},"chain":{"type":"string"}},"required":["protocol"]}},{"name":"liquidity_analysis","description":"Analyze liquidity pool metrics","parameters":{"type":"object","properties":{"pool":{"type":"string"},"chain":{"type":"string"}},"required":["pool"]}},{"name":"protocol_comparison","description":"Compare DeFi protocols on key metrics","parameters":{"type":"object","properties":{"protocols":{"type":"array","items":{"type":"string"}},"metrics":{"type":"array","items":{"type":"string"}}},"required":["protocols"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-nft', 'Lucid NFT', 'NFT analytics: collection analysis, rarity scoring, market trends', '1.0.0', 'blockchain',
 '[{"name":"collection_analysis","description":"Analyze an NFT collection","parameters":{"type":"object","properties":{"collection":{"type":"string"},"chain":{"type":"string"}},"required":["collection"]}},{"name":"rarity_score","description":"Calculate rarity scores for NFT traits","parameters":{"type":"object","properties":{"collection":{"type":"string"},"token_id":{"type":"string"}},"required":["collection","token_id"]}},{"name":"market_trends","description":"Track NFT market trends","parameters":{"type":"object","properties":{"timeframe":{"type":"string"}}}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-onchain', 'Lucid Onchain', 'On-chain analytics: wallet tracking, transaction analysis, whale alerts', '1.0.0', 'blockchain',
 '[{"name":"track_wallet","description":"Track a wallet address activity","parameters":{"type":"object","properties":{"address":{"type":"string"},"chain":{"type":"string"}},"required":["address"]}},{"name":"transaction_analysis","description":"Analyze transaction patterns","parameters":{"type":"object","properties":{"address":{"type":"string"},"chain":{"type":"string"},"period":{"type":"string"}},"required":["address"]}},{"name":"whale_alerts","description":"Monitor large transactions","parameters":{"type":"object","properties":{"chain":{"type":"string"},"min_value":{"type":"number"}},"required":["chain"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true),

('lucid-productivity', 'Lucid Productivity', 'Task management: planning, prioritization, time tracking', '1.0.0', 'productivity',
 '[{"name":"create_plan","description":"Create a structured project plan","parameters":{"type":"object","properties":{"project":{"type":"string"},"goals":{"type":"array","items":{"type":"string"}}},"required":["project"]}},{"name":"prioritize_tasks","description":"Prioritize a list of tasks using Eisenhower matrix","parameters":{"type":"object","properties":{"tasks":{"type":"array","items":{"type":"string"}}},"required":["tasks"]}}]'::jsonb,
 'raijinlabs/lucid-skills', 'first-party', true);
