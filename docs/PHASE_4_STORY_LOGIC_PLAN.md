# Phase 4: Story View Logic & Editing
## Advanced Story View Features

**Date:** October 21, 2025  
**Status:** Ready to Start  
**Estimated Time:** 3-4 hours

---

## 🎯 Phase 4 Goals

Add interactive editing capabilities to Story View:
1. **Inline Editing** - Click step to edit in natural language
2. **Add/Remove Steps** - Floating + buttons between steps
3. **Validation** - Real-time checks and suggestions
4. **Sync** - Keep Story ↔ Structure in sync

---

## ✅ What We Have (M0-M3 Complete)

- [x] ApplePromptInput ✅
- [x] SuggestionChips ✅
- [x] StoryStepCard ✅ (basic, non-editable)
- [x] StoryView ✅ (display only)
- [x] FlowSpec Parser ✅ (read-only)
- [x] AI Dialog integration ✅

---

## 📋 Phase 4 Tasks

### 1. Inline Editing (1.5 hours)

**Update:** `src/components/ai/story-step-card.tsx`

**Add Edit Mode:**
```tsx
interface StoryStepCardProps {
  // ... existing props
  editable?: boolean
  onEdit?: (newText: string) => Promise<void>
}

// Features:
- Click card to enter edit mode
- Show inline input field
- Save/Cancel buttons
- Loading state during save
- Error handling
- Smooth animation transitions
```

**API Integration:**
```tsx
// New API endpoint needed
POST /api/ai/edit-step
{
  stepId: string,
  originalText: string,
  newText: string,
  flowSpec: FlowSpec
}

// Returns updated FlowSpec
```

**Implementation Steps:**
- [ ] Add edit mode state to StoryStepCard
- [ ] Create inline input UI
- [ ] Add Save/Cancel buttons
- [ ] Implement edit handler
- [ ] Call API to update FlowSpec
- [ ] Re-render StoryView with updates
- [ ] Add loading/error states
- [ ] Test editing various step types

---

### 2. Add/Remove Steps (1 hour)

**Create:** `src/components/ai/add-step-button.tsx`

**Features:**
```tsx
- Floating "+" button between steps
- Popover with mini prompt
- "What should happen next?" placeholder
- Insert step at position
- Smooth insertion animation
- Delete confirmation for remove
```

**Implementation:**
- [ ] Create AddStepButton component
- [ ] Add between each step
- [ ] Create step insertion API
- [ ] Implement remove confirmation
- [ ] Add smooth insertion/removal animations
- [ ] Test add at beginning/middle/end
- [ ] Test remove with confirmation

---

### 3. Enhanced Validation (1 hour)

**Create:** `src/lib/ai/validation.ts`

**Validation Checks:**
```tsx
export interface ValidationResult {
  isValid: boolean
  issues: Issue[]
  suggestions: Suggestion[]
  confidence: number
}

interface Issue {
  stepId: string
  severity: 'error' | 'warning'
  message: string
  suggestion?: string
}

// Check:
- Required parameters present
- Connections valid (no orphans)
- No circular dependencies
- Authentication configured
- Field mappings correct
- Rate limits respected
```

**UI Updates:**
```tsx
// Show validation inline
- Red border on steps with errors
- Warning border on steps with warnings
- Tooltip with issue details
- Inline suggestion chips
- "Fix this" quick actions
```

**Implementation:**
- [ ] Create validation utility
- [ ] Add real-time validation to StoryView
- [ ] Show errors/warnings on step cards
- [ ] Add suggestion tooltips
- [ ] Implement quick fix actions
- [ ] Test with various invalid workflows

---

### 4. Real-Time Sync (30 min)

**Ensure Story ↔ Structure Sync:**

```tsx
// When user edits in Story View:
1. Update FlowSpec
2. Trigger Structure View re-render
3. Maintain scroll position
4. Highlight changed nodes

// When user edits in Structure View:
1. Update FlowSpec
2. Trigger Story View re-parse
3. Highlight changed steps
4. Show "Story updated" toast
```

**Implementation:**
- [ ] Add FlowSpec state management
- [ ] Implement two-way sync
- [ ] Test Story → Structure updates
- [ ] Test Structure → Story updates
- [ ] Verify no race conditions

---

## 🎨 UI Enhancements

### Inline Editing UX

**Edit Mode:**
```tsx
<StoryStepCard
  type="when"
  title="When webhook is received"
  description="Listens for HTTP requests"
  editable={true}
  onEdit={async (newText) => {
    // User types: "When a new payment arrives"
    const updated = await updateStep(stepId, newText)
    // AI updates FlowSpec to match new description
  }}
/>
```

**Visual States:**
- Default: Hoverable, shows "Click to edit" on hover
- Editing: Input field, Save/Cancel buttons
- Loading: Spinner, disabled state
- Success: Brief green flash, return to default
- Error: Red border, error message

---

### Add Step UX

**Between Steps:**
```tsx
Step 1: When webhook received
    ↓
  [+] Add step  ← Floating button
    ↓
Step 2: Do send to Slack

// Click + button:
┌─────────────────────────┐
│ What should happen?     │
│ [Input field]           │
│ [Add Step] [Cancel]     │
└─────────────────────────┘
```

---

### Validation UX

**Step with Error:**
```tsx
┌─────────────────────────────────┐
│ ⚠️ When webhook is received     │ ← Red border
│                                 │
│ Missing: webhook URL            │ ← Error message
│ 💡 Try: /api/webhooks/payment   │ ← Suggestion
│                                 │
│ [Fix Automatically]             │ ← Quick action
└─────────────────────────────────┘
```

---

## 📊 Phase 4 Success Criteria

**Must Have:**
- [ ] Inline editing works smoothly
- [ ] Add/remove steps functional
- [ ] Validation shows errors clearly
- [ ] Suggestions helpful
- [ ] Story ↔ Structure sync working

**Performance:**
- [ ] Edit save < 500ms
- [ ] Validation instant (<50ms)
- [ ] Animations smooth 60fps

**UX:**
- [ ] Clear feedback on all actions
- [ ] No data loss on errors
- [ ] Undo/redo (nice to have)

---

## 🚀 Next Steps

**Start Phase 4:**
1. Update StoryStepCard for editing
2. Create AddStepButton component
3. Enhance validation logic
4. Test everything together

**After Phase 4:**
- Phase 5: Unique Features (confidence meter, proof sparkles)
- Phase 6: Polish & Testing
- Phase 7: Deployment

---

**Status:** Ready to build advanced editing features! 🎨
