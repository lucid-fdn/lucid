-- Migration 012: Webhook System
-- Phase 3C Week 1 Day 1-2
-- Creates tables for webhook triggers and logs

-- ============================================
-- WEBHOOKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS workflow_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  path TEXT UNIQUE NOT NULL,
  method TEXT DEFAULT 'POST' CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
  api_key TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  description TEXT,
  -- Statistics for webhook health
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_webhooks_path ON workflow_webhooks(path);
CREATE INDEX IF NOT EXISTS idx_webhooks_workflow ON workflow_webhooks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON workflow_webhooks(enabled) WHERE enabled = true;

-- ============================================
-- WEBHOOK LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES workflow_webhooks(id) ON DELETE CASCADE,
  workflow_execution_id UUID REFERENCES workflow_executions(id),
  request_method TEXT,
  request_headers JSONB,
  request_body JSONB,
  request_query JSONB,
  response_status INTEGER,
  response_body JSONB,
  error TEXT,
  ip_address TEXT,
  user_agent TEXT,
  execution_time_ms INTEGER,
  executed_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook ON webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_execution ON webhook_logs(workflow_execution_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_date ON webhook_logs(executed_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE workflow_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage webhooks for their own workflows
CREATE POLICY webhook_access_policy ON workflow_webhooks
  USING (
    workflow_id IN (
      SELECT id FROM workflows 
      WHERE organization_id IN (
        SELECT organization_id FROM organization_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Users can view webhook logs for their webhooks
CREATE POLICY webhook_logs_access_policy ON webhook_logs
  USING (
    webhook_id IN (
      SELECT id FROM workflow_webhooks
      WHERE workflow_id IN (
        SELECT id FROM workflows 
        WHERE organization_id IN (
          SELECT organization_id FROM organization_members 
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to generate unique webhook path
CREATE OR REPLACE FUNCTION generate_webhook_path()
RETURNS TEXT AS $$
DECLARE
  new_path TEXT;
  path_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate random 16-character alphanumeric string
    new_path := lower(substring(md5(random()::text || clock_timestamp()::text) from 1 for 16));
    
    -- Check if path already exists
    SELECT EXISTS(SELECT 1 FROM workflow_webhooks WHERE path = new_path) INTO path_exists;
    
    -- Exit loop if path is unique
    EXIT WHEN NOT path_exists;
  END LOOP;
  
  RETURN new_path;
END;
$$ LANGUAGE plpgsql;

-- Function to generate secure API key
CREATE OR REPLACE FUNCTION generate_webhook_api_key()
RETURNS TEXT AS $$
BEGIN
  -- Generate secure 32-character API key
  RETURN 'whk_' || encode(gen_random_bytes(24), 'base64');
END;
$$ LANGUAGE plpgsql;

-- Function to update webhook updated_at timestamp
CREATE OR REPLACE FUNCTION update_webhook_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating webhook timestamp
CREATE TRIGGER webhook_update_timestamp
  BEFORE UPDATE ON workflow_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_timestamp();

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE workflow_webhooks IS 'Webhook endpoints for triggering workflows via HTTP';
COMMENT ON TABLE webhook_logs IS 'Logs of webhook execution attempts';
COMMENT ON COLUMN workflow_webhooks.path IS 'Unique URL path for the webhook (e.g., "a1b2c3d4")';
COMMENT ON COLUMN workflow_webhooks.api_key IS 'API key for webhook authentication';
COMMENT ON COLUMN workflow_webhooks.enabled IS 'Whether the webhook is active';
COMMENT ON COLUMN webhook_logs.execution_time_ms IS 'Time taken to execute workflow in milliseconds';
