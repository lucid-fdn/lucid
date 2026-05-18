# Lucid Flows Implementation TODO
## Complete Checklist for Apple-Inspired Prompt-First Transformation

> **Archived historical checklist.** This plan is no longer the active source of truth for product implementation. The current product architecture is Agent Ops + Lucid Pack templates + Browser Operator + Mission Control + Knowledge/Memory. Use `docs/README.md`, `docs/platform/templates/README.md`, `docs/platform/agent-ops/overview.md`, and the generated quality-marathon reports for current work.

**Last Updated:** October 20, 2025  
**Status:** Not Started  
**Estimated Total Time:** 15 hours  

---

## 📋 Phase 0: Pre-Implementation (30 mins)

### Documentation Review
- [x] Review LUCID_FLOWS_TRANSFORMATION.md
- [x] Review APPLE_DESIGN_SYSTEM.md
- [x] Review WORKFLOW_UX_NAVIGATION_STRATEGY.md
- [ ] Understand current AI dialog implementation
- [ ] Review existing FlowSpec types

### Environment Check
- [ ] Verify Node.js version (18+)
- [ ] Verify npm/yarn available
- [ ] Check current dependencies in package.json
- [ ] Backup current working code
- [ ] Create feature branch: `feature/lucid-flows-transformation`

---

## 🔧 Phase 1: Foundation (2 hours)

### Dependencies Installation
- [ ] Install Vercel AI SDK
  ```bash
  npm install ai
  ```
- [ ] Install Prompt Kit components
  ```bash
  npx shadcn@latest add "https://prompt-kit.com/c/prompt-input.json"
  npx shadcn@latest add "https://prompt-kit.com/c/prompt-suggestion.json"
  npx shadcn@latest add "https://prompt-kit.com/c/message.json"
  npx shadcn@latest add "https://prompt-kit.com/c/steps.json"
  ```
- [ ] Install Framer Motion (if not present)
  ```bash
  npm install framer-motion
  ```
- [ ] Verify all dependencies installed successfully

### Bug Fixes
- [ ] Fix toast bug in `src/hooks/use-ai-workflow.ts` (line 51)
  - Change `toast.info()` to `toast({ title, description })`
- [ ] Fix toast bug in `src/hooks/use-ai-workflow.ts` (line 73)
  - Change `toast.success()` to `toast({ title, description })`
- [ ] Fix toast bug in `src/hooks/use-ai-workflow.ts` (line 83)
  - Change `toast.error()` to `toast({ title, description, variant: 'destructive' })`
- [ ] Test toast fixes work correctly

### Streaming Infrastructure
- [ ] Update `src/app/api/ai/generate-workflow/route.ts` for streaming
  - Import `streamText` from 'ai'
  - Implement streaming response
  - Add `onFinish` callback for FlowSpec generation
  - Return `result.toDataStreamResponse()`
- [ ] Create `src/hooks/use-ai-workflow-streaming.ts`
  - Import `useChat` from 'ai/react'
  - Wrap with workflow-specific logic
  - Parse FlowSpec from messages
  - Export streaming hook
- [ ] Test streaming API endpoint with curl
- [ ] Test streaming hook in browser console

### Phase 1 Validation
- [ ] All dependencies installed ✅
- [ ] Toast bug fixed and tested ✅
- [ ] Streaming API working ✅
- [ ] Streaming hook functional ✅

---

## 🎨 Phase 2: Prompt-First UI (3 hours)

### Design Tokens Setup
- [ ] Create `src/lib/design/tokens.ts`
  - Export spacing tokens (8pt grid)
  - Export typography tokens (Inter font)
  - Export color tokens (Porcelain, Mist, Lucid Blue)
  - Export shadow tokens
  - Export motion tokens (120/200/240ms)
- [ ] Create `src/lib/design/motion.ts`
  - Export Framer Motion variants
  - Export animation presets (breathe, fade, slide, sparkle)
  - Export timing functions

### Apple Prompt Input Component
- [ ] Create `src/components/ai/apple-prompt-input.tsx`
  - Large breathing textarea (min 140px)
  - 8pt spacing (px-6 py-5)
  - Inter font, porcelain background
  - Border animations (mist → lucid-blue on focus)
  - Character counter (bottom-right, subtle)
  - Voice input button (mobile only)
  - Submit on Enter, newline on Shift+Enter
  - Hover shadow effect
- [ ] Test component in isolation (Storybook or separate page)
- [ ] Verify responsive behavior (mobile, tablet, desktop)

### Suggestion Chips
- [ ] Define example prompts array
  - "Customer support agent that answers from our docs"
  - "Weekly revenue digest sent every Monday"
  - "Slack alerts for new payments"
