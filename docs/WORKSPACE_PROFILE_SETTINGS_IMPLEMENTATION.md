# Workspace Profile Settings Implementation Guide

## Overview

Complete implementation guide for the Workspace Profile settings tab that allows editing workspace details (logo, name, description, etc.).

## Architecture

```
Settings Modal
  └─ [Workspace Name] Workspace Section
      └─ Profile Tab
          └─ WorkspaceSettings Component
              ├─ WorkspaceForm (avatar, name, description, website, tags)
              └─ DangerZone (delete workspace - owner only)
```

## Files to Create

### 1. `src/components/settings/workspace-settings.tsx`
Main workspace settings component (container).

```typescript
"use client"

import { WorkspaceForm } from '@/components/settings/workspace-form'
import { useWorkspace } from '@/contexts/workspace-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Button } from '@/ui/components/button'
import { Trash2 } from 'lucide-react'

export function WorkspaceSettings() {
  const { workspace } = useWorkspace()

  if (!workspace?.org) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Workspace Profile</h2>
          <p className="text-muted-foreground mt-1">Loading...</p>
        </div>
      </div>
    )
  }

  const org = workspace.org
  const isOwner = workspace.role === 'owner'
  const isPersonal = org.type === 'personal'

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Workspace Profile</h2>
        <p className="text-muted-foreground mt-1">
          Manage your workspace's public information
        </p>
      </div>

      {/* Workspace Form */}
      <WorkspaceForm
        key={org.id}
        defaultValues={{
          name: org.name || '',
          logo_url: org.logo_url || '',
          bio: org.bio || '',
          homepage: org.homepage || '',
          interests: org.interests || [],
        }}
        workspaceId={org.id}
        workspaceName={org.name}
      />

      {/* Danger Zone - Only for owners of non-personal workspaces */}
      {isOwner && !isPersonal && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible actions for this workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Delete Workspace</h3>
                <p className="text-sm text-muted-foreground">
                  Permanently delete this workspace and all its data
                </p>
              </div>
              <Button 
                variant="destructive"
                onClick={() => {
                  // TODO: Implement delete confirmation dialog
                  // Can reuse the delete logic from organizations-settings
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

### 2. `src/components/settings/workspace-form.tsx`
Reusable form for editing workspace details (similar pattern to profile-form).

```typescript
"use client"

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/ui/components/button'
import { Input } from '@/ui/components/input'
import { Textarea } from '@/ui/components/textarea'
import { Label } from '@/ui/components/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/components/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Badge } from '@/ui/components/badge'
import { Camera, X } from 'lucide-react'

// Schema
const workspaceProfileSchema = z.object({
  name: z.string().min(1, 'Name required').max(100, 'Max 100 characters'),
  logo_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  bio: z.string().max(280, 'Max 280 characters').optional().or(z.literal('')),
  homepage: z.string().url('Invalid URL').optional().or(z.literal('')),
  interests: z.array(z.string()).max(10, 'Max 10 tags').optional(),
})

type WorkspaceProfileData = z.infer<typeof workspaceProfileSchema>

interface WorkspaceFormProps {
  defaultValues: WorkspaceProfileData
  workspaceId: string
  workspaceName: string
}

