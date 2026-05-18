-- ============================================================================
-- USER MANAGEMENT SCHEMA
-- ============================================================================
-- Robust, provider-agnostic user management with JIT profile creation
-- Uses internal UUIDs + identity_links to support multiple auth providers
-- ============================================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "citext";

-- ============================================================================
-- PROFILES TABLE (Canonical Users)
-- ============================================================================
-- Your single source of truth for users
-- Uses internal UUID (not provider's ID) for maximum flexibility

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  handle citext unique not null,           -- lowercase slug, case-insensitive
  email citext,                            -- optional, normalized
  name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  
  -- Constraints
  constraint handle_length check (char_length(handle) between 3 and 32),
  constraint handle_format check (handle ~ '^[a-z0-9_]+$')
);

-- Indexes for performance
create index if not exists idx_profiles_handle on public.profiles(handle);
create index if not exists idx_profiles_email on public.profiles(email) where email is not null;
create index if not exists idx_profiles_created_at on public.profiles(created_at desc);

-- Update timestamp trigger
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.update_updated_at_column();

-- ============================================================================
-- IDENTITY LINKS TABLE (External Auth Providers)
-- ============================================================================
-- Maps external auth provider IDs to internal user IDs
-- Supports multiple providers per user (e.g., Privy + Auth0 + Clerk)

create table if not exists public.identity_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,                  -- 'privy', 'auth0', 'clerk', etc.
  external_id text not null,               -- Provider's user ID
  created_at timestamptz not null default now(),
  
  -- One external ID per provider (but user can have multiple providers)
  constraint unique_provider_external_id unique (provider, external_id)
);

-- Indexes for fast lookups
create index if not exists idx_identity_links_user_id on public.identity_links(user_id);
create index if not exists idx_identity_links_provider_external on public.identity_links(provider, external_id);

-- ============================================================================
-- USER WALLETS TABLE (Optional - Web3 Wallets)
-- ============================================================================
-- Tracks blockchain wallets per user
-- Per-user uniqueness (same wallet can't be added twice to same user)

create table if not exists public.user_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  wallet_address text not null,
  wallet_type text not null,               -- 'ethereum', 'solana', etc.
  chain_id text,                           -- For multi-chain support
  is_primary boolean default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  
  -- Per-user wallet uniqueness (user can't add same wallet twice)
  constraint unique_user_wallet unique (user_id, wallet_address)
);

-- Partial unique index for primary wallet (only one primary per user per type)
create unique index if not exists idx_unique_primary_wallet
  on public.user_wallets(user_id, wallet_type)
  where is_primary = true;

-- Indexes
create index if not exists idx_user_wallets_user_id on public.user_wallets(user_id);
create index if not exists idx_user_wallets_address on public.user_wallets(wallet_address);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- Server-only writes (using service role key)
-- Public reads only where appropriate

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.identity_links enable row level security;
alter table public.user_wallets enable row level security;

-- PROFILES: Public can read (for contributor pages, etc.)
create policy "public_read_profiles"
  on public.profiles for select
  using (true);

-- IDENTITY_LINKS: Never publicly readable (server-only)
create policy "no_public_read_identity_links"
  on public.identity_links for select
  using (false);

-- USER_WALLETS: Not publicly readable (server-only for MVP)
create policy "no_public_read_wallets"
  on public.user_wallets for select
  using (false);

-- All writes: Server-only via service role (bypasses RLS)
-- No client write policies for MVP (add later with custom JWTs if needed)

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Function to check if handle exists
create or replace function public.handle_exists(handle_to_check citext)
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles where handle = handle_to_check
  );
end;
$$ language plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

comment on table public.profiles is 'Canonical user profiles with internal UUIDs';
comment on table public.identity_links is 'Maps external auth provider IDs to internal user IDs';
comment on table public.user_wallets is 'User blockchain wallet addresses';

comment on column public.profiles.handle is 'Unique, case-insensitive username slug';
comment on column public.profiles.email is 'Normalized email address (case-insensitive)';
comment on column public.identity_links.provider is 'Auth provider name (privy, auth0, clerk, etc.)';
comment on column public.identity_links.external_id is 'Provider-specific user ID';

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
-- If you have existing profiles with Privy IDs as PKs:
-- 1. Create new UUIDs: ALTER TABLE profiles ADD COLUMN new_id UUID DEFAULT gen_random_uuid();
-- 2. Backfill identity_links with old IDs
-- 3. Update all FKs to reference new_id
-- 4. Drop old id column, rename new_id to id
