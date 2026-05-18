# Notification System Documentation

Last updated: 2026-04-21

Lucid currently has two notification lanes:

1. persistent product notifications for the inbox/bell surface
2. transient client toasts for immediate UI feedback

This doc is the current-state reference for both.

## Canonical Architecture

### Persistent notifications

Persistent inbox notifications are fetched from the database and shown in the product notification UI.

Primary entrypoint:

- `src/hooks/use-notifications.ts`

Used for:

- navbar bell / unread badge
- realtime insert subscription on the `notifications` table
- mark-as-read and mark-all-read flows

### Transient toasts

Transient UI feedback is now centralized behind one shared client toast API.

Primary entrypoints:

- `src/hooks/use-toast.ts`
- `src/contexts/notification-context.tsx`

Important current rule:

- app code should not import `toast` directly from `sonner`
- app code should use `@/hooks/use-toast`
- `useNotification()` is a compatibility/context wrapper that delegates into that same shared toast layer

### Shared copy catalog

Repeated user-facing notification strings live in:

- `src/lib/notifications/copy.ts`

This keeps common success/error copy consistent across the app.

## What Changed

The old custom notification renderer in `NotificationProvider` is no longer the primary transient notification system.

Current behavior:

- `NotificationProvider` still exists for compatibility
- but it delegates `showNotification()` into the shared Sonner-backed `toast` API
- there is now one actual transient notification engine instead of multiple client notification systems

## Quick Start

### Transient toast usage

```tsx
import { toast } from '@/hooks/use-toast'

toast.success('Saved')
toast.error('Failed to save', 'Please try again.')
toast.success('Copied', { description: 'Value copied to clipboard.' })
```

Supported calling styles remain:

- `toast.success('Saved')`
- `toast.success('Saved', 'Description')`
- `toast.success('Saved', { description: 'Description' })`

### Context compatibility usage

```tsx
import { useNotification } from '@/contexts/notification-context'

function Example() {
  const { showNotification } = useNotification()

  return (
    <button
      onClick={() =>
        showNotification({
          type: 'success',
          title: 'Saved',
          message: 'Your changes were saved successfully.',
        })
      }
    >
      Save
    </button>
  )
}
```

### Persistent inbox usage

```tsx
import { useNotifications } from '@/hooks/use-notifications'

function Bell() {
  const { notifications, unreadCount, markAsRead } = useNotifications()

  return (
    <div>
      <span>{unreadCount}</span>
      {notifications.map((notification) => (
        <button key={notification.id} onClick={() => markAsRead(notification.id)}>
          {notification.title}
        </button>
      ))}
    </div>
  )
}
```

## API Reference

### `toast`

Defined in `src/hooks/use-toast.ts`.

Available methods:

- `toast(...)`
- `toast.success(...)`
- `toast.error(...)`
- `toast.warning(...)`
- `toast.info(...)`
- `toast.loading(...)`
- `toast.dismiss(...)`
- `toast.promise(...)`

### `useToast()`

React hook that returns the shared `toast` object.

```tsx
import { useToast } from '@/hooks/use-toast'

const toast = useToast()
toast.success('Saved')
```

### `useNotification()`

Compatibility/context wrapper for feature code that still uses the notification context API.

Available methods:

- `showNotification(notification)`
- `hideNotification(id)`
- `clearAllNotifications()`

Notification shape:

```tsx
interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
  persistent?: boolean
}
```

### `useNotifications()`

Persistent inbox notification hook.

Returns:

- `notifications`
- `isLoading`
- `unreadCount`
- `markAsRead(id)`
- `markAllAsRead()`

## Guardrails

- do not add new direct `sonner` imports in feature code
- prefer `notificationCopy` for repeated common strings
- use inbox notifications for durable product events
- use transient toasts for immediate local UI feedback

The architecture guard test lives in:

- `src/lib/notifications/__tests__/notification-architecture.test.ts`

## Provider Setup

`NotificationProvider` is still mounted in the app provider tree and should remain there so existing `useNotification()` consumers continue to work.

Transient toast rendering itself is handled by the shared Sonner toaster component:

- `src/components/ui/sonner.tsx`

## Practical Rule

Choose the lane by durability:

