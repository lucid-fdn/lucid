-- Updated contacts table schema with all required fields
-- Run this in Supabase SQL Editor if you want to create the table from scratch
-- WARNING: This will drop the existing table if it exists!

-- Drop existing table (optional - only if you want to start fresh)
-- DROP TABLE IF EXISTS contacts CASCADE;

-- Create contacts table with all fields
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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(source);
CREATE INDEX IF NOT EXISTS idx_contacts_form_type ON contacts(form_type);
CREATE INDEX IF NOT EXISTS idx_contacts_priority ON contacts(priority);

-- Enable Row Level Security (RLS)
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow anonymous contact form submissions" ON contacts;
DROP POLICY IF EXISTS "Allow authenticated users to read contacts" ON contacts;

-- Create policy for anonymous inserts (contact form submissions)
CREATE POLICY "Allow anonymous contact form submissions" 
ON contacts FOR INSERT 
TO anon 
WITH CHECK (true);

-- Create policy for authenticated reads (admin access)
CREATE POLICY "Allow authenticated users to read contacts" 
ON contacts FOR SELECT 
TO authenticated 
USING (true);

-- Create or replace the update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;

-- Create trigger for automatic updated_at
CREATE TRIGGER update_contacts_updated_at 
    BEFORE UPDATE ON contacts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Verify the table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'contacts'
ORDER BY ordinal_position;
