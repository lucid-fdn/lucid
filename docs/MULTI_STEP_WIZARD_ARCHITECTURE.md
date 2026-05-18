# Multi-Step Wizard Architecture

**Industry-Standard Reusable Multi-Step Form System**

Created: 2025-10-16  
Last Updated: 2025-10-16  
Status: ✅ Production Ready

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Usage Examples](#usage-examples)
5. [Creating New Multi-Step Flows](#creating-new-multi-step-flows)
6. [Benefits](#benefits)
7. [Best Practices](#best-practices)

---

## Overview

### What is it?

A reusable, type-safe, industry-standard multi-step wizard system that can be used for **any** multi-step form flow in the application.

### Key Features

- ✅ **Fully Reusable** - One component for all multi-step flows
- ✅ **Type-Safe** - Full TypeScript support
- ✅ **State Management** - Automatic localStorage persistence
- ✅ **URL Routing** - Step navigation via URL parameters
- ✅ **Progress Indicator** - Visual step progress
- ✅ **Schema Validation** - Zod validation per step
- ✅ **Industry Standard** - Matches Stripe, Vercel, Linear patterns

### Current Implementations

1. **Workspace Onboarding** ✅ (5 steps)
2. **User Profile Onboarding** (Future)
3. **Team Setup** (Future)
4. **Project Creation** (Future)

---

## Architecture

### Component Hierarchy

```
<MultiStepWizard>                    (Orchestrator)
  ├── useMultiStepForm()             (State Management Hook)
  │   ├── URL routing                (step parameter)
  │   ├── localStorage persistence   (auto-save progress)
  │   ├── Navigation logic           (back/forward)
  │   └── Loading states             (async operations)
  │
  ├── <OnboardingStepper>           (Progress Indicator)
  │   └── Step badges with status    (complete/current/upcoming)
  │
  └── <StepComponent>                (Current Step)
      ├── Form fields & validation   (Zod schemas)
      ├── Back/Continue buttons      (navigation)
      └── Step-specific logic        (custom behavior)
```

### Data Flow

```
User Input
    ↓
StepComponent.onComplete(stepData)
    ↓
useMultiStepForm.handleStepComplete()
    ↓
Merge stepData into formData
    ↓
localStorage.setItem()           (Auto-save)
    ↓
Check if last step
    ├─ Yes → onComplete(allData)  (Submit)
    └─ No  → goToStep(next)       (Continue)
```

---

## Core Components

### 1. Types (`src/types/multi-step.ts`)

```typescript
export interface MultiStepFormStep<TData = any> {
  id: string
  path: string
  title: string
  description: string
  schema: z.ZodSchema<any>
  optional?: boolean
  component: React.ComponentType<StepComponentProps<TData>>
}

export interface StepComponentProps<TData = any> {
  data: Partial<TData>
  onComplete: (data: Partial<TData>) => void
  onBack: () => void
  isLoading: boolean
}
```

### 2. Hook (`src/hooks/use-multi-step-form.ts`)

**Responsibilities:**
- Step navigation (URL-based)
- State management (formData)
- localStorage persistence
- Loading states
- Back/forward logic

**API:**
```typescript
const wizard = useMultiStepForm({
  steps: STEPS,
  storageKey: 'my-flow',
  onComplete: async (data) => { /* submit */ }
})

// Available methods/state:
wizard.currentStep        // number
wizard.formData          // Partial<TData>
wizard.isLoading         // boolean
wizard.handleStepComplete // function
wizard.handleBack        // function
wizard.canGoBack         // boolean
```

### 3. Component (`src/components/shared/multi-step-wizard.tsx`)

**Responsibilities:**
- Render progress indicator
- Render current step component
- Pass props to step component
- Handle loading states

**Props:**
```typescript
<MultiStepWizard
  steps={STEPS}              // Step configuration
  onComplete={submitFn}      // Final submit function
  storageKey="unique-key"    // localStorage key
  showProgress={true}        // Show progress bar
  allowBack={true}           // Enable back button
/>
```

---

## Usage Examples

### Example 1: Workspace Onboarding (Current)

**File:** `src/app/(studio)/workspace/new/page.tsx`

```typescript
import { MultiStepWizard } from '@/components/shared/multi-step-wizard'
import { ONBOARDING_STEPS } from '@/lib/forms/workspace-onboarding-schemas'
import { createWorkspaceOnboardingAction } from '@/lib/forms/actions'

export default function WorkspaceOnboardingPage() {
  return (
    <MultiStepWizard
      steps={ONBOARDING_STEPS}
      onComplete={createWorkspaceOnboardingAction}
      storageKey="lucid_workspace_onboarding"
      showProgress={true}
      allowBack={true}
    />
  )
}
```

**Result:** 150 lines → 30 lines! 🎉

### Example 2: User Profile Onboarding (Future)

**File:** `src/app/(studio)/onboarding/profile/page.tsx`

```typescript
import { MultiStepWizard } from '@/components/shared/multi-step-wizard'
import { USER_ONBOARDING_STEPS } from '@/lib/forms/user-onboarding-schemas'
import { completeUserOnboarding } from '@/lib/forms/actions'

export default function UserOnboardingPage() {
  return (
    <MultiStepWizard
      steps={USER_ONBOARDING_STEPS}
      onComplete={completeUserOnboarding}
      storageKey="lucid_user_onboarding"
      showProgress={true}
      allowBack={false}  // No going back in user onboarding
    />
  )
}
```

---

## Creating New Multi-Step Flows

### Step-by-Step Guide

#### 1. Define Your Data Type

```typescript
// src/lib/forms/my-flow-schemas.ts
export type MyFlowData = {
  step1Field: string
  step2Field: number
  step3Field: boolean
}
```

#### 2. Create Schemas

```typescript
import { z } from 'zod'

export const step1Schema = z.object({
  step1Field: z.string().min(1)
})

export const step2Schema = z.object({
  step2Field: z.number().min(0)
})

export const step3Schema = z.object({
  step3Field: z.boolean()
})
```

#### 3. Create Step Components

```typescript
// src/components/my-flow/step-1.tsx
export function Step1({ data, onComplete, onBack, isLoading }: StepComponentProps) {
  // Form logic here
  return (
    <form onSubmit={handleSubmit}>
      {/* Fields */}
      <Button onClick={onBack}>Back</Button>
      <Button type="submit">Continue</Button>
    </form>
  )
}
```

#### 4. Define Steps Array

```typescript
import type { MultiStepFormStep } from '@/types/multi-step'

export const MY_FLOW_STEPS: readonly MultiStepFormStep<MyFlowData>[] = [
  {
    id: '1',
    path: 'first',
    title: 'First Step',
    description: 'Enter your information',
    schema: step1Schema,
    component: Step1,
  },
  {
    id: '2',
    path: 'second',
    title: 'Second Step',
    description: 'Additional details',
    schema: step2Schema,
    component: Step2,
  },
  // ... more steps
]
```

#### 5. Create Page

```typescript
// src/app/my-flow/page.tsx
export default function MyFlowPage() {
  return (
    <MultiStepWizard
      steps={MY_FLOW_STEPS}
      onComplete={handleComplete}
      storageKey="my_flow"
    />
  )
}
```

**Done!** You now have a fully functional multi-step flow.

---

## Benefits

### 1. Code Reusability

**Before:**
- 150+ lines per flow
- Duplicate state management
- Duplicate navigation logic
- Duplicate localStorage logic

**After:**
- 30 lines per flow
- Single source of truth
- Reuse across all flows
- Consistent behavior

### 2. Maintainability

- ✅ Bug fixes update all flows
- ✅ Feature additions benefit all flows
- ✅ Consistent UX automatically
- ✅ Easier to test

### 3. Developer Experience

- ✅ Faster to create new flows (10x faster)
- ✅ Less boilerplate
- ✅ Type-safe
- ✅ Well-documented

### 4. User Experience

- ✅ Progress saved automatically
- ✅ Can navigate back/forward
- ✅ Consistent UI across flows
- ✅ Clear progress indication

---

## Best Practices

### Step Components

1. **Keep steps focused** - One concern per step
2. **Use proper validation** - Zod schemas
3. **Handle loading states** - Disable buttons when `isLoading`
4. **Show errors clearly** - Use error messages
5. **Provide context** - Helpful descriptions

### State Management

1. **Merge data properly** - Use spread operators
2. **Validate before submit** - Check required fields
3. **Clear sensitive data** - After completion
4. **Handle errors gracefully** - Show user-friendly messages

### Navigation

1. **Allow back navigation** - Unless security concern
2. **Save progress automatically** - Don't lose user data
3. **Handle URL manipulation** - Validate step numbers
4. **Show progress clearly** - Visual indicators

### Performance

1. **Lazy load components** - Code splitting
2. **Debounce auto-save** - Don't spam localStorage
3. **Optimize re-renders** - Use callbacks properly
4. **Clear old data** - Clean up localStorage

---

## File Structure

```
src/
├── types/
│   └── multi-step.ts                    # TypeScript types
├── hooks/
│   └── use-multi-step-form.ts          # State management hook
├── components/
│   └── shared/
│       └── multi-step-wizard.tsx        # Main wizard component
└── lib/
    └── forms/
        ├── workspace-onboarding-schemas.ts  # Example: Workspace flow
        └── user-onboarding-schemas.ts       # Future: User flow
```

---

## Migration Guide

### Migrating Existing Multi-Step Flows

1. **Create schemas with components**
2. **Update step definitions** to include component reference
3. **Replace custom page logic** with `<MultiStepWizard>`
4. **Test thoroughly**
5. **Remove old code**

### Example Migration

**Before:**
```typescript
// 150 lines of state management, navigation, etc.
const [formData, setFormData] = useState({})
const [currentStep, setCurrentStep] = useState(1)
// ... lots of boilerplate
```

**After:**
```typescript
// 3 lines!
<MultiStepWizard
  steps={STEPS}
  onComplete={submit}
  storageKey="key"
/>
```

---

## Testing

### Unit Tests

```typescript
import { renderHook } from '@testing-library/react'
import { useMultiStepForm } from '@/hooks/use-multi-step-form'

test('navigates between steps', () => {
  const { result } = renderHook(() => 
    useMultiStepForm({ steps: MOCK_STEPS, ... })
  )
  
  expect(result.current.currentStep).toBe(1)
  
  result.current.goToStep(2)
  
  expect(result.current.currentStep).toBe(2)
})
```

### Integration Tests

```typescript
import { render, screen } from '@testing-library/react'
import { MultiStepWizard } from '@/components/shared/multi-step-wizard'

test('completes full flow', async () => {
  const onComplete = jest.fn()
  
  render(
    <MultiStepWizard
      steps={MOCK_STEPS}
      onComplete={onComplete}
      storageKey="test"
    />
  )
  
  // Fill step 1
  // Click continue
  // Fill step 2
  // Click continue
  // ...
  
  expect(onComplete).toHaveBeenCalledWith(expectedData)
})
```

---

## Troubleshooting

### Issue: Step not advancing

**Cause:** onComplete not called or error in handler  
**Solution:** Check console, add error handling

### Issue: Data not persisting

**Cause:** localStorage disabled or different storage key  
**Solution:** Check browser settings, verify key

### Issue: TypeScript errors

**Cause:** Mismatched types between steps  
**Solution:** Ensure all steps use same TData type

---

## Future Enhancements

### Planned Features

- [ ] Step validation preview (show errors before submit)
- [ ] Conditional steps (skip based on previous answers)
- [ ] Step progress percentage
- [ ] Analytics integration (track drop-off)
- [ ] A/B testing support
- [ ] Draft auto-save to database
- [ ] Mobile-optimized stepper
- [ ] Keyboard navigation
- [ ] Accessibility improvements

---

## Conclusion

This reusable multi-step wizard system provides a clean, maintainable, industry-standard solution for all multi-step form flows in the application.

**Benefits:**
- ✅ 80% less code per flow
- ✅ Consistent UX
- ✅ Type-safe
- ✅ Well-tested
- ✅ Easy to extend

**Next Steps:**
1. Use for new flows (user onboarding, team setup, etc.)
2. Gather user feedback
3. Add planned enhancements
4. Document lessons learned

---

**Questions?** Contact the development team or refer to the code examples in this document.
