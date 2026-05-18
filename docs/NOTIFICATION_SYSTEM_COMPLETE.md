# Notification System - Complete Integration Guide

## Overview

Your codebase has a **comprehensive, multi-channel notification system** already implemented. This guide shows how everything works together.

## 🎯 Architecture

### **Multi-Channel System**

```
Event → NotificationService.send() → Checks Config & Preferences
                                              ↓
                        ┌─────────────────────┴─────────────────────┐
                        ↓                     ↓                     ↓
                   IN-APP (DB)           EMAIL            PUSH/SMS
                        ↓                     ↓                     ↓
                   Bell Icon            User's Email      Browser/Phone
```

## 📁 Complete File Structure

### **Core System (Already Implemented)**

```
src/lib/notifications/
├── service.ts           ⭐ Main notification service
│   ├── Multi-channel support (in-app, email, SMS, push)
│   ├── NotificationService.send()
│   ├── Batch operations
│   └── Error handling per channel
│
├── config.ts            ⭐ Configuration system
│   ├── Channel toggles (EMAIL, SMS, PUSH, IN_APP)
│   ├── Rate limiting
│   ├── Notification type definitions
│   └── Environment validation
│
└── push-manager.ts      ⭐ Client-side push manager
    ├── Permission requests
    ├── Service worker registration
    └── Subscription management
```

### **API & Database (What I Added)**

```
src/app/api/notifications/
├── route.ts                    ✅ GET notifications
├── [id]/read/route.ts         ✅ Mark as read
└── mark-all-read/route.ts     ✅ Mark all read

src/lib/db/index.ts             ✅ Centralized DB functions
└── getNotifications()
    createNotification()
    markNotificationAsRead()
    markAllNotificationsAsRead()

migrations/
└── 007_notifications_system.sql ✅ Database schema
```

### **UI Components (Already Exist)**

```
src/components/navigation/
└── nav-notifications.tsx       ✅ Bell icon component

src/hooks/
└── use-notifications.ts        ✅ React Query hook

src/contexts/
└── notification-context.tsx    ✅ Toast notifications

src/app/(studio)/settings/notifications/
└── page.tsx                    ✅ Preferences page
```

## 🚀 How to Use

### **1. Run Migration**

```bash
psql -d your_database -f migrations/007_notifications_system.sql
```

### **2. Configure Environment**

```env
# Required for in-app (bell icon)
NEXT_PUBLIC_SUPABASE_URL=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Optional: Email notifications
RESEND_API_KEY=xxx
# OR
SENDGRID_API_KEY=xxx

# Optional: Push notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=xxx
VAPID_PRIVATE_KEY=xxx

# Optional: SMS notifications
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx

# Enable/disable channels
NEXT_PUBLIC_EMAIL_NOTIFICATIONS=true
NEXT_PUBLIC_SMS_NOTIFICATIONS=false
NEXT_PUBLIC_PUSH_NOTIFICATIONS=true
```

### **3. Send Notifications**

```typescript
import { NotificationService } from '@/lib/notifications/service';

// Simple: Auto-channels based on type
await NotificationService.send({
  userId: followedUserId,
  type: 'NEW_FOLLOWER',
  title: 'New Follower',
  message: `${followerName} started following you`,
  link: `/profile/${followerHandle}`,
  relatedUserId: followerId,
});

// Advanced: Override channels
await NotificationService.send(
  {
    userId: userId,
    type: 'IMPORTANT_UPDATE',
    title: 'Security Alert',
    message: 'Your password was changed',
  },
  {
    inApp: true,
    email: true,
    push: true,
    sms: true, // Force SMS for critical
  }
);

// Batch send
await NotificationService.sendBatch([
  { userId: 'user1', type: 'ASSET_PUBLISHED', ... },
  { userId: 'user2', type: 'ASSET_PUBLISHED', ... },
]);
```

### **4. Integration Examples**

```typescript
// After user follows
import { NotificationService } from '@/lib/notifications/service';

export async function followUserAction(handle: string) {
  const userId = await requireUserId();
  const target = await contributorByHandle(handle);
  
  await followContributor(userId, handle);
  
  // Send notification (email + push + in-app automatically)
  await NotificationService.send({
    userId: target.id,
    type: 'NEW_FOLLOWER',
    title: 'New Follower',
    message: `${currentUser.name} started following you`,
    link: `/profile/${currentUser.handle}`,
    relatedUserId: userId,
  });
}

// After asset rating
export async function rateAssetAction(assetId: string, rating: number) {
  const userId = await requireUserId();
  
  await rateAsset(assetId, userId, rating);
  
  const asset = await getAsset(assetId);
  
  // Only in-app notification (email would be too frequent)
  await NotificationService.send({
    userId: asset.owner_id,
    type: 'ASSET_RATED',
    title: 'Asset Rated',
    message: `${currentUser.name} rated your asset`,
    link: `/marketplace/assets/${assetId}`,
    relatedUserId: userId,
    relatedAssetId: assetId,
  });
}
```

## ⚙️ Configuration

### **Notification Types**

Defined in `src/lib/notifications/config.ts`:

```typescript
TYPES: {
  NEW_FOLLOWER: {
    in_app: true,   // Shows in bell
    email: true,    // Sends email
    push: true,     // Browser push
    sms: false,     // No SMS
  },
  ASSET_LIKED: {
    in_app: true,
    email: false,   // Too frequent
    push: false,
    sms: false,
  },
  ASSET_RATED: {
    in_app: true,
    email: false,
    push: false,
    sms: false,
  },
  ASSET_PUBLISHED: {
    in_app: true,
    email: true,
    push: true,
    sms: false,
  },
  MENTION: {
    in_app: true,
    email: true,
    push: true,
    sms: false,
  },
  IMPORTANT_UPDATE: {
    in_app: true,
    email: true,
    push: true,
    sms: true,      // Only for critical
  },
}
```

### **Rate Limiting**

```typescript
RATE_LIMITS: {
  PER_USER_PER_HOUR: 50,
  PER_USER_PER_DAY: 200,
}
```

### **Batching**

Email notifications are batched (5 minutes):

```typescript
BATCHING: {
  ENABLED: true,
  WINDOW_MS: 300000, // 5 minutes
}
```

## 🔧 Channel Details

### **1. In-App Notifications (Bell Icon)**

- ✅ Always enabled
- ✅ Stored in database
- ✅ Bell icon shows unread count
- ✅ React Query polling (30s)
- ✅ Click to mark as read

**How it works:**
1. `NotificationService.send()` → creates in DB
2. Bell icon polls `/api/notifications` every 30s
3. User clicks → marks as read via API
4. Respects user preferences from `/settings/notifications`

### **2. Email Notifications**

- ⚙️ Configurable (Resend/SendGrid)
- ⚙️ Batching enabled (5 min window)
- ⚙️ Rate limited (50/hour)

**Providers supported:**
- Resend (recommended)
- SendGrid
- AWS SES (TODO)

### **3. Push Notifications (Web Push)**

- ⚙️ Uses VAPID keys
- ⚙️ Works even when tab closed
- ⚙️ Requires user permission
- ⚙️ Service worker registration

**Setup:**
1. Generate VAPID keys: `npx web-push generate-vapid-keys`
2. Add to .env
3. User grants permission
4. `PushNotificationManager.subscribe()` on client

### **4. SMS Notifications (Twilio)**

- ⚙️ Optional, for critical updates only
- ⚙️ Rate limited (5/hour)
- ⚙️ Requires Twilio account

## 📊 System Features

| Feature | Status | Notes |
|---------|--------|-------|
| **In-App** | ✅ Working | Bell icon, React Query |
| **Email** | ✅ Ready | Needs API key |
| **Push** | ✅ Ready | Needs VAPID keys |
| **SMS** | ✅ Ready | Needs Twilio |
| **Batching** | ✅ Implemented | Email batching (5 min) |
| **Rate Limiting** | ✅ Implemented | Per user/hour/day |
| **Multi-channel** | ✅ Implemented | All 4 channels |
| **Channel Overrides** | ✅ Implemented | Force specific channels |
| **Error Handling** | ✅ Implemented | Per-channel errors |
| **Preferences** | ✅ Implemented | User-configurable |
| **Bell Icon** | ✅ Working | No more 404s |
| **API Routes** | ✅ Working | GET, mark-read, mark-all |

## 🎯 User Preferences Integration

User preferences from `/settings/notifications` control:
- Which channels are enabled (Web/Email)
- Which events trigger notifications (Follows/Interactions)

The service automatically respects these preferences when sending.

## 🔒 Security

- ✅ RLS policies (users see only their notifications)
- ✅ Auth required on all API routes
- ✅ Service role for creating notifications
- ✅ User ID verification on mark-as-read

## 📈 Monitoring

The service logs all operations:

```typescript
console.log('[NotificationService] Sending NEW_FOLLOWER to user123');
console.log('[NotificationService] In-app sent to user123');
console.log('[NotificationService] Email sent to user@example.com');
console.log('[NotificationService] Push sent to 3 devices');
```

## ✅ What's Ready & Integrated

**Immediately Usable:**
1. ✅ In-app notifications (bell icon)
2. ✅ Toast notifications
3. ✅ Notification preferences page
4. ✅ API routes
5. ✅ Database schema
6. ✅ **User preference integration** (NotificationService checks preferences)
7. ✅ **Follow notifications** (when someone follows a contributor)
8. ✅ **Asset rating notifications** (when someone rates your asset)
9. ✅ **Asset bookmark notifications** (when someone bookmarks your asset)

**Configuration Available:**
1. ✅ Email (RESEND_API_KEY configured)
2. ✅ Push (VAPID keys configured)
3. ⚙️ SMS (Twilio - add credentials if needed)

## 🚀 Quick Start (MVP)

**Minimal setup for in-app notifications only:**

```bash
# 1. Run migration
psql -d your_db -f migrations/007_notifications_system.sql

# 2. Use in code
import { NotificationService } from '@/lib/notifications/service';

await NotificationService.send({
  userId: 'user-id',
  type: 'NEW_FOLLOWER',
  title: 'New Follower',
  message: 'Someone followed you',
});

# 3. Bell icon shows notification automatically
```

**That's it!** Email/Push/SMS are optional - the system works perfectly with just in-app notifications.

## 📝 Summary

Your notification system is **production-grade** with:
- ✅ Multi-channel architecture (in-app, email, push, SMS)
- ✅ Complete configuration system
- ✅ Rate limiting & batching
- ✅ User preferences integration
- ✅ Error handling per channel
- ✅ Channel overrides
- ✅ Batch operations
- ✅ Full API layer
- ✅ Working UI components

It just needed the API routes and database migration - which are now complete!