- [ ] Integrate Prompt Kit `<PromptSuggestion>` component
- [ ] Wire up one-click populate functionality
- [ ] Style with Apple aesthetics (rounded, mist border, hover effects)
- [ ] Test click-to-populate behavior

### Basic Story View Component
- [ ] Create `src/components/ai/story-view.tsx`
  - Accept FlowSpec as prop
  - Parse FlowSpec to story steps
  - Use Prompt Kit `<Steps>` component
  - Render When/If/Do format
  - Add "Load to Canvas" button
  - Add "Reveal Structure" button
- [ ] Create `src/lib/ai/flowspec-parser.ts`
  - Parse trigger → "When" step
  - Parse conditions → "If" steps
  - Parse actions → "Do" steps
  - Format node types as readable text
  - Add descriptions for each step
- [ ] Test parser with sample FlowSpec
- [ ] Test Story View rendering

### AI Dialog Rebuild
- [ ] Update `src/components/workflow/ai-workflow-dialog.tsx`
  - Replace template cards with ApplePromptInput
  - Add suggestion chips below input
  - Wire up streaming hook
  - Switch between prompt/story views
  - Handle loading states
  - Handle error states
  - Add smooth view transitions
- [ ] Remove old template card logic
- [ ] Test complete flow: prompt → streaming → story view
- [ ] Test "Load to Canvas" integration

### Phase 2 Validation
- [ ] Hero prompt input works ✅
- [ ] Suggestion chips populate prompt ✅
- [ ] Story View renders correctly ✅
- [ ] Dialog transitions smoothly ✅
- [ ] Load to canvas functional ✅

---

## 💅 Phase 3: Apple Aesthetics (3 hours)

### Tailwind Configuration
- [ ] Update `tailwind.config.js` with custom tokens
  - Add porcelain, mist, graphite colors
  - Add lucid-blue accent
  - Add 8pt spacing values
  - Add custom shadows
  - Add custom transition durations (120/200/240/400ms)
  - Add 'apple' easing function
- [ ] Test Tailwind build compiles successfully

### Apply Design Tokens
- [ ] Update ApplePromptInput with exact spacing
  - `px-6 py-5` (24px × 20px)
  - `rounded-xl` (12px radius)
  - `border-2 border-mist`
  - `focus:border-lucid-blue`
  - `bg-porcelain/50 backdrop-blur-sm`
- [ ] Update Story View cards
  - `p-4` padding (16px)
  - `rounded-lg` (8px radius)
  - `bg-white border border-mist`
  - Icon circles: `w-8 h-8` (32px)
  - `hover:border-lucid-blue hover:shadow-sm`
- [ ] Update suggestion chips
  - `px-4 py-2` (16px × 8px)
  - `rounded-full`
  - `border border-mist`
  - `hover:border-lucid-blue`
- [ ] Update dialog
  - `max-w-3xl` (768px)
  - `p-6` padding (24px)
  - `shadow-xl`

### Motion & Animations
- [ ] Add breathing animation to prompt input
  - Subtle scale on hover (1.02)
  - 120ms duration
  - Apple easing
- [ ] Add breathing to story cards
  - Scale 1.02 on hover
  - 120ms duration
  - Smooth transition
- [ ] Add fade-in animation to story steps
  - Stagger children by 50ms
  - Slide up 8px + fade in
  - 200ms duration
- [ ] Add morph transition between views
  - Prompt → Story: 240ms
  - Story → Structure: 240ms
  - Use Framer Motion AnimatePresence

### Focus States & Accessibility
- [ ] Add focus rings to all interactive elements
  - `focus-visible:outline-none`
  - `focus-visible:ring-2 focus-visible:ring-lucid-blue`
  - `focus-visible:ring-offset-2`
- [ ] Test keyboard navigation
  - Tab through all inputs
  - Enter submits prompt
  - Escape closes dialog
- [ ] Test with screen reader
  - Proper ARIA labels
  - Live regions for status updates
- [ ] Add prefers-reduced-motion support
  - Disable animations if requested
  - Keep functionality, remove motion

### Phase 3 Validation
- [ ] All components use design tokens ✅
- [ ] 8pt spacing grid applied ✅
- [ ] Breathing animations working ✅
- [ ] Transitions smooth (240ms) ✅
- [ ] Focus states visible ✅
- [ ] Keyboard navigation works ✅

---

## 📝 Phase 4: Story View Logic (3 hours)

### Complete FlowSpec Parser
- [ ] Extend `src/lib/ai/flowspec-parser.ts`
  - Add `formatTrigger()` function
  - Add `formatCondition()` function
  - Add `formatAction()` function
  - Add `describeTrigger()` function
  - Add `describeCondition()` function
  - Add `describeAction()` function
  - Add icon mapping for each node type
  - Handle all FlowSpec node types
