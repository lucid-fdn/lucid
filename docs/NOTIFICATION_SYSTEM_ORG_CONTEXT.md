# ✅ Notification System with Organization Context - Complete Guide

## 🎉 System Overview

Your notification system now supports **both user-scoped and organization-scoped notifications**:
- **Global notifications** (organization_id = null) - shown in all org contexts
- **Org-specific notifications** (organization_id = orgId) - shown only in that org
- **Real-time updates** via Supabase subscriptions
- **Bell icon integration** in navbar
- **Toast notifications** for immediate feedback

---

## 📊 Architecture

### Two Notification Systems

#### 1. Toast Notifications (Immediate Feedback)
- **Purpose:** Temporary, immediate user feedback
- **Location:** `src/contexts/notification-context.tsx`
- **Duration:** 3-7 seconds
- **Use for:** Action confirmations, errors, success messages

#### 2. Bell Notifications (Persistent Inbox)
- **Purpose:** Persistent notification history
- **Location:** `src/hooks/use-notifications.tsx`
- **Duration:** Until user dismisses
- **Use for:** Important updates, invites, team actions

---

## 🗂️ Database Schema

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),              -- Who sees it
  organization_id UUID REFERENCES organizations(id) NULL,  -- Org context (NULL = global)
  
  title TEXT NOT NULL,
  message TEXT,
  type TEXT CHECK (type IN ('info', 'success', 'warning', 'error')),
  href TEXT,  -- Optional link
  
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Key Design Decision:
- **organization_id = NULL** → Global notification (shows everywhere)
- **organization_id = UUID** → Org-specific (shows only in that org)

---

## 🚀 Usage Guide

### Client-Side (React Components)

#### Hook: useNotifications
```typescript
import { useNotifications } from '@/hooks/use-notifications';

function MyComponent() {
  const { 
    notifications,    // Filtered by current org context
    unreadCount,      // Number of unread
    loading,          // Initial load state
    markAsRead,       // Mark one as read
    markAllAsRead,    // Mark all as read
    deleteNotification, // Delete one
    refetch           // Manual refresh
  } = useNotifications();

  return (
    <div>
      <p>You have {unreadCount} unread notifications</p>
      {notifications.map(n => (
        <div key={n.id} onClick={() => markAsRead(n.id)}>
          <h4>{n.title}</h4>
          <p>{n.message}</p>
        </div>
      ))}
    </div>
  );
}
```

### Server-Side (API Routes)

#### Basic Usage
```typescript
import { createNotification } from '@/lib/notifications';

// In your API route
export async function POST(request: Request) {
  // ... your logic ...
  
  // Create global notification
  await createNotification({
    user_id: userId,
    organization_id: null,  // Global
    title: 'Welcome!',
    message: 'Thanks for signing up',
    type: 'info'
  });
  
  // Create org-specific notification
  await createNotification({
    user_id: memberId,
    organization_id: orgId,  // Org-specific
    title: 'New member joined',
    message: 'John Doe joined your team',
    type: 'success',
    href: `/workspace/${orgId}/settings/team`
  });
}
```

#### Bulk Notifications
```typescript
import { notifyOrgMembers } from '@/lib/notifications';

// Notify all members of an organization
await notifyOrgMembers(orgId, {
  title: 'Team update',
  message: 'New project created',
  type: 'info',
  href: `/workspace/${orgId}/projects`
});
```

#### Using Templates
```typescript
import { NotificationTemplates } from '@/lib/notifications';

// When member joins
await NotificationTemplates.memberJoined(orgId, memberName);

// When role changes
await NotificationTemplates.roleChanged(userId, orgId, newRole, orgName);

// Welcome new user
await NotificationTemplates.welcome(userId);
```

---

## 📝 Common Scenarios

### 1. User Invited to Organization
```typescript
// src/app/api/workspace/[id]/invites/route.ts
import { NotificationTemplates } from '@/lib/notifications';

// After creating invite
await NotificationTemplates.orgInvite(
  inviteeUserId,
  orgId,
  orgName,
  inviterName
);
```

**Result:** Invitee sees notification in their current org

### 2. Member Joins Organization
```typescript
// src/app/api/invites/[token]/accept/route.ts
import { NotificationTemplates } from '@/lib/notifications';

// After user accepts invite
await NotificationTemplates.memberJoined(orgId, memberName);
```

**Result:** All org members see notification when in that org

### 3. Member Removed from Organization
```typescript
// src/app/api/workspace/[id]/members/route.ts (DELETE)
import { NotificationTemplates } from '@/lib/notifications';

// After removing member
await NotificationTemplates.memberRemoved(userId, orgId, orgName);
```

