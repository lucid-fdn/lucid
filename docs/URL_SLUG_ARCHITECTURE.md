# URL & Slug Architecture - Industry Standards

## 🎯 Current Pattern (Query-Based)

Your app currently uses:
```
/dashboard?org={orgId}
/settings?org={orgId}
```

✅ **Already implemented**: Redirect now goes to `/dashboard?org={newOrgId}`

---

## 🌟 Industry Standard URL Patterns

### Pattern 1: Slug-Based Routing (Most Common)
**Used by:** Notion, Linear, Vercel, GitHub, Slack

```
/{workspace-slug}/dashboard
/{workspace-slug}/settings
/{workspace-slug}/projects/{project-slug}
```

**Example:**
```
/acme-corp/dashboard
/my-startup/settings
/personal-ws/projects/ai-app
```

**Pros:**
- ✅ Clean, bookmarkable URLs
- ✅ SEO friendly  
- ✅ Clear context in URL bar
- ✅ Easy to share links
- ✅ Browser back button works better
- ✅ Can use different slugs per workspace

**Cons:**
- ⚠️ Requires route restructuring
- ⚠️ Need middleware to validate workspace access
- ⚠️ Slug conflicts across all users

---

### Pattern 2: ID-Based with Slug (Hybrid)
**Used by:** Figma, Miro

```
/workspace/{id}/{slug}/dashboard
/workspace/{id}/{slug}/projects
```

**Example:**
```
/workspace/abc123/acme-corp/dashboard
/workspace/xyz789/my-startup/settings
```

**Pros:**
- ✅ No slug conflicts (ID is unique)
- ✅ Can change slug without breaking links
- ✅ Clean separation

**Cons:**
- ⚠️ URLs are longer
- ⚠️ Less readable

---

### Pattern 3: Query-Based (Your Current Approach)
**Used by:** Some older SaaS apps

```
/dashboard?org={orgId}
/settings?org={orgId}
```

**Pros:**
- ✅ Simple to implement
- ✅ Works with existing routes
- ✅ No route conflicts

**Cons:**
- ❌ Not bookmarkable (loses context on refresh)
- ❌ Harder to share specific workspace views
- ❌ Less intuitive
- ❌ SEO unfriendly

---

## 🏆 Recommended Migration Path

### Phase 1: Add Slug Support (Non-Breaking)
Support BOTH patterns during transition:

```typescript
// Keep existing: /dashboard?org={id}
// Add new: /{slug}/dashboard

// In middleware or layout:
export async function getWorkspaceFromUrl(slug?: string, orgId?: string) {
  if (slug) {
    return await getWorkspaceBySlug(slug)
  }
  if (orgId) {
    return await getWorkspaceById(orgId)
  }
  throw new Error('No workspace specified')
}
```

### Phase 2: Update Routes Gradually

**New Route Structure:**
```
src/app/(studio)/[workspace-slug]/
├── dashboard/
│   └── page.tsx
├── settings/
│   └── page.tsx
├── projects/
│   └── [project-slug]/
│       └── page.tsx
└── layout.tsx  // Validates workspace access
```

**Example layout.tsx:**
```typescript
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { 'workspace-slug': string }
}) {
  const workspace = await getWorkspaceBySlug(params['workspace-slug'])
  
  if (!workspace) {
    notFound()
  }
  
  // Check user has access
  const user = await getUser()
  const hasAccess = await checkWorkspaceAccess(user.id, workspace.id)
  
  if (!hasAccess) {
    redirect('/unauthorized')
  }
  
  return (
    <WorkspaceProvider workspace={workspace}>
      {children}
    </WorkspaceProvider>
  )
}
```

### Phase 3: Migrate Links
Update all internal links:

```typescript
// Old
<Link href="/dashboard?org=${orgId}">Dashboard</Link>

// New
<Link href="/${workspace.slug}/dashboard">Dashboard</Link>
```

### Phase 4: Add Redirects
For backward compatibility:

```typescript
// middleware.ts or route handler
if (request.nextUrl.searchParams.has('org')) {
  const orgId = request.nextUrl.searchParams.get('org')
  const workspace = await getWorkspaceById(orgId)
  
  if (workspace) {
    // Redirect old URL to new slug-based URL
    return NextResponse.redirect(
      new URL(`/${workspace.slug}/dashboard`, request.url)
    )
  }
}
```

---

## 🔧 Slug Management Best Practices

### 1. Slug Generation
```typescript
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with dash
    .replace(/^-+|-+$/g, '') // Trim dashes from ends
    .slice(0, 63) // Max length
}

// Example:
// "Acme Corporation" → "acme-corporation"
// "My Startup (2024)!" → "my-startup-2024"
```

### 2. Slug Uniqueness
**Option A: Global Uniqueness** (Like GitHub usernames)
```sql
CREATE UNIQUE INDEX organizations_slug_unique 
ON organizations(slug);
```
- Pro: Simple, clean URLs
- Con: Slug competition

**Option B: User-Scoped** (Like Notion)
```sql
CREATE UNIQUE INDEX organizations_slug_user_unique 
ON organizations(slug, created_by);
```
- Pro: Users can have same slug
- Con: Need user context in URL (`/@user/workspace`)

**Option C: Globally Unique with Suffix** (Recommended)
```typescript
async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug
  let counter = 1
  
  while (await slugExists(slug)) {
    slug = `${baseSlug}-${counter}`
    counter++
  }
  
  return slug
}

// Example:
// "acme" → "acme"
// "acme" (exists) → "acme-1"
// "acme" (exists) → "acme-2"
```

### 3. Slug Changes
Allow users to change slugs, but:

```typescript
async function updateWorkspaceSlug(
  workspaceId: string,
  newSlug: string
): Promise<{ success: boolean; oldSlug: string }> {
  const workspace = await getWorkspace(workspaceId)
  const oldSlug = workspace.slug
  
  // Update slug
  await updateWorkspace(workspaceId, { slug: newSlug })
  
  // Create redirect mapping
  await createSlugRedirect({
    from: oldSlug,
    to: newSlug,
    workspaceId,
    expiresAt: addDays(new Date(), 90) // Keep redirect for 90 days
  })
  
  return { success: true, oldSlug }
}
```

---

## 📊 Comparison Table

| Feature | Query-Based | Slug-Based | ID+Slug |
|---------|-------------|------------|---------|
| Bookmarkable | ❌ | ✅ | ✅ |
| SEO Friendly | ❌ | ✅ | ⚠️ |
| Easy to Share | ❌ | ✅ | ⚠️ |
| Implementation | Easy | Medium | Medium |
| Slug Conflicts | N/A | ⚠️ | ✅ |
| URL Length | Short | Short | Long |
| User Experience | ⚠️ | ✅ | ✅ |

---

## 🎯 Recommendation for Your App

**Immediate (Keep current, improve redirect):**
- ✅ DONE: Redirect to `/dashboard?org={newOrgId}` after creation
- This works fine for now

**Short-term (3-6 months):**
- Consider migrating to slug-based routing
- Implement Pattern 1 (/{workspace-slug}/dashboard)
- Use globally unique slugs with suffix strategy

**Migration would look like:**
```typescript
// Current
/dashboard?org=abc-123

// After migration
/acme-corp/dashboard
/my-startup/settings
/personal-ws/projects
```

This matches what users expect from modern SaaS apps like:
- Notion: `/workspace-name/page-name`
- Linear: `/team-name/issue-tracking`
- Vercel: `/team-name/projects`

---

## 🚀 Quick Start: Slug-Based Routes (Future)

1. **Update database