- [ ] Add unit tests for parser
  - Test trigger parsing
  - Test condition parsing
  - Test action parsing
  - Test edge cases (empty nodes, unknown types)
- [ ] Test parser with real FlowSpec from CrewAI

### Inline Editing
- [ ] Create `src/components/ai/story-step-card.tsx`
  - Tappable card that enters edit mode
  - Inline input for natural language edits
  - Save/Cancel buttons
  - Breathing animation on hover
  - Icon circle with step type
  - Title and description layout
- [ ] Implement edit handler
  - Send natural language edit to API
  - Update FlowSpec with new data
  - Re-render Story View
  - Sync with Structure View (if visible)
- [ ] Add loading state during edit
- [ ] Add error handling for failed edits
- [ ] Test editing various step types

### Add/Remove Steps
- [ ] Create `src/components/ai/add-step-button.tsx`
  - Floating "+" button between steps
  - Popover with prompt input
  - "What should happen next?" placeholder
  - Submit adds step at position
  - Smooth insertion animation
- [ ] Implement add step handler
  - Insert step in FlowSpec at index
  - Re-parse and re-render
  - Animate new step appearance
- [ ] Implement remove step handler
  - Delete confirmation
  - Remove from FlowSpec
  - Re-parse and re-render
  - Animate removal
- [ ] Test add/remove flow

### Validation & Suggestions
- [ ] Add step validation
  - Check required parameters present
  - Check connections valid
  - Check no circular dependencies
- [ ] Add inline suggestions
  - Missing parameter hints
  - Better alternative suggestions
  - Field mapping recommendations
- [ ] Show validation errors inline
  - Red border on invalid steps
  - Error message below step
  - Suggestion to fix

### Phase 4 Validation
- [ ] FlowSpec parser complete ✅
- [ ] Inline editing works ✅
- [ ] Add/remove steps functional ✅
- [ ] Validation showing correctly ✅
- [ ] Suggestions helpful ✅

---

## ✨ Phase 5: Unique Features (2 hours)

