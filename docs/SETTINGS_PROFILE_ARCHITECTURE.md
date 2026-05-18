# Settings & Profile System Architecture

**Date:** 2025-10-06  
**Status:** Planning Phase  
**Goal:** Build scalable, performant MVP for Settings Hub, Profiles, Organizations, and Onboarding

---

## 🔍 SYSTEM AUDIT

### Existing Infrastructure

#### ✅ Form System
**Location:** `apps/web/src/components/ContactForm.tsx`

**Pattern:**
- Uses `react-hook-form` + `zod` validation
- Centralized validation rules: `@/lib/validation-rules`
- Custom `useNotifications` hook for feedback
- Config-driven form fields

**Assessment:**
- ✅ Good foundation but NOT reusable
- ❌ Monolithic component (400+ lines)
- ❌ No atomic form components
- ✅ Has validation system we can leverage

**Recommendation:**
- Create atomic form components using shadcn/ui
- Extract validation logic into central schema files
- Build FormField wrapper component
- Keep server actions pattern for submissions

#### ✅ Auth System
**Location:** Multiple files

**Pattern:**
- Privy for authentication
- Cookie-based session management
- Server-side user checks
- Auth context: `@/contexts/auth-context.tsx`

**Assessment:**
- ✅ Working auth system
- ✅ Can check if user authenticated
- ❌ No user profile management yet
- ❌ No onboarding flow

**Recommendation:**
- Leverage existing Privy auth
- Add profile completion check on login
- Build onboarding flow with redirect
- Use middleware for protected routes

#### ✅ Notifications System
**Location:** `@/hooks/use-notifications`

**Pattern:**
- Toast-based notifications
- Success/error states
- Centralized notification config

**Assessment:**
- ✅ Good for user feedback
- ✅ Can use for form submissions
- ⚠️ May need email/web notification preferences

**Recommendation:**
- Keep for immediate feedback
- Add settings for notification preferences
- Integrate with future notification system

#### ✅ Database Layer
**Location:** `@/ports/db` (facade pattern)

**Pattern:**
- Server-only database operations
- Type-safe queries
- Uses Supabase with service role

**Assessment:**
- ✅ Good separation of concerns
- ✅ Security-first approach
- ❌ Need to add profile/org operations

**Recommendation:**
- Add profile CRUD operations
- Add organization operations
- Add username availability checks
- Keep server-only pattern

#### ⚠️ Shadcn Components
**Location:** `apps/web/src/components/ui/`

**Available:**
- button, input, textarea, label, card
- select, checkbox, avatar, badge
- dialog, sheet, tabs, separator
- dropdown-menu, hover-card
- form components (need to check)

**Missing (may need):**
- Progress bars
- File upload component
- Multi-select / tag input
- Settings layout wrapper

**Recommendation:**
- Install missing shadcn components as needed
- Build composite components from atoms
- Create SettingsLayout wrapper
- Build reusable FormField wrapper

---

## 🏗️ ARCHITECTURE DECISIONS

### 1. Form System - **Centralized Atomic Pattern**

**Decision:** Build reusable form components on top of react-hook-form + shadcn

**Structure:**
```
src/components/forms/
├── FormField.tsx          # Wrapper with label, error, help text
├── FormInput.tsx          # Text input with validation
├── FormTextarea.tsx       # Textarea with validation
├── FormSelect.tsx         # Select with validation
├── FormCheckbox.tsx       # Checkbox with validation
├── FormFileUpload.tsx     # File upload with preview
├── FormTagInput.tsx       # Tag/chip input for interests
├── UsernameInput.tsx      # Special: async availability check
└── AvatarUpload.tsx       # Special: avatar with generate option

src/lib/forms/
├── schemas.ts             # Zod schemas (profile, org, etc.)
├── validation-rules.ts    # Reusable validation patterns
└── form-utils.ts          # Helper functions
```

**Benefits:**
- Consistent UX across all forms
- Easy to maintain
- Type-safe
- Scalable

### 2. Layout System - **Nested Layouts**

**Decision:** Use App Router nested layouts for settings

**Structure:**
```
src/app/(studio)/settings/
├── layout.tsx             # Settings shell with sidebar
├── page.tsx               # Redirect to /settings/profile
├── profile/page.tsx
├── account/page.tsx
├── auth/page.tsx
├── organizations/page.tsx
├── billing/page.tsx
└── notifications/page.tsx

src/components/settings/
├── SettingsSidebar.tsx    # Reusable sidebar
├── SettingsCard.tsx       # Card wrapper
└── SettingsSection.tsx    # Section with title
```

**Benefits:**
- Clean URL structure
- Shared sidebar state
- SEO-friendly
- Mobile-responsive (sheet on mobile)

