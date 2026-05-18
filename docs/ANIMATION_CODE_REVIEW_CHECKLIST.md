# Animation Code Review Checklist
## Ensuring Animation Standards in New Code

**Purpose:** Guide code reviews to maintain animation quality and performance  
**Applies to:** All new components, features, and animation changes  
**Reference:** ANIMATION_STRATEGY.md

---

## Quick Checklist

Use this during code reviews:

### ✅ Design Tokens
- [ ] Uses design token durations (120ms, 200ms, 240ms)
- [ ] No hardcoded millisecond values
- [ ] Imports from `@/lib/design/tokens` or uses Tailwind classes

### ✅ Transition Type
- [ ] Specifies transition property type (colors, opacity, transform, etc.)
- [ ] No generic `transition` without type
- [ ] Uses appropriate duration for transition type

### ✅ Library Choice
- [ ] Simple effects use CSS (tailwindcss-animate)
- [ ] Complex effects use Framer Motion (with justification)
- [ ] Pre-built effects use Magic UI (when appropriate)

### ✅ Performance
- [ ] Animates only transform and opacity when possible
- [ ] Avoids animating layout properties (width, height, top, left)
- [ ] Uses `will-change` sparingly and correctly
- [ ] No animation on initial page load (unless intentional)

### ✅ Accessibility
- [ ] Respects `prefers-reduced-motion`
- [ ] Animations don't block interaction
- [ ] Focus states remain visible during animation
- [ ] Screen reader experience not impacted

---

## Detailed Review Guide

### 1. Duration Standards ✅

**Check:** Are durations using design tokens?

#### ✅ Good Examples:
```tsx
// Using Tailwind classes
className="transition-colors duration-120"

// Using design tokens directly
import { tokens } from '@/lib/design/tokens'
style={{ transitionDuration: `${tokens.motion.duration.instant}ms` }}

// Using motion library
import { motion } from '@/lib/design/motion'
<motion.div {...motion.fadeIn}>
```

#### ❌ Bad Examples:
```tsx
// Hardcoded milliseconds
style={{ transition: '0.3s' }}

// Random duration
className="transition duration-150"

// No duration specified
className="transition"
```

**Fix:** Replace with appropriate design token:
- 120ms (instant) - hover, tap, toggle
- 200ms (reveal) - fade, slide, appear
- 240ms (morph) - page transitions, view changes

---

### 2. Transition Property ✅

**Check:** Is the transition property specified?

#### ✅ Good Examples:
```tsx
// Specific property
className="transition-colors duration-120"
className="transition-opacity duration-200"
className="transition-transform duration-120"

// Multiple specific properties
className="transition-[color,opacity] duration-120"
```

#### ❌ Bad Examples:
```tsx
// Generic transition (animates everything)
className="transition duration-200"

// No property specified
className="hover:bg-primary transition"
```

**Why it matters:**
- Performance: Only animate what changes
- Predictability: Know exactly what will animate
- Debugging: Easier to track animation issues

**Fix:** Specify the property that changes:
- `transition-colors` - background, text, border colors
- `transition-opacity` - fades
- `transition-transform` - scale, rotate, translate
- `transition-shadow` - shadow changes

---

### 3. Library Choice ✅

**Check:** Is the right library being used?

#### Decision Tree:

```
Is it a simple hover/tap effect?
├─ YES → Use CSS (duration-120)
└─ NO ↓

Does it need sequencing/orchestration?
├─ YES → Use Framer Motion
└─ NO ↓

Is it a pre-built effect (particles, text-reveal)?
├─ YES → Use Magic UI
└─ NO → Use CSS or Framer Motion
```

#### ✅ Good Examples:

**CSS (70% of cases):**
```tsx
// Button hover
<button className="hover:bg-primary-600 transition-colors duration-120">

// Fade in
<div className="animate-in fade-in duration-200">

// Slide up
<div className="animate-in slide-in-from-bottom duration-200">
```

**Framer Motion (20% of cases):**
```tsx
// Complex sequence
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ 
    duration: tokens.motion.duration.reveal / 1000,
    delay: 0.1 
  }}
>

// Layout animation
<motion.div layout>
  {items.map(item => <Item key={item.id} />)}
</motion.div>

// Gesture handling
<motion.div
  drag
  dragConstraints={{ left: -100, right: 100 }}
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
>
```