### Confidence Meter
- [ ] Create `src/components/ai/confidence-meter.tsx`
  - SVG progress ring (36×36px)
  - Background circle (#ECEEF2)
  - Progress circle (color based on status)
  - Percentage text
  - Status label ("Ready to run", "Needs review")
  - Issues popover (click to see details)
- [ ] Create `src/lib/ai/confidence-analyzer.ts`
  - Check all nodes have required params
  - Check auth configured
  - Check fields mapped
  - Check no circular deps
  - Check valid triggers
  - Calculate percentage (0-100)
  - Determine status (needs-review/ready/excellent)
  - List issues and suggestions
- [ ] Integrate into Story View
  - Show at top of story
  - Update on any edit
  - Animate percentage changes
- [ ] Test confidence calculation with various workflows

### Proof Sparkles
- [ ] Create `src/components/ai/proof-sparkles.tsx`
  - Tiny animated dot (2×2px)
  - Position top-right or bottom-right
  - Purple color (#8B5CF6)
  - Sparkle animation (1s)
  - Appears when proof lands
  - Tooltip: "Proof saved to LucidScan"
- [ ] Add CSS keyframes for sparkle
  - 0%: opacity 0, scale 0.5
  - 50%: opacity 1, scale 1
  - 100%: opacity 0, scale 0.5
- [ ] Wire up to Thought Epoch system
  - Show when proof enabled
  - Trigger on receipt arrival
  - Link to LucidScan (if available)
- [ ] Test sparkle animation

### Progressive Disclosure
- [ ] Create `src/components/ai/progressive-disclosure.tsx`
  - Manage view mode state (prompt/story/structure)
  - Smooth transitions between views
  - Breadcrumb-style mode switcher
  - Framer Motion AnimatePresence
- [ ] Implement view transitions
  - Prompt → Story: fade + slide up (200ms)
  - Story → Structure: morph (240ms)
  - Structure → Story: morph back (240ms)
  - Story → Prompt: fade + slide down (200ms)
- [ ] Add "Reveal Structure" button
  - Ghost button style
  - Arrow icon →
  - Smooth morph to canvas
- [ ] Add "Back to Story View" button (in structure)
  - Appears in structure view
  - Morphs back to story
- [ ] Test all view transitions

### Phase 5 Validation
- [ ] Confidence meter works ✅
- [ ] Proof sparkles animate ✅
- [ ] Progressive disclosure smooth ✅
- [ ] All transitions 240ms or less ✅

---

## 🎯 Phase 6: Polish & Testing (2 hours)

### Final Polish
- [ ] Review all spacing against 8pt grid
- [ ] Verify all colors match design system
- [ ] Check all typography uses Inter font
- [ ] Verify all animations use correct timing
- [ ] Test all hover states
- [ ] Test all focus states
- [ ] Test all loading states
- [ ] Test all error states

### Mobile Responsiveness
- [ ] Test on mobile (375px width)
  - Prompt input scales correctly
  - Suggestion chips wrap or scroll
  - Story View cards stack nicely
  - Voice input button visible
- [ ] Test on tablet (768px width)
  - Dialog size appropriate
  - Two-column layouts work
- [ ] Test on desktop (1280px width)
  - Max-width constraints applied
  - Spacing comfortable

### Accessibility Audit
- [ ] Run axe DevTools scan
- [ ] Fix any contrast issues
- [ ] Fix any ARIA issues
- [ ] Fix any keyboard navigation issues
- [ ] Test with VoiceOver (Mac) or NVDA (Windows)
- [ ] Verify all images have alt text
- [ ] Verify all buttons have labels
- [ ] Test prefers-reduced-motion works

### Performance
- [ ] Run Lighthouse audit
- [ ] Check bundle size increase acceptable
- [ ] Verify animations run at 60fps
- [ ] Check for memory leaks
- [ ] Test with slow 3G network
- [ ] Optimize images/assets if needed

### User Testing
- [ ] Test complete flow end-to-end
  - Open dialog
  - Type prompt
  - See story view
  - Edit a step
  - Add a step
  - Load to canvas
  - Verify canvas matches story
- [ ] Test edge cases
  - Empty prompt
  - Very long prompt
  - Invalid workflow
  - Network error during generation
  - Rapid clicking/typing
- [ ] Test with real CrewAI responses
- [ ] Get feedback from team

### Documentation Updates
- [ ] Update component documentation
- [ ] Add Storybook stories (if using)
- [ ] Document new props and types
- [ ] Update README if needed
- [ ] Add screenshots to docs

### Phase 6 Validation
- [ ] All polish complete ✅
- [ ] Mobile responsive ✅
- [ ] Accessibility compliant ✅
- [ ] Performance acceptable ✅
- [ ] User tested ✅

---

## 🚀 Phase 7: Deployment (30 mins)

### Pre-Deployment Checks
- [ ] All tests passing
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] No linter errors
- [ ] Bundle size acceptable
- [ ] Dependencies updated in package.json

### Deployment
- [ ] Merge feature branch to main
- [ ] Tag release (v1.0.0-lucid-flows)
- [ ] Deploy to staging
- [ ] Smoke test on staging
- [ ] Deploy to production
- [ ] Monitor for errors
- [ ] Verify metrics (loading time, success rate)

### Post-Deployment
- [ ] Announce to team
- [ ] Update changelog
- [ ] Monitor user feedback
- [ ] Track success metrics
  - Time to first workflow
  - Story View engagement
  - Edit-in-English usage
  - Confidence meter accuracy
  - Performance (p95 < 100ms)

---

## 📊 Success Metrics Tracking

### Target Metrics
- [ ] Time to first workflow: <2 minutes ✅
- [ ] Story View engagement: >70% ✅
- [ ] Edit-in-English usage: >50% ✅
- [ ] Performance: <100ms interactions ✅
- [ ] Confidence meter accuracy: >85% ✅

### Monitor Weekly
- [ ] Check analytics dashboard
- [ ] Review user feedback
- [ ] Identify pain points
- [ ] Plan improvements

---

## 🐛 Known Issues / Future Improvements

### Backlog
- [ ] Voice input implementation (mic button placeholder)
- [ ] Multi-language support
- [ ] Collaborative editing (presence cursors)
- [ ] Template marketplace integration
- [ ] Advanced confidence meter (ML-based)
- [ ] Undo/redo for story edits
- [ ] Workflow versioning
- [ ] Export story as markdown

### Tech Debt
- [ ] Add comprehensive unit tests
- [ ] Add integration tests
- [ ] Add E2E tests (Playwright)
- [ ] Optimize bundle size
- [ ] Add error boundaries
- [ ] Improve TypeScript coverage

---

## 📝 Notes

### Design Decisions
- Using Inter font (not SF Pro due to licensing)
- Using Prompt Kit for UI foundation (faster than custom)
- Using Vercel AI SDK for streaming (industry standard)
- Using Framer Motion for animations (best-in-class)

### Blockers
- None currently

### Questions
- None currently

---

**Total Progress: 0/154 tasks (0%)**

**Estimated Completion:** 15 hours (2-3 days at 5-8 hours/day)

**Last Updated:** October 20, 2025, 11:08 PM
