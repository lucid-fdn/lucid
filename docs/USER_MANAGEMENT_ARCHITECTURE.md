# User Management Architecture

**Provider-agnostic, scalable user management with JIT profile creation**

---

## 🎯 Architecture Overview

### Key Principles

1. **Internal UUIDs**: Users have internal UUIDs (`profiles.id`), not provider IDs
2. **Identity Links**: External auth providers (Privy, Auth0, etc.) map to internal IDs via `identity_links`
3. **JIT Creation**: Users are created automatically on first login (Just-In-Time)
4. **Server-Only Writes**: All writes go through Next.js server using service role key
5. **Multi-Provider Ready**: Easy to add Auth0, Clerk, or other providers later

---

## 📊 Database Schema

### Core Tables

```sql
profiles (
  id uuid PRIMARY KEY,              -- Internal UUID
  handle citext UNIQUE NOT NULL,    -- Unique username (case-insensitive)
  email citext,
  name text,
  avatar_url text,
  bio text,
  created_at timestamptz,
  updated_at timestamptz,
  last_login_at timestamptz
)

identity_links (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES profiles(id),
  provider text NOT NULL,           -- 'privy', 'auth0', 'clerk', etc.
  external_id text NOT NULL,        -- Provider's user ID
  UNIQUE(provider, external_id)
)

user_wallets (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES profiles(id),
  wallet_address text NOT NULL,
  wallet_type text NOT NULL,        -- 'ethereum', 'solana', etc.
  chain_id text,
  is_primary boolean,
  verified_at timestamptz,
  UNIQUE(user_id, wallet_address)
)
```

### Why Internal UUIDs?

- **Provider Independence**: Not tied to any single auth provider
- **Multi-Provider Support**: Same user can link multiple auth methods
- **Migration Safety**: Can switch providers without changing all foreign keys
- **UUID Guarantees**: Privy IDs aren't guaranteed to be UUIDs

---

## 🔐 Authentication Flow

### 1. User Logs In (First Time)

```
User → Privy Login → Token
       ↓
Next.js receives token
       ↓
Verify with Privy → Extract Privy user ID
       ↓
Check identity_links → NOT FOUND
       ↓
JIT Create:
  1. Generate unique handle
  2. Create profiles row (new UUID)
  3. Create identity_links row (map Privy ID → UUID)
       ↓
Return internal UUID (not Privy ID)
```

### 2. User Logs In (Returning)

```
User → Privy Login → Token
       ↓
Next.js receives token
       ↓
Verify with Privy → Extract Privy user ID
       ↓
Check identity_links → FOUND
       ↓
Return internal UUID
```

---

## 💻 Code Implementation

### Auth Facade (JIT Creation)

```typescript
// src/lib/auth/session.ts

export async function getServerSession(): Promise<{ userId: string | null }> {
  // 1. Get and verify Privy token
  const token = (await cookies()).get('privy-token')?.value;
  if (!token) return { userId: null };
  
  const claims = await privy.verifyAuthToken(token);
  const privyUserId = claims.userId;
  
  // 2. Map to internal UUID (JIT creates if needed)
  const internalUserId = await resolveInternalUserId(privyUserId);
  
  return { userId: internalUserId };  // Internal UUID, not Privy ID
}
```

### Database Facade

```typescript
// src/lib/db/index.ts

export async function getProfile(userId: string) {
  // userId is internal UUID
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  return data;
}

export async function getUserWallets(userId: string) {
  const { data } = await supabase
    .from('user_wallets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  return data || [];
}
```

### Usage in API Routes

```typescript
// app/api/profile/route.ts

import { requireUserId } from '@/ports/auth';
import { getProfile, updateProfile } from '@/ports/db';

export async function GET() {
  const userId = await requireUserId();  // Internal UUID
  const profile = await getProfile(userId);
  
  return Response.json(profile);
}

export async function PATCH(req: Request) {
  const userId = await requireUserId();
  const updates = await req.json();
  
  const profile = await updateProfile(userId, updates);
  
  return Response.json(profile);
}
```

---

## 🛠️ Handle Generation

### Rules

- **Format**: `^[a-z0-9_]+$` (lowercase alphanumeric + underscore)
- **Length**: 3-32 characters
- **Uniqueness**: Collision handling with random suffixes

### Priority

1. Privy `preferred_username`
2. Email username part
3. Wallet address (first 8 chars)
4. Random fallback: `user_<random>`

### Collision Handling

```typescript
// Base handle: "johndoe"
// If exists: "johndoe_a3f9" (random suffix)
// If still exists: Try 5 times, then timestamp
```

---

## 🌐 Multi-Wallet Support

### Adding Wallets

```typescript
import { addUserWallet } from '@/ports/db';

await addUserWallet({
  user_id: userId,
  wallet_address: '0x...',
  wallet_type: 'ethereum',
  chain_id: '1',
  is_primary: true,
});
```

### Setting Primary Wallet

```typescript
import { setPrimaryWallet } from '@/ports/db';

// Automatically unsets other primary wallets of same type
await setPrimaryWallet(userId, walletId, 'ethereum');
```

---

## 🔄 Adding More Auth Providers

### Example: Adding Auth0

