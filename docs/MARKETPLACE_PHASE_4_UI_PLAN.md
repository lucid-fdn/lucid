# Phase 4: Marketplace UI - Implementation Plan

## Overview

Build the user-facing marketplace interface with modern, responsive components that connect to our v2 APIs.

---

## Components to Build

### 1. Marketplace Browse Page (`/marketplace`)
**Purpose:** Main marketplace discovery page

**Features:**
- Search bar
- Filter by kind (MODEL, DATASET, AGENT)
- Asset grid with cards
- Pagination
- Sorting options

**Uses:**
- `useMarketplaceSearch()` hook
- Asset cards with bookmark/rate buttons

### 2. Asset Detail Page (`/marketplace/[id]`)
**Purpose:** Detailed view of a single asset

**Features:**
- Asset metadata (name, description, tags)
- Bookmark button
- Rating system (stars + comment)
- Provider information
- Usage statistics
- Similar assets

**Uses:**
- `useBookmark()` hook
- `useRating()` hook
- Individual asset fetching

### 3. Contributor Profile (`/profile/[handle]`)
**Purpose:** View contributor's assets and activity

**Features:**
- Profile info
- Follow button
- List of contributed assets
- Activity feed
- Followers/following count

**Uses:**
- `useFollowContributor()` hook
- Asset list

### 4. Organization Page (`/workspace/[slug]`)
**Purpose:** View organization's assets and team

**Features:**
- Organization info
- Follow button
- Team members
- Organization assets
- Activity

**Uses:**
- `useFollowOrganization()` hook
- Asset list

### 5. My Bookmarks (`/marketplace/bookmarks`)
**Purpose:** User's saved assets

**Features:**
- Grid of bookmarked assets
- Remove bookmark
- Filter/sort
- Export list

---

## Component Architecture

```
src/app/(marketplace)/
├── marketplace/
│   ├── page.tsx                 # Browse page
│   ├── [id]/
│   │   └── page.tsx             # Asset detail
│   └── bookmarks/
│       └── page.tsx             # My bookmarks
│
src/components/marketplace/
├── asset-card.tsx               # Asset preview card
├── asset-grid.tsx               # Grid layout
├── asset-detail.tsx             # Full asset view
├── bookmark-button.tsx          # Bookmark toggle
├── rating-widget.tsx            # Star rating
├── rating-form.tsx              # Rate with comment
├── search-bar.tsx               # Search input
├── filters.tsx                  # Kind/provider filters
├── contributor-card.tsx         # Contributor preview
└── follow-button.tsx            # Follow toggle
```

---

## Priority Order

### Phase 4.1: Core Components (First)
1. ✅ Asset Card Component
2. ✅ Bookmark Button
3. ✅ Rating Widget
4. ✅ Search Bar

### Phase 4.2: Browse Page
5. ✅ Marketplace Browse Page
6. ✅ Filters
7. ✅ Grid Layout

### Phase 4.3: Detail View
8. ✅ Asset Detail Page
9. ✅ Rating Form

### Phase 4.4: Social Features
10. ✅ Contributor Profile
11. ✅ Follow Button
12. ✅ My Bookmarks

---

## Design Principles

1. **Use shadcn/ui components** - Already in your codebase
2. **Responsive** - Mobile-first design
3. **Fast** - Optimistic updates
4. **Accessible** - ARIA labels, keyboard nav
5. **Consistent** - Match existing design system

---

## Next Steps

Start with Phase 4.1: Core Components