- if the user should be able to come back later and see it again, use the persistent notification system
- if it is immediate local UI feedback for an action the user just took, use the shared toast layer

## Integration Examples

### With Form Libraries

```tsx
// React Hook Form
const { handleSubmit } = useForm()
const { showSuccess, showError } = useNotifications()

const onSubmit = handleSubmit(async (data) => {
  try {
    await submitForm(data)
    showSuccess('Success!', 'Form submitted successfully.')
  } catch (error) {
    showError('Error', error.message)
  }
})
```

### With API Clients

```tsx
// Axios
import axios from 'axios'
import { useNotifications } from '@/hooks/use-notifications'

const { showSuccess, showError } = useNotifications()

// Axios interceptor
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    showError('API Error', error.response?.data?.message || 'Request failed')
    return Promise.reject(error)
  }
)
```

### With State Management

```tsx
// Zustand store
const useStore = create((set, get) => ({
  notifications: [],
  addNotification: (notification) => set((state) => ({
    notifications: [...state.notifications, notification]
  })),
  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id)
  }))
}))
```

## Best Practices

### 1. **Use Appropriate Types**
```tsx
// ✅ Good
showSuccess('Saved!', 'Your changes have been saved.')
showError('Failed!', 'Could not save your changes.')

// ❌ Avoid
showInfo('Error!', 'This should be an error notification.')
```

### 2. **Keep Messages Concise**
```tsx
// ✅ Good
showSuccess('Success!', 'User created successfully.')

// ❌ Too verbose
showSuccess('Success!', 'The user has been created successfully and all the necessary permissions have been assigned and the welcome email has been sent.')
```

### 3. **Use Persistent for Important Messages**
```tsx
// ✅ Important system messages
showPersistent('warning', 'System Maintenance', 'The system will be down for maintenance in 30 minutes.')

// ✅ Regular notifications
showSuccess('Email Sent', 'Your message has been delivered.')
```

### 4. **Handle Errors Gracefully**
```tsx
// ✅ Good error handling
try {
  await riskyOperation()
  showSuccess('Operation Complete')
} catch (error) {
  showError('Operation Failed', error.message || 'An unexpected error occurred')
}
```

### 5. **Clean Up on Unmount**
```tsx
// ✅ Cleanup in useEffect
useEffect(() => {
  return () => {
    clearAllNotifications()
  }
}, [])
```

## Troubleshooting

### Notifications Not Showing

1. **Check Provider Setup**: Ensure `NotificationProvider` wraps your app
2. **Check Z-Index**: Notifications use `z-50`, ensure no other elements have higher z-index
3. **Check Console**: Look for JavaScript errors that might prevent rendering

### Styling Issues

1. **Dark Mode**: Ensure Tailwind dark mode is properly configured
2. **Custom Styles**: Check for CSS conflicts with notification classes
3. **Responsive**: Test on different screen sizes

### Performance Issues

1. **Too Many Notifications**: Reduce `maxNotifications` prop
2. **Memory Leaks**: Ensure proper cleanup in useEffect
3. **Animation Lag**: Check for CSS conflicts or heavy animations

## Migration from Alert/Toast Libraries

### From react-hot-toast

```tsx
// Before
import toast from 'react-hot-toast'
toast.success('Success!')
toast.error('Error!')

// After
import { useNotifications } from '@/hooks/use-notifications'
const { showSuccess, showError } = useNotifications()
showSuccess('Success!')
showError('Error!')
```

### From react-toastify

```tsx
// Before
import { toast } from 'react-toastify'
toast.success('Success!')
toast.error('Error!')

// After
import { useNotifications } from '@/hooks/use-notifications'
const { showSuccess, showError } = useNotifications()
showSuccess('Success!')
showError('Error!')
```

## File Structure

```
src/
├── contexts/
│   └── notification-context.tsx    # Core notification context
├── hooks/
│   └── use-notifications.ts        # Convenience hook
├── components/
│   └── notification-demo.tsx       # Demo component
└── app/
    └── layout.tsx                  # Provider setup
```

## Dependencies

- `@headlessui/react` - For smooth animations and accessibility
- `@heroicons/react` - For notification icons
- `react` - Core React functionality
- `tailwindcss` - For styling

---

**Ready to use!** The notification system is now integrated and ready for use throughout your application. 🎉
