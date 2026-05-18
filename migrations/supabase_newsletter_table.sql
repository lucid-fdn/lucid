-- Create the 'newsletter_subscribers' table
CREATE TABLE public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Policy for anonymous users to insert (subscribe to newsletter)
CREATE POLICY "Allow anonymous insert" ON public.newsletter_subscribers
FOR INSERT WITH CHECK (true);

-- Policy for authenticated users to read (e.g., for admin dashboard)
CREATE POLICY "Allow authenticated read" ON public.newsletter_subscribers
FOR SELECT USING (auth.role() = 'authenticated');

-- Policy for authenticated users to update (e.g., unsubscribe)
CREATE POLICY "Allow authenticated update" ON public.newsletter_subscribers
FOR UPDATE USING (auth.role() = 'authenticated');

-- Optional: Add an index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email ON public.newsletter_subscribers (email);

-- Optional: Add an index for active subscribers
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_active ON public.newsletter_subscribers (is_active) WHERE is_active = true;

-- Function to update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_newsletter_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update 'updated_at' on each row update
CREATE TRIGGER update_newsletter_subscribers_updated_at
BEFORE UPDATE ON public.newsletter_subscribers
FOR EACH ROW
EXECUTE FUNCTION update_newsletter_updated_at_column();
