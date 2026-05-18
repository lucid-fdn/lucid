-- ============================================================================
-- Waitinglist Table - SAFE VERSION
-- ============================================================================

-- Create waitinglist table
CREATE TABLE IF NOT EXISTS waitinglist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  solana_wallet VARCHAR(44) NOT NULL,
  discord_id VARCHAR(255) NOT NULL,
  twitter_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB,
  notes TEXT
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_waitinglist_email ON waitinglist(email);
CREATE INDEX IF NOT EXISTS idx_waitinglist_status ON waitinglist(status);
CREATE INDEX IF NOT EXISTS idx_waitinglist_created_at ON waitinglist(created_at);
CREATE INDEX IF NOT EXISTS idx_waitinglist_solana_wallet ON waitinglist(solana_wallet);
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitinglist_solana_wallet_unique ON waitinglist(solana_wallet);

-- Enable Row Level Security
ALTER TABLE waitinglist ENABLE ROW LEVEL SECURITY;

-- Create or replace update function (safe)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (safe - checks existence first)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_waitinglist_updated_at'
    ) THEN
        CREATE TRIGGER update_waitinglist_updated_at
        BEFORE UPDATE ON waitinglist
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Create policies (safe - checks existence first)
DO $$ 
BEGIN
    -- Anyone can sign up
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'waitinglist' 
        AND policyname = 'Allow public insert'
    ) THEN
        CREATE POLICY "Allow public insert" 
        ON waitinglist
        FOR INSERT
        WITH CHECK (true);
    END IF;
    
    -- Authenticated users can view (admin)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'waitinglist' 
        AND policyname = 'Allow authenticated select'
    ) THEN
        CREATE POLICY "Allow authenticated select" 
        ON waitinglist
        FOR SELECT
        USING (auth.role() = 'authenticated');
    END IF;
    
    -- Authenticated users can update
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'waitinglist' 
        AND policyname = 'Allow authenticated update'
    ) THEN
        CREATE POLICY "Allow authenticated update" 
        ON waitinglist
        FOR UPDATE
        USING (auth.role() = 'authenticated');
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON TABLE waitinglist IS 'Dedicated table for waiting list signups with crypto wallet and social media information';
COMMENT ON COLUMN waitinglist.email IS 'User email address (unique)';
COMMENT ON COLUMN waitinglist.solana_wallet IS 'Solana blockchain wallet address';
COMMENT ON COLUMN waitinglist.discord_id IS 'Discord ID or username';
COMMENT ON COLUMN waitinglist.twitter_id IS 'Twitter/X ID or handle';
COMMENT ON COLUMN waitinglist.status IS 'Status: pending, approved, invited, active, etc.';
COMMENT ON COLUMN waitinglist.metadata IS 'Additional metadata in JSON format';
COMMENT ON COLUMN waitinglist.notes IS 'Admin notes about this signup';

-- Verification
DO $$
DECLARE
    column_count INT;
    policy_count INT;
BEGIN
    SELECT COUNT(*) INTO column_count 
    FROM information_schema.columns 
    WHERE table_name = 'waitinglist';
    
    SELECT COUNT(*) INTO policy_count 
    FROM pg_policies 
    WHERE tablename = 'waitinglist';
    
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'WAITINGLIST TABLE COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Columns: %', column_count;
    RAISE NOTICE 'Policies: %', policy_count;
    RAISE NOTICE '==================================================';
END $$;