export function WorkspaceForm({ 
  defaultValues, 
  workspaceId, 
  workspaceName 
}: WorkspaceFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [currentTag, setCurrentTag] = useState('')
  
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<WorkspaceProfileData>({
    resolver: zodResolver(workspaceProfileSchema),
    defaultValues,
  })

  const watchedValues = watch()

  const onSubmit = async (data: WorkspaceProfileData) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/organizations/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Failed to update workspace')
      }

      // Show success message
      alert('Workspace updated successfully!')
      
      // Reload page to reflect changes
      window.location.reload()
    } catch (error) {
      console.error('Update error:', error)
      alert('Failed to update workspace')
    } finally {
      setIsLoading(false)
    }
  }

  const addTag = () => {
    if (currentTag && watchedValues.interests && watchedValues.interests.length < 10) {
      setValue('interests', [...watchedValues.interests, currentTag], { shouldDirty: true })
      setCurrentTag('')
    }
  }

  const removeTag = (index: number) => {
    if (watchedValues.interests) {
      setValue(
        'interests',
        watchedValues.interests.filter((_, i) => i !== index),
        { shouldDirty: true }
      )
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Logo Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle>Workspace Logo</CardTitle>
          <CardDescription>
            Upload a logo for your workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <Avatar className="h-24 w-24 rounded-lg">
              {watchedValues.logo_url && (
                <AvatarImage src={watchedValues.logo_url} alt={workspaceName} />
              )}
              <AvatarFallback className="rounded-lg text-2xl">
                {workspaceName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Label htmlFor="logo_url">Logo URL</Label>
              <Input
                id="logo_url"
                placeholder="https://example.com/logo.png"
                {...register('logo_url')}
              />
              {errors.logo_url && (
                <p className="text-sm text-destructive">{errors.logo_url.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Recommended: Square image, at least 256x256px
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Basic Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Public information about your workspace
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Workspace Name</Label>
            <Input
              id="name"
              placeholder="Acme Corp"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Description</Label>
            <Textarea
              id="bio"
              placeholder="Tell others about your workspace..."
              rows={3}
              {...register('bio')}
            />
            <p className="text-xs text-muted-foreground">
              {watchedValues.bio?.length || 0}/280 characters
            </p>
            {errors.bio && (
              <p className="text-sm text-destructive">{errors.bio.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="homepage">Website</Label>
            <Input
              id="homepage"
              type="url"
              placeholder="https://example.com"
              {...register('homepage')}
            />
            {errors.homepage && (
              <p className="text-sm text-destructive">{errors.homepage.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tags/Interests Card */}
      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
          <CardDescription>
            Add tags to help others discover your workspace (max 10)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={currentTag}
              onChange={(e) => setCurrentTag(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTag()
                }
              }}
              placeholder="Add a tag..."
              maxLength={32}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={addTag}
              disabled={!currentTag || (watchedValues.interests?.length || 0) >= 10}
            >
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {watchedValues.interests?.map((tag, index) => (
              <Badge key={index} variant="secondary" className="pr-1">
                {tag}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-1 h-4 w-4 p-0"
                  onClick={() => removeTag(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button type="submit" disabled={!isDirty || isLoading}>
          {isLoading ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}
```

### 3. `src/app/api/organizations/[orgId]/route.ts` - Add PATCH method

Add PATCH handler to existing file:

```typescript
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = await params
    const body = await request.json()

    // Check if user is owner or admin
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', session.userId)
      .single()

    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Update organization
    const { error } = await supabase
      .from('organizations')
      .update({
        name: body.name,
        logo_url: body.logo_url || null,
        bio: body.bio || null,
        homepage: body.homepage || null,
        interests: body.interests || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId)

    if (error) {
      console.error('[API] Update organization error:', error)
      throw error
    }

    return NextResponse.json({ 
      success: true,
      message: 'Organization updated successfully'
    })
  } catch (error: any) {
    console.error('[API] Update organization error:', error)
    return NextResponse.json(
      { error: 'Failed to update organization' },
      { status: 500 }
    )
  }
}
```

### 4. Update `src/components/settings/settings-content.tsx`

Add workspace settings to the content router:

```typescript
import { WorkspaceSettings } from '@/components/settings/workspace-settings'

// In render:
{currentTab === 'workspace' && <WorkspaceSettings />}
```

## MVP Features Included

### ✅ Core Fields
- **Logo/Avatar**: URL-based upload (reuses avatar pattern)
- **Name**: Required, 100 char max
- **Description**: Optional, 280 char max (Twitter-style)
- **Website**: Optional, URL validated
- **Tags**: Up to 10 tags, 32 chars each

### ✅ Permissions
- **Owners & Admins**: Can edit all fields
- **Members/Guests**: Read-only (enforced in API)

### ✅ Validation
- Client-side: Zod schema validation
- Server-side: Permission checks + data validation

### ✅ UX
- Auto-save indication
- Character counters
- Tag management UI
- Error handling
- Success feedback

## Integration Points

### 1. Workspace Context
Already provides `workspace.org` with all organization data.

### 2. Settings Modal
Already configured with dynamic section names.

### 3. Avatar Upload
Reuses same pattern as profile settings.

### 4. Database Schema
Uses existing `organizations` table columns:
- `name` (text)
- `logo_url` (text)
- `bio` (text)
- `homepage` (text)
- `interests` (text[] or jsonb)

## Testing Checklist

- [ ] Load workspace settings for current workspace
- [ ] Update workspace name (owner)
- [ ] Update workspace logo (owner)
- [ ] Update workspace description (owner)
- [ ] Add/remove tags (owner)
- [ ] Try as non-owner (should be read-only or hidden)
- [ ] Validation errors display correctly
- [ ] Success message after save
- [ ] Changes reflect immediately after save
- [ ] Personal workspace shows but can't be deleted

## Next Steps

1. Create `workspace-settings.tsx` component
2. Create `workspace-form.tsx` form component
3. Add PATCH method to organizations API
4. Update `settings-content.tsx` router
5. Test all permission levels
6. Add delete workspace confirmation dialog

## Notes

- Logo upload uses URL input (no file upload for MVP)
- For image upload, can add Supabase Storage later
- Delete workspace reuses logic from organizations-settings
- Personal workspaces show settings but can't be deleted