```typescript
// src/lib/auth/session.ts

async function resolveInternalUserId(
  provider: 'privy' | 'auth0',
  externalId: string
): Promise<string> {
  // Check identity_links
  const { data: link } = await supabase
    .from('identity_links')
    .select('user_id')
    .eq('provider', provider)
    .eq('external_id', externalId)
    .single();
  
  if (link?.user_id) return link.user_id;
  
  // JIT create...
}
```

### Linking Multiple Providers

```typescript
import { addIdentityLink } from '@/ports/db';

// User logged in with Privy, now wants to link Auth0
await addIdentityLink(userId, 'auth0', auth0UserId);
```

---

## 🔒 Row Level Security (RLS)

### Read Policies

```sql
-- Profiles: Public read (for contributor pages)
CREATE POLICY "public_read_profiles"
  ON profiles FOR SELECT
  USING (true);

-- Identity Links: Never public (server-only)
CREATE POLICY "no_public_read_identity_links"
  ON identity_links FOR SELECT
  USING (false);

-- Wallets: Server-only (MVP)
CREATE POLICY "no_public_read_wallets"
  ON user_wallets FOR SELECT
  USING (false);
```

### Write Strategy (MVP)

- **Server-only writes** using `SUPABASE_SERVICE_ROLE_KEY`
- Service role bypasses RLS
- No client write policies needed for MVP
- Add custom JWT policies later if needed

---

## ⚡ Performance Considerations

### Caching

```typescript
// Server Component (user-specific data)
export const revalidate = 0;  // Don't cache

// Public profile pages
export const revalidate = 60;  // Cache 60 seconds
```

### Database Indexes

```sql
-- Fast lookups by provider + external_id
CREATE INDEX idx_identity_links_provider_external 
  ON identity_links(provider, external_id);

-- Fast handle lookups (case-insensitive)
CREATE INDEX idx_profiles_handle ON profiles(handle);
```

---

## 📝 API Examples

### Get Current User Profile

```typescript
// Server Component
import { getServerSession } from '@/ports/auth';
import { getProfile } from '@/ports/db';

export default async function ProfilePage() {
  const session = await getServerSession();
  
  if (!session.userId) {
    return <div>Please log in</div>;
  }
  
  const profile = await getProfile(session.userId);
  
  return <div>Hello, {profile.handle}!</div>;
}
```

### API Route - Update Profile

```typescript
// app/api/profile/route.ts
import { requireUserId } from '@/ports/auth';
import { updateProfile } from '@/ports/db';

export async function PATCH(req: Request) {
  try {
    const userId = await requireUserId();
    const { name, bio } = await req.json();
    
    const profile = await updateProfile(userId, { name, bio });
    
    return Response.json(profile);
  } catch (error) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
```

### API Route - Manage Wallets

```typescript
// app/api/wallets/route.ts
import { requireUserId } from '@/ports/auth';
import { getUserWallets, addUserWallet } from '@/ports/db';

export async function GET() {
  const userId = await requireUserId();
  const wallets = await getUserWallets(userId);
  
  return Response.json(wallets);
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  const { wallet_address, wallet_type } = await req.json();
  
  const wallet = await addUserWallet({
    user_id: userId,
    wallet_address,
    wallet_type,
    is_primary: false,
  });
  
  return Response.json(wallet);
}
```

---

## 🚀 Migration Path

### From Privy-ID-as-PK

If you already have `profiles.id = privy_id`:

1. Add new UUID column:
   ```sql
   ALTER TABLE profiles ADD COLUMN new_id UUID DEFAULT gen_random_uuid();
   ```

2. Create identity_links:
   ```sql
   INSERT INTO identity_links (user_id, provider, external_id)
   SELECT new_id, 'privy', id FROM profiles;
   ```

3. Update all foreign keys to reference `new_id`

4. Drop old `id`, rename `new_id` to `id`

---

## ✅ Checklist for Production

- [ ] Run SQL schema: `supabase_user_management_schema.sql`
- [ ] Set environment variables:
  - `NEXT_PUBLIC_PRIVY_APP_ID`
  - `PRIVY_APP_SECRET`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Test login flow (JIT user creation)
- [ ] Test profile updates
- [ ] Test wallet management
- [ ] Verify RLS policies
- [ ] Set up monitoring for JIT creation failures
- [ ] Consider adding webhook for backup sync

---

## 🆘 Troubleshooting

### User Not Created on Login

```typescript
// Check logs
console.log('[auth] JIT creating profile for Privy user: ...');
console.log('[auth] Created profile ... for Privy user ...');
```

### Handle Collisions

```typescript
// Handles have built-in collision detection
// Check: apps/web/src/lib/auth/handle.ts
// Tries 5 random suffixes, then timestamp-based
```

### TypeScript Errors

```typescript
// Use type assertions for Supabase responses (placeholder DB)
const { data } = await supabase...;
const userId = (data as any).user_id as string;
```

---

## 📚 Related Documentation

- [MVP_FACADES_GUIDE.md](./MVP_FACADES_GUIDE.md) - How to use facades
- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) - Database setup
- SQL Schema: `supabase_user_management_schema.sql`

---

## 🎯 Key Takeaways

1. **Always use internal UUIDs** from `getServerSession().userId`
2. **Never expose Privy IDs** in your application code
3. **All DB operations** use internal UUIDs, not provider IDs
4. **JIT creation is automatic** - no webhook setup needed
5. **Multi-provider ready** - just add more identity_links rows

This architecture is **production-ready, scalable, and provider-agnostic**. 🚀