**Magic UI (10% of cases):**
```tsx
// Pre-built effects
import { TextReveal } from '@/components/magicui/text-reveal'
import { Particles } from '@/components/magicui/particles'

<TextReveal>Welcome</TextReveal>
<Particles className="absolute inset-0" />
```

#### ❌ Bad Examples:

```tsx
// Using Framer Motion for simple hover
<motion.button
  whileHover={{ backgroundColor: '#000' }}
  transition={{ duration: 0.2 }}
> // Should use: hover:bg-black transition-colors duration-120

// Using CSS for complex sequence
// Multiple useEffects and setTimeout calls
// Should use: Framer Motion variants

// Hardcoding effects that exist in Magic UI
// Custom particle implementation
// Should use: Magic UI particles component
```

---

### 4. Performance ✅

**Check:** Are animations performant?

#### ✅ Good - Composite Properties:
```tsx
// Transform (GPU-accelerated)
className="hover:scale-105 transition-transform duration-120"

// Opacity (GPU-accelerated)
className="hover:opacity-80 transition-opacity duration-120"
```

#### ⚠️ Caution - Layout Properties:
```tsx
// These trigger layout recalculation
className="hover:w-full transition-all" // ❌ width
className="hover:h-20 transition-all"  // ❌ height
className="hover:p-4 transition-all"   // ❌ padding

// Better alternatives:
<motion.div animate={{ width: '100%' }} layout> // Use Framer Motion layout
className="hover:scale-105" // Or use scale instead
```

#### ❌ Bad - Performance Killers:
```tsx
// Animating everything
className="transition-all duration-200" // Animates ALL properties!

// Multiple simultaneous animations
className="animate-pulse animate-bounce" // Too many at once

// Large/complex elements
<div className="animate-bounce"> // Don't animate heavy elements
  <ComplexChart data={largeDataset} />
</div>
```

**Performance Checklist:**
- [ ] Animates only `transform` and `opacity` when possible
- [ ] Avoids `transition-all` unless necessary
- [ ] No more than 2-3 elements animating simultaneously
- [ ] Heavy elements (charts, images) don't animate
- [ ] Uses `will-change` appropriately (if needed)

---

### 5. Accessibility ✅

**Check:** Are animations accessible?

#### Required: Reduced Motion
```tsx
// ✅ Good - Respects preference
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ 
    duration: tokens.motion.duration.reveal / 1000,
    // Framer Motion respects prefers-reduced-motion automatically
  }}
/>

// ✅ Good - CSS with media query
<div className="motion-reduce:transition-none transition-transform duration-120">

// ❌ Bad - Ignores preference
<div className="animate-bounce"> // Can't be disabled
```

#### Focus Management:
```tsx
// ✅ Good - Focus visible during animation
<button className="focus:ring-2 transition-colors duration-120">

// ❌ Bad - Focus hidden during animation
<button className="focus:outline-none transition-all">
```

#### Non-blocking:
```tsx
// ✅ Good - Doesn't block interaction
<button disabled={isLoading} className="transition-opacity duration-120">

// ❌ Bad - Blocks interaction
<button className="animate-pulse pointer-events-none"> // Can't be clicked!
```

**Accessibility Checklist:**
- [ ] Uses `motion-reduce:` variants for CSS animations
- [ ] Framer Motion animations auto-respect reduced motion
- [ ] Focus states remain visible
- [ ] Animations don't prevent interaction
- [ ] Loading states handled separately from animations

---

## Common Patterns Review

### Button Hover ✅
```tsx
// ✅ Perfect
<Button className="hover:bg-primary-600 transition-colors duration-120">

// ❌ Over-engineered
<motion.button whileHover={{ scale: 1.05 }}>
```

### Card Hover ✅
```tsx
// ✅ Good
<Card className="hover:shadow-lg transition-shadow duration-200">

// ⚠️ Acceptable (if multiple properties)
<Card className="hover:shadow-lg hover:scale-105 transition-all duration-200">
```

### Modal Enter/Exit ✅
```tsx
// ✅ Good
<Dialog className="animate-in fade-in duration-200">

// ✅ Also good (complex)
<AnimatePresence>
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    transition={{ duration: tokens.motion.duration.reveal / 1000 }}
  />
</AnimatePresence>
```

