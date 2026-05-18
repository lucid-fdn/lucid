-- ============================================================================
-- Contacts Table - SAFE VERSION (No destructive warnings)
-- ============================================================================
-- Creates contacts table if it doesn't exist
-- Creates policies and triggers safely

-- Create contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Basic contact info
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  email VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50),
  company VARCHAR(255),
  
  -- Additional fields
  role VARCHAR(255),
  company_size VARCHAR(100),
  use_case TEXT,
  timeline VARCHAR(100),
  budget VARCHAR(100),
  partnership_type VARCHAR(100),
  priority VARCHAR(50),
  description TEXT,
  message TEXT,
  
  -- Web3/Social fields
  solana_wallet VARCHAR(255),
  discord_id VARCHAR(255),
  twitter_id VARCHAR(255),
  
  -- Metadata
  source VARCHAR(255),
  form_type VARCHAR(255),
  agree_to_policies BOOLEAN NOT NULL DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes (IF NOT EXISTS prevents errors)
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(source);
CREATE INDEX IF NOT EXISTS idx_contacts_form_type ON contacts(form_type);
CREATE INDEX IF NOT EXISTS idx_contacts_priority ON contacts(priority);

-- Enable Row Level Security
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Create or replace update timestamp function (safe)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger (safe - uses DO block to check existence)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_contacts_updated_at'
    ) THEN
        CREATE TRIGGER update_contacts_updated_at 
            BEFORE UPDATE ON contacts 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Create policies (safe - uses DO block to check existence)
DO $$ 
BEGIN
    -- Policy for anonymous inserts
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'contacts' 
        AND policyname = 'Allow anonymous contact form submissions'
    ) THEN
        CREATE POLICY "Allow anonymous contact form submissions" 
        ON contacts FOR INSERT 
        TO anon 
        WITH CHECK (true);
    END IF;
    
    -- Policy for authenticated reads
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'contacts' 
        AND policyname = 'Allow authenticated users to read contacts'
    ) THEN
        CREATE POLICY "Allow authenticated users to read contacts" 
        ON contacts FOR SELECT 
        TO authenticated 
        USING (true);
    END IF;
END $$;

-- Verification
DO $$
DECLARE
    column_count INT;
    policy_count INT;
BEGIN
    SELECT COUNT(*) INTO column_count 
    FROM information_schema.columns 
    WHERE table_name = 'contacts';
    
    SELECT COUNT(*) INTO policy_count 
    FROM pg_policies 
    WHERE tablename = 'contacts';
    
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'CONTACTS TABLE COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Columns: %', column_count;
    RAISE NOTICE 'Policies: %', policy_count;
    RAISE NOTICE '==================================================';
END $$;
