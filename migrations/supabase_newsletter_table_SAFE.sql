-- ============================================================================
-- Newsletter Subscribers Table - SAFE VERSION
-- ============================================================================

-- Enable UUID extension (safe - IF NOT EXISTS)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create newsletter_subscribers table
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email ON public.newsletter_subscribers (email);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_active ON public.newsletter_subscribers (is_active) WHERE is_active = true;

-- Create or replace update function (safe)
CREATE OR REPLACE FUNCTION update_newsletter_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger (safe - checks existence first)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_newsletter_subscribers_updated_at'
    ) THEN
        CREATE TRIGGER update_newsletter_subscribers_updated_at
        BEFORE UPDATE ON public.newsletter_subscribers
        FOR EACH ROW
        EXECUTE FUNCTION update_newsletter_updated_at_column();
    END IF;
END $$;

-- Create policies (safe - checks existence first)
DO $$ 
BEGIN
    -- Anonymous users can subscribe
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'newsletter_subscribers' 
        AND policyname = 'Allow anonymous insert'
    ) THEN
        CREATE POLICY "Allow anonymous insert" 
        ON public.newsletter_subscribers
        FOR INSERT 
        WITH CHECK (true);
    END IF;
    
    -- Authenticated users can read (admin)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'newsletter_subscribers' 
        AND policyname = 'Allow authenticated read'
    ) THEN
        CREATE POLICY "Allow authenticated read" 
        ON public.newsletter_subscribers
        FOR SELECT 
        USING (auth.role() = 'authenticated');
    END IF;
    
    -- Authenticated users can update (unsubscribe)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'newsletter_subscribers' 
        AND policyname = 'Allow authenticated update'
    ) THEN
        CREATE POLICY "Allow authenticated update" 
        ON public.newsletter_subscribers
        FOR UPDATE 
        USING (auth.role() = 'authenticated');
    END IF;
END $$;

-- Verification
DO $$
DECLARE
    subscriber_count INT;
    policy_count INT;
BEGIN
    SELECT COUNT(*) INTO subscriber_count 
    FROM information_schema.columns 
    WHERE table_name = 'newsletter_subscribers';
    
    SELECT COUNT(*) INTO policy_count 
    FROM pg_policies 
    WHERE tablename = 'newsletter_subscribers';
    
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'NEWSLETTER TABLE COMPLETE ✓';
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'Columns: %', subscriber_count;
    RAISE NOTICE 'Policies: %', policy_count;
    RAISE NOTICE '==================================================';
END $$;