**Result:** Removed user sees global notification (can't access org anymore)

### 4. Role Changed
```typescript
// src/app/api/workspace/[id]/members/route.ts (PATCH)
import { NotificationTemplates } from '@/lib/notifications';

// After changing role
await NotificationTemplates.roleChanged(userId, orgId, newRole, orgName);
```

**Result:** User sees notification when viewing that org

---

## 🎯 Filtering Logic

### How Notifications Are Filtered

```typescript
// In useNotifications hook
const { data } = await supabase
  .from('notifications')
  .select('*')
  .eq('user_id', user.id)
  .or(
    workspace?.org?.id
      ? `organization_id.is.null,organization_id.eq.${workspace.org.id}`
      : 'organization_id.is.null'
  )
```

**Translation:**
- Show notifications where:
  - `organization_id IS NULL` (global), OR
  - `organization_id = current_org_id` (current org)

**Example:**
```
User is in Org A:
  ✅ Global notification (org_id = null)
  ✅ Org A notification (org_id = Org A)
  ❌ Org B notification (org_id = Org B)
  
User switches to Org B:
  ✅ Global notification (org_id = null)  
  ❌ Org A notification (org_id = Org A)
  ✅ Org B notification (org_id = Org B)
```

---

## 🔔 Bell Icon Integration

### Current Implementation
```typescript
// src/components/navigation/nav-notifications.tsx
import { useNotifications } from '@/hooks/use-notifications';

export function NavNotifications() {
  const { notifications, markAsRead, unreadCount } = useNotifications();
  
  return (
    <Popover>
      <PopoverTrigger>
        <BellIcon />
        {unreadCount > 0 && <Badge>{unreadCount}</Badge>}
      </PopoverTrigger>
      <PopoverContent>
        {notifications.map(n => (
          <NotificationItem 
            key={n.id}
            notification={n}
            onRead={() => markAsRead(n.id)}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
```

### Features:
- ✅ Real-time updates
- ✅ Unread count badge
- ✅ Click to mark as read
- ✅ Navigate to linked page
- ✅ Org-context aware

---

## 🛠️ Setup & Installation

### 1. Run Migration
```bash
# In Supabase SQL Editor
-- Run migrations/014_add_org_context_to_notifications.sql
```

This adds:
- `organization_id` column (nullable)
- Indexes for performance
- Updated RLS policies

### 2. Verify Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### 3. Test It
```typescript
// Test in browser console
import { createNotification } from '@/hooks/use-notifications';

await createNotification({
  user_id: 'your-user-id',
  organization_id: null,
  title: 'Test notification',
  message: 'This is a test',
  type: 'info'
});
```

---

## 📊 Notification Types

### Type Definitions
```typescript
type NotificationType = 'info' | 'success' | 'warning' | 'error';
```

### Visual Indicators
- **info** 🔵 - Blue icon, general information
- **success** ✅ - Green icon, positive actions
- **warning** ⚠️ - Yellow icon, attention needed
- **error** ❌ - Red icon, problems/failures

### When to Use Each:
```typescript
// INFO - General updates
{ type: 'info', title: 'New feature available' }

// SUCCESS - Positive confirmations
{ type: 'success', title: 'Member joined' }

// WARNING - Attention needed
{ type: 'warning', title: 'Payment due soon' }

// ERROR - Problems
{ type: 'error', title: 'Sync failed' }
```

---

## 🎨 Customization

### Adding Custom Notification Templates
```typescript
// src/lib/notifications.ts

export const NotificationTemplates = {
  // ... existing templates ...
  
  // Add your custom template
  customEvent: (userId: string, orgId: string, details: string) =>
    createNotification({
      user_id: userId,
      organization_id: orgId,
      title: 'Custom Event',
      message: details,
      type: 'info',
      href: `/custom/path`
    }),
};
```

### Usage:
```typescript
await NotificationTemplates.customEvent(userId, orgId, 'Something happened!');
```

---

## 🔍 Debugging

### Check Notifications in Database
```sql
-- All notifications for a user
SELECT * FROM notifications 
WHERE user_id = 'user-id'
ORDER BY created_at DESC;

-- Unread notifications
SELECT * FROM notifications 
WHERE user_id = 'user-id' AND read = FALSE;

-- Org-specific notifications
SELECT * FROM notifications 
WHERE organization_id = 'org-id';

-- Global notifications
SELECT * FROM notifications 
WHERE organization_id IS NULL;
```

### Console Logs
```typescript
// Enable in useNotifications hook
console.log('[useNotifications] Fetching with org:', workspace?.org?.id);
console.log('[useNotifications] Got notifications:', notifications.length);
```

---

## ✅ Testing Checklist

### Unit Tests
- [ ] Create global notification
- [ ] Create org-specific notification
- [ ] Filter by org context
- [ ] Mark as read
- [ ] Delete notification
- [ ] Bulk notifications

### Integration Tests
- [ ] Bell icon shows unread count
- [ ] Clicking notification marks as read
- [ ] Notifications
