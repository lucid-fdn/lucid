-- Add request_id column to dedicated_runtimes for idempotent deploy-for-agent
ALTER TABLE dedicated_runtimes ADD COLUMN IF NOT EXISTS request_id UUID UNIQUE;
