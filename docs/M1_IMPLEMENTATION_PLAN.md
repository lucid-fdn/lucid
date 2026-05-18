# M1: Prompt → Preview → Story - Implementation Plan
## Apple-Inspired AI Workflow Interface

**Start Date:** October 21, 2025  
**Estimated Time:** 10 hours  
**Status:** Starting Now

---

## 🎯 M1 Goals

Build the **Prompt-First** AI workflow experience:
1. Apple-style prompt input (large, breathing)
2. Suggestion chips for common workflows
3. Story View (When/If/Do narrative)
4. Confidence Meter (workflow readiness)
5. Streaming AI responses

---

## ✅ Prerequisites (M0 Complete)

- [x] Design tokens (`src/lib/design/tokens.ts`) ✅
- [x] Motion library (`src/lib/design/motion.ts`) ✅
- [x] Tailwind configured with tokens ✅
- [x] Framer Motion available ✅
- [x] Animation system complete ✅

---

## 📋 M1 Phase 1: Foundation & Dependencies (1 hour)

### Install Dependencies

**1. Vercel AI SDK**
```bash
npm install ai
```
- Purpose: Streaming AI responses
- Used for: `useChat` hook, `streamText`

**2. Check Existing Dependencies**
- [x] Framer Motion - Already installed ✅
- [ ] Verify AI SDK compatibility
- [ ] Check for peer dependency issues

**3. Prompt Kit Components** (Optional - can build custom)
```bash
npx shadcn@latest add "https://prompt-kit.com/c/prompt-input.json"
npx shadcn@latest add "https://prompt-kit.com/c/prompt-suggestion.json"
```
- Note: May not need if building custom with our design system

---

## 📝 M1 Phase 2: Core Components (3 hours)

### 1. Apple Prompt Input (1 hour)

**Create:** `src/components/ai/apple-prompt-input.tsx`

**Specifications:**
```tsx
// Key Features:
- Large textarea (min-height: 140px)
- Breathing animation on hover
- Inter font, 16px
- Border: mist → lucid-blue on focus
- Background: porcelain/50 with backdrop-blur
- Character counter (bottom-right)
- Submit on Enter, newline on Shift+Enter
- Voice input button (mobile, placeholder)

// Spacing (8pt grid):
- Padding: px-6 py-5 (24px × 20px)
- Border radius: rounded-xl (12px)
- Border width: 2px

// States:
- Default: border-mist, bg-porcelain/50
- Hover: scale-102, shadow-md
- Focus: border-lucid-blue, ring-2
- Disabled: opacity-50
```

**Implementation:**
- [ ] Create component file
- [ ] Add textarea with auto-resize
- [ ] Implement breathing animation
- [ ] Add character counter
- [ ] Handle Enter/Shift+Enter
- [ ] Add voice button (placeholder)
- [ ] Test responsiveness

---

### 2. Suggestion Chips (30 min)

**Create:** `src/components/ai/suggestion-chips.tsx`

**Example Prompts:**
```tsx
const suggestions = [
  "Customer support agent that answers from our docs",
  "Weekly revenue digest sent every Monday", 
  "Slack alerts for new payments",
  "Auto-tag and categorize incoming emails",
  "Daily standup summary from Slack"
]
```

**Specifications:**
```tsx
// Chip Design:
- Padding: px-4 py-2 (16px × 8px)
- Border: 1px mist
- Rounded: full
- Hover: border-lucid-blue, scale-102
- Click: populate prompt input

// Layout:
- Horizontal scroll on mobile
- Wrap on desktop
- Gap: 8px between chips
```

**Implementation:**
- [ ] Create component
- [ ] Map suggestion array
- [ ] Wire up click handler
- [ ] Add hover animations
- [ ] Test on mobile/desktop

---

### 3. Story View Component (1.5 hours)

**Create:** `src/components/ai/story-view.tsx`

**Specifications:**
```tsx
// Structure:
- Accept FlowSpec as prop
- Parse to When/If/Do steps
- Render step cards
- Show confidence meter at top
- "Load to Canvas" button
- "Reveal Structure" button

// Step Card Design:
- Icon circle (32×32px)
- Title + description
- Breathing on hover
- Tappable for edit mode
- Border: mist → lucid-blue on hover
- Shadow: sm → md on hover
```

**Components Needed:**
- [ ] StoryView (main container)
- [ ] StoryStepCard (individual step)
- [ ] StoryHeader (confidence + actions)

**Implementation:**
- [ ] Create parser utility
- [ ] Build StoryStepCard component
- [ ] Build StoryView container
- [ ] Add confidence meter placeholder
- [ ] Wire up Load to Canvas
- [ ] Test with sample FlowSpec

---

## 🔧 M1 Phase 3: Logic & Integration (2 hours)

### 1. FlowSpec Parser

**Create:** `src/lib/ai/flowspec-parser.ts`

