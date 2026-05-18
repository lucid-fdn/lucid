# Settings & Profile System - OPTIMIZED ARCHITECTURE

**Date:** 2025-10-06  
**Status:** Ready for Implementation  
**Strategy:** Minimal files, maximum reusability, real uploads from day 1

---

## 🎯 OPTIMIZATION PRINCIPLES

### 1. Fewer Files, Better Organization
- Combine related components in single files
- Use conditional rendering over multiple components
- Leverage existing shadcn components
- Share validation logic efficiently

### 2. Real Uploads from Start
- Supabase Storage already configured
- Production-ready file upload system
- Automatic CDN distribution
- No mock code to remove later

### 3. Scalable Architecture
- Server Components for data
- Server Actions for mutations
- Client components only when needed
- Type-safe end-to-end

---

## 📁 OPTIMIZED FILE STRUCTURE

### Total Files: ~25-30 (vs 40-50 in original)

```
src/
├── lib/
│   ├── forms/
│   │   ├── schemas.ts              # All Zod schemas (profile, account, org)
│   │   └── actions.ts              # All server actions (update, create, upload)
│   └── uploads/
│       └── storage.ts              # Supabase Storage helpers
│
├── components/
│   ├── forms/
│   │   ├── form-field.tsx          # Universal field wrapper
│   │   ├── username-field.tsx      # Handle input + availability
│   │   ├── avatar-upload.tsx       # Avatar upload + preview
│   │   └── tag-input.tsx           # Interests/tags input
│   │
│   └── settings/
│       ├── settings-shell.tsx      # Layout + sidebar (one file)
│       ├── profile-form.tsx        # Profile settings form
│       ├── account-form.tsx        # Account settings form
│       └── org-form.tsx            # Organization form
│
└── app/(studio)/
    ├── settings/
    │   ├── layout.tsx              # Shell wrapper
    │   ├── profile/page.tsx        # Profile page
    │   ├── account/page.tsx        # Account page
    │   ├── auth/page.tsx           # Auth methods
    │   ├── organizations/page.tsx  # Org list
    │   ├── billing/page.tsx        # Billing (mock)
    │   └── notifications/page.tsx  # Notification prefs
    │
    ├── onboarding/
    │   └── profile/page.tsx        # Complete profile flow
    │
    ├── orgs/
    │   └── new/page.tsx            # Create organization
    │
    └── u/
        └── [handle]/page.tsx       # Public profile

Total: ~20 new files
```

---

## 🚀 REAL FILE UPLOAD IMPLEMENTATION

### Supabase Storage Setup

```sql
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('avatars', 'avatars', true),
  ('org-logos', 'org-logos', true);

-- Set up policies (allow authenticated uploads)
CREATE POLICY "Allow authenticated uploads"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id IN ('avatars', 'org-logos'));

CREATE POLICY "Public read access"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id IN ('avatars', 'org-logos'));
```

### Upload Helper (`src/lib/uploads/storage.ts`)

```typescript
'use server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function uploadFile(
  file: File, 
  bucket: 'avatars' | 'org-logos',
  folder?: string
) {
  // Validate
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
  if (!validTypes.includes(file.type)) {
    throw new Error('Invalid file type. PNG, JPEG, or WebP only.')
  }
  
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('File too large. Maximum 2MB.')
  }
  
  // Generate unique filename
  const ext = file.name.split('.').pop()
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  const filename = `${folder ? folder + '/' : ''}${timestamp}-${random}.${ext}`
  
  // Convert File to ArrayBuffer for server upload
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  
  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filename, buffer, {
      contentType: file.type,
      cacheControl: '31536000', // 1 year
      upsert: false
    })
  
  if (error) {
    console.error('[storage] Upload error:', error)
    throw new Error('Upload failed')
  }
  
  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(filename)
  
  return publicUrl
}

export async function deleteFile(url: string) {
  try {
    // Extract path from URL
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/')
    const bucket = pathParts[pathParts.length - 2]
    const filename = pathParts[pathParts.length - 1]
    
    await supabase.storage
      .from(bucket)
      .remove([filename])
  } catch (error) {
    console.error('[storage] Delete error:', error)
    // Don't throw - deletion failure shouldn't block updates
  }
}
```

### Avatar Upload Component (`src/components/forms/avatar-upload.tsx`)

