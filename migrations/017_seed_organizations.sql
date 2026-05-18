-- Migration: Seed Real Organizations
-- Creates real organizations for testing follow functionality

-- Create organizations table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  logo_url TEXT,
  description TEXT,
  is_public BOOLEAN DEFAULT true,
  verified BOOLEAN DEFAULT false,
  owner_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Create policy for public read
DROP POLICY IF EXISTS "Anyone can view public organizations" ON public.organizations;
CREATE POLICY "Anyone can view public organizations"
  ON public.organizations FOR SELECT
  USING (is_public = true);

-- Insert real organizations
INSERT INTO public.organizations (slug, name, description, is_public, verified)
VALUES 
  ('huggingface', 'Hugging Face', 'The AI community building the future. Platform for ML models, datasets, and demos.', true, true),
  ('openai', 'OpenAI', 'OpenAI - Creating safe AGI that benefits all of humanity', true, true),
  ('meta', 'Meta', 'Meta Platforms, Inc. - Building technologies that help people connect', true, true),
  ('anthropic', 'Anthropic', 'Anthropic - AI safety and research company', true, true),
  ('google', 'Google', 'Google AI - Advanced AI research and products', true, true),
  ('mistral-ai', 'Mistral AI', 'Mistral AI - Open and portable generative AI for devs and businesses', true, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  verified = EXCLUDED.verified;

-- Grant permissions
GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.organizations TO anon;
GRANT ALL ON public.organizations TO service_role;
