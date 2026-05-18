-- Migration: Add first_name and last_name to profiles table
-- Created: 2025-01-08
-- Purpose: Split name field into first_name and last_name for Account settings

BEGIN;

-- Add first_name column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'first_name') THEN
        ALTER TABLE profiles ADD COLUMN first_name TEXT;
    END IF;
END $$;

-- Add last_name column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'last_name') THEN
        ALTER TABLE profiles ADD COLUMN last_name TEXT;
    END IF;
END $$;

-- Optional: Migrate existing 'name' data to first_name/last_name
-- This splits "FirstName LastName" into separate fields
UPDATE profiles
SET 
    first_name = COALESCE(split_part(name, ' ', 1), ''),
    last_name = COALESCE(NULLIF(substring(name from position(' ' in name) + 1), ''), '')
WHERE 
    name IS NOT NULL 
    AND first_name IS NULL 
    AND last_name IS NULL;

COMMIT;

-- Verify the migration
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'first_name') THEN
        RAISE EXCEPTION 'Migration failed: first_name column was not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'last_name') THEN
        RAISE EXCEPTION 'Migration failed: last_name column was not created';
    END IF;
    
    RAISE NOTICE 'Migration 008 completed successfully';
END $$;