**Functions:**
```tsx
export function parseFlowSpecToStory(flowSpec: FlowSpec): StoryStep[] {
  // Convert FlowSpec to narrative steps
}

export function formatTrigger(trigger: Node): string {
  // "When a customer sends an email..."
}

export function formatCondition(condition: Node): string {
  // "If the message contains 'refund'..."
}

export function formatAction(action: Node): string {
  // "Do send to support team Slack channel"
}
```

**Implementation:**
- [ ] Create parser file
- [ ] Implement trigger formatting
- [ ] Implement condition formatting
- [ ] Implement action formatting
- [ ] Add icon mapping
- [ ] Test with real FlowSpecs

---

### 2. Streaming Hook

**Create:** `src/hooks/use-ai-workflow-streaming.ts`

**Wraps:** Vercel AI SDK `useChat`

**Features:**
```tsx
export function useAIWorkflowStreaming() {
  const { messages, isLoading, append } = useChat()
  
  // Custom logic:
  - Parse FlowSpec from AI response
  - Handle streaming updates
  - Show progress (generating trigger... conditions... actions...)
  - Return structured data
}
```

**Implementation:**
- [ ] Create hook file
- [ ] Wrap useChat
- [ ] Add FlowSpec parsing
- [ ] Add progress tracking
- [ ] Test streaming

---

### 3. AI Dialog Integration

**Update:** `src/components/workflow/ai-workflow-dialog.tsx`

**Changes:**
```tsx
// Replace template cards with:
- ApplePromptInput
- SuggestionChips
- StoryView (when flowspec ready)

// Add view states:
- 'prompt' - Show input + suggestions
- 'generating' - Show loading with progress
- 'story' - Show Story View
- 'error' - Show error message

// Add transitions:
- Framer Motion AnimatePresence
- Morph between views (240ms)
```

**Implementation:**
- [ ] Update dialog structure
- [ ] Add view state management
- [ ] Integrate ApplePromptInput
- [ ] Add SuggestionChips
- [ ] Integrate StoryView
- [ ] Add view transitions
- [ ] Test complete flow

---

## 🎨 M1 Phase 4: Polish (2 hours)

### Design Token Application
- [ ] Verify all components use 8pt spacing
- [ ] Verify Inter font applied
- [ ] Verify color tokens used
- [ ] Verify motion timing correct

### Animations
- [ ] Breathing animations (120ms)
- [ ] Fade transitions (200ms)
- [ ] Morph transitions (240ms)
- [ ] Stagger effects (50ms delay)

### Accessibility
- [ ] Keyboard navigation works
- [ ] Focus states visible
- [ ] Screen reader friendly
- [ ] Reduced motion support

### Testing
- [ ] Mobile responsiveness
- [ ] Cross-browser compatibility
- [ ] Performance (60fps animations)
- [ ] Error handling

---

## 🚀 M1 Phase 5: Integration Test (1 hour)

### End-to-End Flow
1. [ ] Open AI dialog
2. [ ] Type custom prompt
3. [ ] Click suggestion chip
4. [ ] Submit prompt
5. [ ] See streaming response
6. [ ] View Story
7. [ ] Load to canvas
8. [ ] Verify workflow works

### Edge Cases
- [ ] Empty prompt
- [ ] Very long prompt
- [ ] Network error
- [ ] Invalid response
- [ ] Rapid submissions

---

## 📊 M1 Success Criteria

**Must Have:**
- [ ] Prompt input feels Apple-polished
- [ ] Suggestions populate instantly
- [ ] Story View renders correctly
- [ ] Streaming works smoothly
- [ ] Load to canvas functional

**Performance:**
- [ ] Interactions < 100ms
- [ ] Streaming lag < 200ms
- [ ] Animations smooth 60fps

**Accessibility:**
- [ ] WCAG AA compliant
- [ ] Keyboard navigable
- [ ] Screen reader tested

---

## 📁 Files to Create/Modify

### New Files (6):
1. `src/components/ai/apple-prompt-input.tsx`
2. `src/components/ai/suggestion-chips.tsx`
3. `src/components/ai/story-view.tsx`
4. `src/components/ai/story-step-card.tsx`
5. `src/lib/ai/flowspec-parser.ts`
6. `src/hooks/use-ai-workflow-streaming.ts`

### Modified Files (2):
1. `src/components/workflow/ai-workflow-dialog.tsx`
2. `src/app/api/ai/generate-workflow/route.ts`

### Documentation (1):
1. `docs/M1_IMPLEMENTATION_COMPLETE.md`

---

## 🎯 Quick Start Checklist

**Ready to begin M1 implementation:**

- [x] M0 foundation complete ✅
- [x] Design tokens available ✅
- [x] Animation system ready ✅
- [x] Magic UI working ✅
- [ ] Install AI SDK
- [ ] Create ApplePromptInput
- [ ] Build StoryView
- [ ] Integrate & test

**Let's go! 🚀**