```typescript
'use client'
import { useState } from 'react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Upload, Loader2 } from 'lucide-react'
import { uploadFile } from '@/lib/uploads/storage'

interface AvatarUploadProps {
  currentUrl?: string
  onUpload: (url: string) => void
  userName: string
}

export function AvatarUpload({ currentUrl, onUpload, userName }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string>()
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Show preview immediately
    setPreview(URL.createObjectURL(file))
    setUploading(true)
    
    try {
      const url = await uploadFile(file, 'avatars', 'users')
      onUpload(url)
    } catch (error) {
      console.error('Upload failed:', error)
      alert(error instanceof Error ? error.message : 'Upload failed')
      setPreview(undefined)
    } finally {
      setUploading(false)
    }
  }
  
  const displayUrl = preview || currentUrl
  const initials = userName
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??'
  
  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-20 w-20">
        {displayUrl && <AvatarImage src={displayUrl} alt={userName} />}
        <AvatarFallback className="text-xl">{initials}</AvatarFallback>
      </Avatar>
      
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => document.getElementById('avatar-input')?.click()}
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload Photo
            </>
          )}
        </Button>
        <input
          id="avatar-input"
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
        <p className="text-xs text-muted-foreground">
          PNG, JPEG, WebP • Max 2MB
        </p>
      </div>
    </div>
  )
}
```

---

## 📝 CONSOLIDATED SCHEMAS

### All Schemas in One File (`src/lib/forms/schemas.ts`)

```typescript
import { z } from 'zod'

// Reusable patterns
const urlSchema = z.string()
  .refine(s => !s || s.startsWith('http://') || s.startsWith('https://'), {
    message: 'Must be a valid URL starting with http:// or https://'
  })
  .optional()

const handleSchema = z.string()
  .min(3, 'Minimum 3 characters')
  .max(32, 'Maximum 32 characters')
  .regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers, and underscores')
  .transform(s => s.toLowerCase())

// Profile schema
export const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  avatar_url: z.string().url().optional(),
  bio: z.string().max(280).optional(),
  homepage: urlSchema,
  interests: z.array(z.string().max(32)).max(10).optional(),
  github_username: z.string().max(100).optional(),
  twitter_username: z.string().max(100).optional(),
  linkedin_url: urlSchema,
})

// Account schema
export const accountSchema = z.object({
  handle: handleSchema,
  email: z.string().email('Invalid email address'),
})

// Password schema (if needed)
export const passwordSchema = z.object({
  new_password: z.string().min(8, 'Minimum 8 characters'),
  confirm_password: z.string()
}).refine(data => data.new_password === data.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password']
})

// Organization schema
export const organizationSchema = z.object({
  slug: handleSchema,
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(['company', 'lab', 'university', 'nonprofit', 'community', 'other']).optional(),
  logo_url: z.string().url().optional(),
  bio: z.string().max(280).optional(),
  homepage: urlSchema,
  interests: z.array(z.string().max(32)).max(10).optional(),
  github_username: z.string().max(100).optional(),
  twitter_username: z.string().max(100).optional(),
  linkedin_url: urlSchema,
})

// Onboarding schema (combines required fields)
export const onboardingSchema = profileSchema.extend({
  handle: handleSchema,
  agree_terms: z.boolean().refine(val => val === true, {
    message: 'You must agree to the terms'
  })
})

// Type exports
export type ProfileData = z.infer<typeof profileSchema>
export type AccountData = z.infer<typeof accountSchema>
export type OrganizationData = z.infer<typeof organizationSchema>
export type OnboardingData = z.infer<typeof onboardingSchema>
```

---

## 🔧 CONSOLIDATED SERVER ACTIONS

### All Actions in One File (`src/lib/forms/actions.ts`)

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { 
  profileSchema, 
  accountSchema, 
  organizationSchema,
  onboardingSchema 
} from './schemas'
import { db } from '@/ports/db'

// Helper to get current user
async function getCurrentUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get('privy-id-token')?.value
  if (!token) throw new Error('Not authenticated')
  
  // Verify token and get user ID (implement based on your auth)
  const userId = 'user-id-from-token' // TODO: decode JWT
  return userId
}

export async function updateProfile(data: unknown) {
  const userId = await getCurrentUser()
  const validated = profileSchema.parse(data)
  
  await db.updateProfile(userId, validated)
  
  revalidatePath('/settings/profile')
  return { success: true }
}

