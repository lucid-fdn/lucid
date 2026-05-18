-- Invite Tokens System
-- Centralized, scalable invite link management

-- Create invite_tokens table
CREATE TABLE IF NOT EXISTS public.invite_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_by UUID NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMPTZ,
    used_count INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER, -- NULL = unlimited
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON public.invite_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_org ON public.invite_tokens(organization_id);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_enabled ON public.invite_tokens(enabled) WHERE enabled = true;

-- Enable RLS
ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view invite tokens for their orgs"
    ON public.invite_tokens
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM public.organization_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Owners and members can create invite tokens"
    ON public.invite_tokens
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id 
            FROM public.organization_members 
            WHERE user_id = auth.uid()
            AND role IN ('owner', 'member')
        )
    );

CREATE POLICY "Owners and members can update their org tokens"
    ON public.invite_tokens
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM public.organization_members 
            WHERE user_id = auth.uid()
            AND role IN ('owner', 'member')
        )
    );

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_invite_token_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_invite_token_updated_at
    BEFORE UPDATE ON public.invite_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_invite_token_updated_at();

-- Create default invite token for existing orgs
INSERT INTO public.invite_tokens (organization_id, token, created_by, enabled)
SELECT 
    o.id,
    encode(gen_random_bytes(16), 'hex'),
    om.user_id,
    true
FROM public.organizations o
INNER JOIN public.organization_members om ON om.organization_id = o.id
WHERE om.role = 'owner'
ON CONFLICT DO NOTHING;