### List Items ✅
```tsx
// ✅ Good - Stagger with Framer Motion
<motion.ul>
  {items.map((item, i) => (
    <motion.li
      key={item.id}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: i * 0.05 }}
    />
  ))}
</motion.ul>

// ❌ Bad - All at once
<ul className="animate-in slide-in-from-left">
  {items.map(item => <li key={item.id} />)}
</ul>
```

---

## Anti-Patterns to Reject ❌

### 1. Transition Soup
```tsx
❌ className="transition hover:scale-110 duration-300 ease-in-out"
✅ className="hover:scale-110 transition-transform duration-120"
```

### 2. Hardcoded Values
```tsx
❌ style={{ transition: '0.3s ease' }}
✅ className="transition-colors duration-240"
```

### 3. Over-Animation
```tsx
❌ className="animate-pulse animate-bounce animate-spin"
✅ Pick ONE animation that fits the use case
```

### 4. Layout Thrashing
```tsx
❌ className="hover:w-full hover:h-full transition-all"
✅ Use <motion.div layout> or scale instead
```

### 5. Missing Type
```tsx
❌ className="transition duration-200"
✅ className="transition-colors duration-200"
```

---

## Review Comments Templates

Use these in PR reviews:

### Missing Duration
```
⚠️ Missing explicit duration
Current: `transition-colors`
Suggested: `transition-colors duration-120`
Reference: ANIMATION_STRATEGY.md
```

### Wrong Library
```
❌ Over-engineered
This simple hover doesn't need Framer Motion.
Suggested: Use CSS `hover:bg-primary transition-colors duration-120`
```

### Performance Issue
```
⚠️ Performance concern
Animating layout properties (width/height) triggers reflow.
Suggested: Use `scale` transform or Framer Motion `layout`
```

### Accessibility Missing
```
❌ Accessibility issue
Animation doesn't respect `prefers-reduced-motion`.
Suggested: Add `motion-reduce:transition-none` variant
```

---

## Quick Reference Card

Print this or keep handy during reviews:

```
┌─────────────────────────────────────────────┐
│  ANIMATION CODE REVIEW QUICK CARD           │
├─────────────────────────────────────────────┤
│                                             │
│  Durations:                                 │
│    120ms → hover, tap, toggle              │
│    200ms → fade, slide, appear             │
│    240ms → page transitions                │
│                                             │
│  Must Specify:                              │
│    ✓ transition-[property]                 │
│    ✓ duration-[n]                          │
│    ✗ generic "transition"                  │
│                                             │
│  Library Choice:                            │
│    CSS      → Simple (70%)                 │
│    Framer   → Complex (20%)                │
│    Magic UI → Pre-built (10%)              │
│                                             │
│  Performance:                               │
│    ✓ transform, opacity                    │
│    ✗ width, height, layout                 │
│                                             │
│  Accessibility:                             │
│    ✓ motion-reduce: variants               │
│    ✓ Focus visible                         │
│    ✗ Blocking interaction                  │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Approval Criteria

**Code with animations can be approved when:**

1. ✅ Uses design token durations (120, 200, 240)
2. ✅ Specifies transition property type
3. ✅ Chooses appropriate library
4. ✅ Animates performant properties
5. ✅ Respects reduced motion preference
6. ✅ Doesn't block user interaction
7. ✅ Follows patterns in ANIMATION_STRATEGY.md

**Reject if:**
- ❌ Hardcoded duration values
- ❌ Generic `transition` without type
- ❌ Over-engineered (Framer Motion for simple hover)
- ❌ Animates layout properties without justification
- ❌ Missing accessibility considerations

---

## Getting Help

**Questions about:**
- Design tokens → `src/lib/design/tokens.ts`
- Motion patterns → `src/lib/design/motion.ts`
- Strategy decisions → `docs/ANIMATION_STRATEGY.md`
- Library choice → `docs/ANIMATION_STRATEGY.md#library-roles`
- Magic UI → `docs/MAGIC_UI_INSTALLATION.md`

**Still unsure?** Ask in PR comments and tag animation experts.

---

**Last Updated:** October 2025  
**Maintainer:** Engineering Team  
**Related:** ANIMATION_STRATEGY.md, M0_FOUNDATION_COMPLETE.md
