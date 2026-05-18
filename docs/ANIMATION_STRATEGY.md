# Animation Strategy - Lucid Flows
## Industry Standard Guide for Animation Library Usage

**Last Updated:** October 20, 2025  
**Status:** Production Standard  
**Purpose:** Clear guidelines on which animation library to use for each use case

---

## 🎯 Four-Library Hybrid Approach

We use a **best-of-breed** approach with four complementary animation libraries:

| Library | Use Case | Bundle Impact | Performance |
|---------|----------|---------------|-------------|
| **tailwindcss-animate** | Simple CSS animations (60%) | ~3KB | Excellent (CSS only) |
| **Animate UI** | Animated Radix components (15%) | ~20KB | Excellent (Motion-based) |
| **Framer Motion** | Complex JS animations (15%) | ~35KB → 20KB (Motion) | Excellent (60fps) |
| **Magic UI** | Special effects (10%) | ~25KB | Excellent (Motion-based) |

**Total Bundle:** ~68KB for complete animation system  
**Note:** Framer Motion replaced by Motion library (~20KB) used by both Animate UI and Magic UI

### Why Four Libraries?

**tailwindcss-animate (60%):** Core CSS animations  
**Animate UI (15%):** Enhanced Radix primitives (Dialog, Sheet, Dropdown, etc.)  
**Framer Motion (15%):** Custom complex animations  
**Magic UI (10%):** Special effects (typing, shine-border, particles)

**Installed Components:**
- ✅ Magic UI: typing-animation, shine-border, animated-list
- ✅ Animate UI: Dialog, Sheet, Dropdown Menu, Tooltip, Popover

---

## 📚 Library Decision Tree

### Use **tailwindcss-animate** when:
- ✅ Simple state transitions (hover, focus, active)
- ✅ Fade in/out effects
- ✅ Slide in/out (up/down/left/right)
- ✅ Scale transformations
- ✅ Spin/pulse effects
- ✅ Reduced motion support needed
- ✅ Performance is critical (CSS only, no JS)

**Examples:**
```tsx
// Button hover
<button className="hover:scale-105 transition-120 ease-apple">
  Dry Run
</button>

// Fade in content
<div className="animate-in fade-in duration-200">
  Content here
</div>

// Slide up modal
<Dialog className="animate-in slide-in-from-bottom-4 duration-240">
  Modal content
</Dialog>
```

---

### Use **Framer Motion** when:
- ✅ Complex layout animations
- ✅ Gesture-based interactions (drag, swipe)
- ✅ Sequence orchestration
- ✅ Morphing between states
- ✅ Custom spring physics
- ✅ Scroll-driven animations
- ✅ Shared element transitions

**Examples:**
```tsx
import { motion } from 'framer-motion';
import { motionVariants } from '@/lib/design/motion';

// Story ↔ Structure morph
<motion.div
  layout
  transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
>
  {mode === 'story' ? <StoryView /> : <StructureView />}
</motion.div>

// Drag and drop
<motion.div
  drag
  dragConstraints={{ left: 0, right: 300 }}
  whileDrag={{ scale: 1.05 }}
>
  Draggable node
</motion.div>

// Using preset variants
<motion.div {...motionVariants.fadeSlideUp}>
  <Card />
</motion.div>
```

---

### Use **Magic UI** when:
- ✅ Sparkle effects (proof receipts)
- ✅ Animated lists with stagger
- ✅ Morphing text
- ✅ Particle effects
- ✅ Pre-built complex animations
- ✅ Time-saving ready-made components

**Installation (per component):**
```bash
# Sparkles (for proof receipts)
npx shadcn@latest add "https://magicui.design/r/sparkles"

# Animated List (for Story View)
npx shadcn@latest add "https://magicui.design/r/animated-list"

# Morphing Text (for status changes)
npx shadcn@latest add "https://magicui.design/r/morphing-text"
```

