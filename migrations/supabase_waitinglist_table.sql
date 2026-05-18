-- Create dedicated waitinglist table
-- Run this migration in your Supabase SQL editor

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

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_waitinglist_email ON waitinglist(email);
CREATE INDEX IF NOT EXISTS idx_waitinglist_status ON waitinglist(status);
CREATE INDEX IF NOT EXISTS idx_waitinglist_created_at ON waitinglist(created_at);
CREATE INDEX IF NOT EXISTS idx_waitinglist_solana_wallet ON waitinglist(solana_wallet);

-- Add unique constraint to prevent duplicate wallets
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitinglist_solana_wallet_unique ON waitinglist(solana_wallet);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_waitinglist_updated_at
  BEFORE UPDATE ON waitinglist
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE waitinglist IS 'Dedicated table for waiting list signups with crypto wallet and social media information';
COMMENT ON COLUMN waitinglist.email IS 'User email address (unique)';
COMMENT ON COLUMN waitinglist.solana_wallet IS 'Solana blockchain wallet address';
COMMENT ON COLUMN waitinglist.discord_id IS 'Discord ID or username';
COMMENT ON COLUMN waitinglist.twitter_id IS 'Twitter/X ID or handle';
COMMENT ON COLUMN waitinglist.status IS 'Status: pending, approved, invited, active, etc.';
COMMENT ON COLUMN waitinglist.metadata IS 'Additional metadata in JSON format';
COMMENT ON COLUMN waitinglist.notes IS 'Admin notes about this signup';

-- Enable Row Level Security (RLS)
ALTER TABLE waitinglist ENABLE ROW LEVEL SECURITY;

-- Create policy for inserting (anyone can sign up)
CREATE POLICY "Allow public insert" ON waitinglist
  FOR INSERT
  WITH CHECK (true);

-- Create policy for selecting (only authenticated users can view)
CREATE POLICY "Allow authenticated select" ON waitinglist
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Create policy for updating (only authenticated users can update)
CREATE POLICY "Allow authenticated update" ON waitinglist
  FOR UPDATE
  USING (auth.role() = 'authenticated');