export async function updateAccount(data: unknown) {
  const userId = await getCurrentUser()
  const validated = accountSchema.parse(data)
  
  // Check handle availability
  const exists = await db.checkHandleExists(validated.handle)
  if (exists) {
    throw new Error('Handle already taken')
  }
  
  await db.updateAccount(userId, validated)
  
  revalidatePath('/settings/account')
  return { success: true }
}

export async function createOrganization(data: unknown) {
  const userId = await getCurrentUser()
  const validated = organizationSchema.parse(data)
  
  // Check slug availability
  const exists = await db.checkOrgSlugExists(validated.slug)
  if (exists) {
    throw new Error('Organization slug already taken')
  }
  
  const orgId = await db.createOrganization(validated, userId)
  
  redirect(`/company/${validated.slug}`)
}

export async function completeOnboarding(data: unknown) {
  const userId = await getCurrentUser()
  const validated = onboardingSchema.parse(data)
  
  // Check handle availability
  const exists = await db.checkHandleExists(validated.handle)
  if (exists) {
    throw new Error('Handle already taken')
  }
  
  await db.completeOnboarding(userId, validated)
  
  redirect('/explore')
}

export async function checkHandleAvailability(handle: string) {
  if (handle.length < 3) return { available: false, message: 'Too short' }
  if (!/^[a-z0-9_]+$/.test(handle)) return { available: false, message: 'Invalid characters' }
  
  const exists = await db.checkHandleExists(handle.toLowerCase())
  
  if (exists) {
    // Suggest alternatives
    const suggestions = [
      `${handle}${Math.floor(Math.random() * 100)}`,
      `${handle}_${Math.random().toString(36).slice(2, 5)}`
    ]
    return { available: false, message: 'Already taken', suggestions }
  }
  
  return { available: true, message: 'Available ✓' }
}
```

---

## 🎨 UNIFIED FORM COMPONENT

### Universal Form Field (`src/components/forms/form-field.tsx`)

```typescript
'use client'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface FormFieldProps {
  label: string
  name: string
  type?: 'text' | 'email' | 'url' | 'textarea' | 'select'
  placeholder?: string
  help?: string
  error?: string
  required?: boolean
  options?: Array<{ value: string; label: string }>
  register?: any // react-hook-form register
  className?: string
}

export function FormField({
  label,
  name,
  type = 'text',
  placeholder,
  help,
  error,
  required,
  options,
  register,
  className
}: FormFieldProps) {
  const InputComponent = type === 'textarea' ? Textarea : 
                         type === 'select' ? Select : Input
  
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      
      <InputComponent
        id={name}
        type={type === 'textarea' || type === 'select' ? undefined : type}
        placeholder={placeholder}
        {...register}
        className={cn(error && 'border-destructive')}
      >
        {type === 'select' && options?.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </InputComponent>
      
      {help && !error && (
        <p className="text-sm text-muted-foreground">{help}</p>
      )}
      
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}
```

---

## 📊 OPTIMIZED IMPLEMENTATION PLAN

### Phase 1: Foundation (Day 1, 4-6 hours)
**Files:** 5-6

1. ✅ Database schema updates
2. ✅ Storage buckets setup
3. ✅ Upload helper (`storage.ts`)
4. ✅ Validation schemas (`schemas.ts`)
5. ✅ Server actions (`actions.ts`)
6. ✅ Form components (`form-field.tsx`, `avatar-upload.tsx`)

**Lines:** ~500

### Phase 2: Settings Hub (Day 1-2, 6-8 hours)
**Files:** 8-10

1. ✅ Settings layout + sidebar
2. ✅ Profile page + form
3. ✅ Account page + form
4. ✅ Organizations page
5. ✅ Auth/Billing/Notifications pages (simple)

**Lines:** ~800

### Phase 3: Onboarding & Orgs (Day 2, 4-6 hours)
**Files:** 3-4

1. ✅ Onboarding flow
2. ✅ Create org page
3. ✅ Middleware for profile check

**Lines:** ~400

### Phase 4: Public Profiles & Polish (Day 2-3, 4-6 hours)
**Files:** 3-4

1. ✅ Public profile page
2. ✅ Profile dropdown menu
3. ✅ Mobile responsive
4. ✅ Accessibility audit

**Lines:** ~300

**Total: ~25 files, ~2000 lines, 2 days**

---

## ✅ KEY OPTIMIZATIONS

### 1. Consolidated Files
- All schemas in one file
- All actions in one file
- Unified form field component
- Combined layout + sidebar

**Savings:** 50% fewer files

### 2. Real