**Examples:**
```tsx
import Sparkles from '@/components/magicui/sparkles';
import AnimatedList from '@/components/magicui/animated-list';

// Proof receipt indicator
<Sparkles>
  <Badge>Receipt saved</Badge>
</Sparkles>

// Story steps with stagger
<AnimatedList
  items={storySteps}
  delay={50}
/>
```

---

## 🎨 Component-Level Guidelines

### Buttons & Interactive Elements
**Use:** tailwindcss-animate
```tsx
<button className="hover:scale-102 active:scale-98 transition-120">
  Button
</button>
```

### Modals & Dialogs
**Use:** tailwindcss-animate for simple, Framer Motion for complex
```tsx
// Simple modal
<Dialog className="animate-in fade-in slide-in-from-bottom-4">

// Complex modal with backdrop
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
>
  <Dialog />
</motion.div>
```

### Cards & Containers
**Use:** tailwindcss-animate for hover, Framer Motion for interactions
```tsx
// Simple hover
<div className="hover:shadow-lg transition-200">

// Interactive drag
<motion.div drag dragConstraints={ref}>
```

### Lists & Grids
**Use:** Magic UI for animated lists, tailwindcss-animate for items
```tsx
// Animated list container
<AnimatedList items={items} />

// Individual item hover
<div className="hover:bg-mist transition-120">
```

### View Transitions
**Use:** Framer Motion
```tsx
<motion.div
  key={mode}
  initial={{ opacity: 0, x: 20 }}
  animate={{ opacity: 1, x: 0 }}
  exit={{ opacity: 0, x: -20 }}
>
```

---

## 📋 Complete Animation Inventory

### tailwindcss-animate Classes

**Entrance Animations:**
- `animate-in` - Base entrance
- `fade-in` - Fade in
- `slide-in-from-top-{n}` - Slide from top
- `slide-in-from-bottom-{n}` - Slide from bottom
- `slide-in-from-left-{n}` - Slide from left
- `slide-in-from-right-{n}` - Slide from right
- `zoom-in` - Scale up
- `spin-in` - Rotate in

**Exit Animations:**
- `animate-out` - Base exit
- `fade-out` - Fade out
- `slide-out-to-top-{n}` - Slide to top
- `slide-out-to-bottom-{n}` - Slide to bottom
- `slide-out-to-left-{n}` - Slide to left
- `slide-out-to-right-{n}` - Slide to right
- `zoom-out` - Scale down

**Duration Modifiers:**
- `duration-120` - 120ms (instant)
- `duration-200` - 200ms (reveal)
- `duration-240` - 240ms (morph)
- `duration-400` - 400ms (slow)

**Easing:**
- `ease-apple` - Apple-style cubic-bezier(0.2, 0.8, 0.2, 1)

### Framer Motion Presets (from motion.ts)

**Available in `motionVariants`:**
- `breathe` - Hover scale 1.02
- `fade` - Fade in/out
- `slideUp` - Slide up + fade
- `morph` - View transitions
- `stagger` - List stagger
- `sparkle` - Receipt animation
- `tap` - Tap feedback
- `breatheAndTap` - Combined hover + tap
- `fadeSlideUp` - Combined fade + slide

**Transition Presets:**
- `transitions.instant` - 120ms
- `transitions.reveal` - 200ms
- `transitions.morph` - 240ms
- `transitions.slow` - 400ms

### Magic UI Components (to install as needed)

**Available Components:**
- Sparkles - Sparkle effects
- AnimatedList - Staggered list animations
- MorphingText - Text morphing
- Particles - Particle effects
- ShimmerButton - Shimmer effect
- BorderBeam - Animated border
- BlurIn - Blur entrance
- TypingAnimation - Typewriter effect

---

## 🎯 Lucid Flows Specific Usage

### Prompt Mode
```tsx
// Prompt Bar
<input className="focus:ring-2 focus:ring-lucid transition-120" />

// Suggestion Chips
<button className="hover:bg-m
