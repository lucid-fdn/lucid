# Avatar Advanced Features - Implementation Plan

## 🐛 Bugs to Fix

### 1. Infinite Skeleton on Profile Page
**Issue**: Suspense wrapper causing infinite loading

**Fix**: Remove Suspense from profile page (not needed for this page)

**File**: `src/app/(studio)/settings/profile/page.tsx`

### 2. Navbar Avatar Showing "U" 
**Issue**: Client component doesn't have profile data, only uses Privy user data

**Root Cause**: 
- NavUserMenu is client component using `useAuth()`
- `user.picture` comes from Privy (OAuth providers)
- `user.avatar_url` doesn't exist on Privy user object
- Need to fetch profile from database

**Fix Options**:
- Option A: Create server component wrapper for navbar (complex)
- Option B: Store avatar_url in auth context after profile fetch (better)
- Option C: Use client-side fetch in NavUserMenu (simplest for now)

**Recommended**: Option C with SWR/React Query for caching

### 3. Profile Pic FOUC
**Issue**: Avatar loads after page render

**Fix**: 
- Preload avatar URL
- Use Next.js Image with priority
- Cache avatar URL in localStorage

---

## ✨ Feature A: Undo Functionality

### Requirements
- Store previous avatar URL before upload
- Show toast with undo button for 10 seconds
- Clicking undo restores previous avatar
- Timer auto-dismisses after 10s

### Implementation

```typescript
// In AvatarUploadV2
const [previousUrl, setPreviousUrl] = useState<string>()
const [undoTimeoutId, setUndoTimeoutId] = useState<NodeJS.Timeout>()

const handleUndo = async () => {
  if (!previousUrl) return
  
  // Clear timeout
  if (undoTimeoutId) clearTimeout(undoTimeoutId)
  
  // Restore previous avatar
  const result = await updateProfileAction({ 
    avatar_url: previousUrl 
  })
  
  if (result.success) {
    toast.success('Avatar restored')
    router.refresh()
  }
}

// In upload function
setPreviousUrl(currentUrl) // Store before upload
// ... upload logic
// After success:
const timeoutId = setTimeout(() => {
  setPreviousUrl(undefined) // Clear after 10s
}, 10000)
setUndoTimeoutId(timeoutId)

// Show toast with undo
toast.success('Profile photo updated', {
  action: {
    label: 'Undo',
    onClick: handleUndo
  },
  duration: 10000
})
```

**Files to Modify**:
- `src/components/forms/avatar-upload-v2.tsx`

**Dependencies**: None (uses existing toast system)

---

## ✨ Feature B: Image Cropping

### Requirements
- Modal opens after file selection
- User can crop/zoom image
- Aspect ratio 1:1 (square)
- Export as blob then upload

### Library Choice
**react-easy-crop** - Best for our use case
- Lightweight
- Touch-friendly
- Zoom support
- Easy to use

### Installation
```bash
npm install react-easy-crop
```

### Implementation

```typescript
// New component: ImageCropModal
import Cropper from 'react-easy-crop'

interface CropModalProps {
  image: string // blob URL
  onComplete: (croppedImage: Blob) => void
  onCancel: () => void
}

export function ImageCropModal({ image, onComplete, onCancel }: CropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  const onCropComplete = (croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }

  const handleSave = async () => {
    const croppedBlob = await getCroppedImg(image, croppedAreaPixels)
    onComplete(croppedBlob)
  }

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent>
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          aspect={1}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Files to Create**:
- `src/components/forms/image-crop-modal.tsx`
- `src/lib/image-utils.ts` (crop utility functions)

**Files to Modify**:
- `src/components/forms/avatar-upload-v2.tsx` (integrate modal)

---

## 📊 Implementation Order

### Phase 1: Bug Fixes (Critical)
1. Remove Suspense from profile page
2. Fix navbar avatar loading
3. Add avatar preloading

### Phase 2: Undo Feature (Quick Win)
4. Add undo functionality to AvatarUploadV2

### Phase 3: Cropping Feature (Requires Install)
5. Install react-easy-crop
6. Create ImageCropModal component
7. Add crop utilities
8. Integrate into AvatarUploadV2

---

## 🔧 Quick Fixes First

### Fix 1: Remove Suspense (Causing Infinite Skeleton)

```typescript
// src/app/(studio)/settings/profile/page.tsx
// Change from:
export default function ProfileSettingsPage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <ProfileContent />
    </Suspense>
  )
}

// To:
export default async function ProfileSettingsPage() {
  const userId = await getUserId()
  const profile = await getProfile(userId)
  
  return (
    <div className="space-y-6">
      <ProfileForm defaultValues={...} userName={...} />
    </div>
  )
}
```

### Fix 2: Navbar Avatar with Profile Data

```typescript
// Create: src/hooks/use-profile.ts
export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  
  useEffect(() => {
    if (user?.id) {
      fetch(`/api/profile/${user.id}`)
        .then(res => res.json())
        .then(setProfile)
    }
  }, [user?.id])
  
  return {
    ...user,
    avatar_url: profile?.avatar_url || user?.picture
  }
}
```

### Fix 3: Preload Avatar

```typescript
// Add to NavUserMenu
<link rel="preload" as="image" href={profile?.avatar_url} />
```

---

## Summary

**Bugs**: 3 identified, all fixable
**Features**: 2 requested
- Undo: Easy, no dependencies
- Cropping: Medium, needs `npm install react-easy-crop`

**Total Time Estimate**: 
- Bug fixes: 20 min
- Undo: 15 min  
- Cropping: 45 min
- **Total: ~80 minutes**

**Context Window**: 62% used, should fit everything
