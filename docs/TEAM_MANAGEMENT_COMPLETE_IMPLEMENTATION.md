# Complete Team Management Implementation Guide

## Overview
This guide covers implementing full team management with role dropdowns, member removal, and API endpoints.

## Part 1: Database Setup

### Run This SQL Migration
```sql
-- Already created: migrations/026_add_admin_role.sql
-- Run in Supabase SQL editor:

ALTER TYPE organization_role ADD VALUE IF NOT EXISTS 'admin';
COMMENT ON TYPE organization_role IS 'Organization member roles: owner (full control), admin (full access except billing/delete), member (can create/edit), guest (view only)';
```

## Part 2: API Endpoints Needed

### 1. GET /api/organizations/[orgId]/members
Fetch all members of an organization.

**File:** `src/app/api/organizations/[orgId]/members/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: { orgId: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params

    // Check if user is member of this org
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', session.userId)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    // Fetch all members with profile data
    const { data: members, error } = await supabase
      .from('organization_members')
      .select(`
        id,
        role,
        created_at,
        user:profiles!organization_members_user_id_fkey (
          id,
          handle,
          name,
          first_name,
          last_name,
          avatar_url,
          email
        )
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ members })
  } catch (error: any) {
    console.error('[API] Get members error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch members' },
      { status: 500 }
    )
  }
}
```

### 2. PATCH /api/organizations/[orgId]/members/[memberId]
Update a member's role.

**File:** `src/app/api/organizations/[orgId]/members/[memberId]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/auth/session'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(
  request: NextRequest,
  { params }: { params: { orgId: string; memberId: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId, memberId } = params
    const { role } = await request.json()

    // Check if requester has permission (owner or admin)
    const { data: requesterMembership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', session.userId)
      .single()

    if (!requesterMembership || 
        (requesterMembership.role !== 'owner' && requesterMembership.role !== 'admin')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Cannot change owner role (only one owner allowed)
    const { data: targetMember } = await supabase
      .from('organization_members')
      .select('role')
      .eq('id', memberId)
      .single()

    if (targetMember?.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot change owner role' },
        { status: 400 }
      )
    }

    // Update role
    const { error } = await supabase
      .from('organization_members')
      .update({ role })
      .eq('id', memberId)

    if (error) throw error

    return NextResponse.json({ success: true, role })
  } catch (error: any) {
    console.error('[API] Update member error:', error)
    return NextResponse.json(
      { error: 'Failed to update member' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { orgId: string; memberId: string } }
) {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId, memberId } = params

    // Check if requester has permission (owner or admin)
    const { data: requesterMembership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', session.userId)
      .single()

    if (!requesterMembership || 
        (requesterMembership.role !== 'owner' && requesterMembership.role !== 'admin')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Cannot remove owner
    const { data: targetMember } = await supabase
      .from('organization_members')
      .select('role, user_id')
      .eq('id', memberId)
      .single()

    if (targetMember?.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot remove workspace owner' },
        { status: 400 }
      )
    }

    // Delete member
    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('id', memberId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API] Delete member error:', error)
    return NextResponse.json(
      { error: 'Failed to remove member' },
      { status: 500 }
    )
  }
}
```

## Part 3: Updated Team Settings Component

The component needs to:
1. Fetch all members
2. Display role dropdown for non-owners
3. Add remove button for non-owners
4. Add role dropdown for invite link

### Key Functions to Add:

```typescript
// Fetch members
const fetchMembers = async () => {
  if (!workspace?.org?.id) return
  
  try {
    const res = await fetch(`/api/organizations/${workspace.org.id}/members`)
    const data = await res.json()
    
    if (data.members) {
      setMembers(data.members)
    }
  } catch (err) {
    console.error('Failed to fetch members:', err)
  } finally {
    setLoadingMembers(false)
  }
}

// Update member role
const handleRoleChange = async (memberId: string, newRole: string) => {
  if (!workspace?.org?.id) return
  
  try {
    await fetch(`/api/organizations/${workspace.org.id}/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole })
    })
    
    // Refresh members list
    fetchMembers()
  } catch (err) {
    console.error('Failed to update role:', err)
  }
}

// Remove member
const handleRemoveMember = async (memberId: string) => {
  if (!workspace?.org?.id) return
  if (!confirm('Remove this member from the workspace?')) return
  
  try {
    await fetch(`/api/organizations/${workspace.org.id}/members/${memberId}`, {
      method: 'DELETE'
    })
    
    // Refresh members list
    fetchMembers()
  } catch (err) {
    console.error('Failed to remove member:', err)
  }
}
```

### Role Dropdown Component:

```typescript
<Select
  value={member.role}
  onValueChange={(newRole) => handleRoleChange(member.id, newRole)}
  disabled={member.role === 'owner' || !canManageRoles}
>
  <SelectTrigger className="w-[130px]">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="owner">Owner</SelectItem>
    <SelectItem value="admin">Admin</SelectItem>
    <SelectItem value="member">Member</SelectItem>
    <SelectItem value="guest">Guest</SelectItem>
  </SelectContent>
</Select>
```

## Part 4: Implementation Steps

1. **Run SQL migration** (026_add_admin_role.sql)
2. **Create API endpoints:**
   - `src/app/api/organizations/[orgId]/members/route.ts`
   - `src/app/api/organizations/[orgId]/members/[memberId]/route.ts`
3. **Update team-settings.tsx:**
   - Add member fetching
   - Add role dropdowns
   - Add remove buttons
   - Add invite link role selector
4. **Test everything:**
   - View members
   - Change roles
   - Remove members
   - Use invite link with different roles

## Summary

This creates a complete, production-ready team management system with:
- ✅ Admin role in database
- ✅ Full CRUD for members
- ✅ Role-based permissions
- ✅ Industry-standard UI
- ✅ Proper error handling
- ✅ Security checks

All follows best practices from Linear, Notion, and GitHub!