### 3. Data Fetching - **Server Components + Actions**

**Decision:** Server Components for reads, Server Actions for writes

**Pattern:**
```tsx
// Read: Server Component
export default async function ProfilePage() {
  const profile = await getProfile() // Server-only
  return <ProfileForm defaultValues={profile} />
}

// Write: Server Action
'use server'
export async function updateProfile(data: ProfileData) {
  const validated = profileSchema.parse(data)
  await db.updateProfile(validated)
  revalidatePath('/settings/profile')
}
```

**Benefits:**
- No client-side DB access
- Built-in CSRF protection
- Optimistic updates possible
- Type-safe end-to-end

### 4. Validation - **Server + Client**

**Decision:** Zod schemas shared between client and server

**Pattern:**
```tsx
// src/lib/forms/schemas.ts
export const profileSchema = z.object({
  handle: z.string()
    .min(3).max(32)
    .regex(/^[a-z0-9_]+$/)
    .transform(s => s.toLowerCase()),
  name: z.string().min(1).max(100),
  // ...
})

// Client: react-hook-form
const form = useForm({
  resolver: zodResolver(profileSchema)
})

// Server: validate again
const validated = profileSchema.parse(formData)
```

**Benefits:**
- DRY (Don't Repeat Yourself)
- Type inference
- Security (always validate server-side)
- Better error messages

### 5. File Uploads - **Mock for MVP**

**Decision:** Mock upload functionality, prepare for future implementation

**Pattern:**
```tsx
// For MVP: just show preview, don't upload
const [preview, setPreview] = useState<string>()

const handleFile = (file: File) => {
  setPreview(URL.createObjectURL(file))
  // TODO: Upload to storage in production
}

// Database: store placeholder URL for now
avatar_url: '/avatars/placeholder.png'
```

**Benefits:**
- Fast MVP delivery
- Easy to swap real upload later
- Still validates file types/size
- Good UX with previews

### 6. Username Availability - **Debounced Server Check**

**Decision:** Client debouncing + server-side availability endpoint

**Pattern:**
```tsx
// Client component
const [checking, setChecking] = useState(false)
const [available, setAvailable] = useState<boolean>()

const checkAvailable = useMemo(
  () => debounce(async (handle: string) => {
    setChecking(true)
    const result = await fetch(`/api/check-handle?handle=${handle}`)
    setAvailable(result.ok)
    setChecking(false)
  }, 400),
  []
)

// Server endpoint
export async function GET(req: Request) {
  const handle = new URL(req.url).searchParams.get('handle')
  const exists = await db.checkHandleExists(handle)
  return Response.json({ available: !exists })
}
```

**Benefits:**
- Good UX (real-time feedback)
- Prevents spam (debounced)
- Secure (server validates)
- Scalable

---

## 📊 DATABASE SCHEMA ADDITIONS

### profiles table (existing, needs updates)

```sql
-- Add/ensure these columns exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  handle VARCHAR(32) UNIQUE,
  name VARCHAR(100),
  avatar_url TEXT,
  bio TEXT,
  homepage TEXT,
  interests TEXT[], -- array of tags
  github_username VARCHAR(100),
  twitter_username VARCHAR(100),
  linkedin_url TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index for handle lookups
CREATE INDEX IF NOT EXISTS idx_profiles_handle ON profiles(handle);

-- Trigger for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### organizations table

```sql
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50), -- company, lab, university, etc.
  logo_url TEXT,
  bio TEXT,
  homepage TEXT,
  interests TEXT[],
  github_username VARCHAR(100),
  twitter_username VARCHAR(100),
  linkedin_url TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
```

### organization_members table

```sql
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- owner, admin, member
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
```

---

## 🎨 UI COMPONENT STRUCTURE

### Atomic Components (shadcn-based)

```
atoms/
├── Input.tsx              # shadcn input
├── Textarea.tsx           # shadcn textarea
├── Select.tsx             # shadcn select
├── Checkbox.tsx           # shadcn checkbox
├── Button.tsx             # shadcn button
├── Label.tsx              # shadcn label
├── Badge.tsx              # shadcn badge
└── Avatar.tsx             # shadcn avatar

molecules/
├── FormField.tsx          # Label + Input/Textarea + Error
├── UsernameField.tsx      # FormField + availability check
├── TagInput.tsx           # Multi-tag input
├── AvatarUpload.tsx       # Avatar + upload button
└── ProgressBar.tsx        # Usage quota display

organisms/
├── ProfileForm.tsx        # Complete profile form
├── AccountForm.tsx        # Account settings form
├── OrgForm.tsx            # Organization form
├── SettingsSidebar.tsx    # Navigation sidebar
└── ProfileDropdown.tsx    # Header dropdown menu

templates/
├── SettingsLayout.tsx     # Settings page shell
├── OnboardingLayout.tsx   # Onboarding flow shell
└── ProfileLayout.tsx      # Public profile shell
```

### Page Structure

```
pages/
├── /settings              # Settings hub
│   ├── layout.tsx         # Sidebar + content
│   ├── profile/           # Profile settings
│   ├── account/           # Account settings
│   ├── organizations/     # Org management
│   └── ...
├── /onboarding            # Onboarding flow
│   └── profile/           # Complete profile
├── /orgs                  # Organization pages
│   └── new/               # Create org
└── /u/[handle]            # Public profile
```

---

## 🔒 SECURITY CONSIDERATIONS

### Input Validation
- ✅ Client: react-hook-form + zod
- ✅ Server: zod validation again
- ✅ Regex for handles/slugs
- ✅ URL sanitization (http(s) only)
- ✅ Max lengths enforced
- ✅ XSS prevention (Next.js default)

### Database Access
- ✅ Server-only queries
- ✅ Service role key protected
- ✅ RLS policies for future
- ✅ No client Supabase imports

### Authentication
- ✅ Privy session checks
- ✅ Middleware for protected routes
- ✅ Server actions check auth
- ✅ CSRF protection built-in

### File Uploads (future)
- ✅ File type validation
- ✅ Size limits (2MB)
- ✅ Unique filenames
- ✅ Storage in protected bucket

---

## 📈 PERFORMANCE OPTIMIZATIONS

### Server Components
- Use RSC for all data fetching
- Client components only for interactivity
- Minimize client bundle size

### Caching Strategy
```tsx
// Static: public profiles
export const revalidate = 3600 // 1 hour

// Dynamic: user-specific settings
export const revalidate = 0 // no cache

// ISR: organization pages
export const revalidate = 60 // 1 minute
```

### Code Splitting
- Lazy load heavy components
- Split settings pages
- Dynamic imports for modals

### Image Optimization
- Use next/image for avatars
- Proper sizes attribute
- loading="lazy" default
- Blur placeholder

---

## 🎯 IMPLEMENTATION PHASES

### Phase 1: Core Infrastructure (P0)
- [ ] Form components (FormField, Input, etc.)
- [ ] Validation schemas
- [ ] Database facade methods
- [ ] Server actions
- [ ] Settings layout

### Phase 2: Settings Hub (P0)
- [ ] Profile page
- [ ] Account page  
- [ ] Organizations page
- [ ] Sidebar navigation

### Phase 3: Onboarding (P0)
- [ ] Profile completion check
- [ ] Onboarding flow
- [ ] Handle availability
- [ ] Redirect logic

### Phase 4: Organizations (P1)
- [ ] Create organization
- [ ] Organization management
- [ ] Member invitations (mock)

### Phase 5: Public Profiles (P1)
- [ ] Public profile page
- [ ] View other users
- [ ] SEO optimization

### Phase 6: Polish (P2)
- [ ] Notifications settings
- [ ] Billing page (mock)
- [ ] Auth methods page
- [ ] Avatar generation (mock)

---

## 📝 ACCEPTANCE CRITERIA

### Functional
- ✅ All forms validate client + server
- ✅ Settings save successfully
- ✅ Onboarding flow works
- ✅ Username availability checks
- ✅ Organizations can be created
- ✅ Public profiles viewable

### Technical
- ✅ No TypeScript errors
- ✅ No ESLint errors
- ✅ Lighthouse a11y ≥ 95
- ✅ Server-only DB access
- ✅ CSRF protection
- ✅ Mobile responsive

### UX
- ✅ Consistent form styling
- ✅ Clear error messages
- ✅ Loading states
- ✅ Success feedback
- ✅ Keyboard navigation
- ✅ Screen reader support

---

## 🚀 NEXT STEPS

1. Create form component library
2. Build validation schemas
3. Add database methods
4. Implement settings layout
5. Build settings pages one by one
6. Add onboarding flow
7. Create organization pages
8. Build public profiles
9. Test and polish

**Estimated Time:** 2-3 days for MVP  
**Lines of Code:** ~3000-4000 (well-structured)  
**Files to Create:** ~40-50  

---

## 💡 MVP vs FUTURE

### MVP (Now)
- Mock file uploads
- Mock avatar generation
- Mock billing
- Mock notifications
- Basic org management
- No member invitations
- No email verification

### Future
- Real file uploads to S3/R2
- AI avatar generation
- Stripe billing
- Email/web notifications
- Advanced org features
- Team invitations
- Email verification flow

---

**Ready to implement! Starting with Phase 1...**
