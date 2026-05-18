# Apple Design System for Lucid Flows
## Design Tokens, Components & Motion Library

**Date:** October 20, 2025  
**Purpose:** Complete design specification for Apple-inspired UI  
**Status:** Reference for implementation

---

## 🎨 Philosophy

### Design Principles

**1. Calm Over Complexity**
- Generous whitespace (8pt grid)
- Subtle depth (soft shadows)
- Clear hierarchy (typography scale)
- Breathing interactions (not static)

**2. Human Warmth**
- Approachable copy
- Confident micro-affirmations
- Gentle error messages
- Reassuring feedback

**3. Trust Without Friction**
- Instant responses (<100ms target)
- Transparent operations
- Optional proofs (never block UX)
- Progressive disclosure

---

## 📐 Typography

### Font Families

**Sans Serif (Primary)**
```css
--font-sans: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

**Monospace (Code/Data)**
```css
--font-mono: 'JetBrains Mono', 'SF Mono', 'Courier New', monospace;
```

### Type Scale

```css
/* Sizes */
--text-xs: 12px;     /* 0.75rem - Captions, labels */
--text-sm: 14px;     /* 0.875rem - Body small, UI text */
--text-base: 16px;   /* 1rem - Body, default */
--text-lg: 20px;     /* 1.25rem - Subheadings */
--text-xl: 24px;     /* 1.5rem - Headings */
--text-2xl: 34px;    /* 2.125rem - Page titles */
```

### Font Weights

```css
--font-regular: 400;    /* Body text */
--font-medium: 500;     /* UI elements, labels */
--font-semibold: 600;   /* Emphasis, buttons */
--font-bold: 700;       /* Strong emphasis, headings */
```

### Line Heights

```css
--leading-tight: 1.2;      /* Headings */
--leading-normal: 1.35;    /* Default */
--leading-relaxed: 1.5;    /* Comfortable reading */
```

### Usage Examples

```tsx
// Page Title
<h1 className="text-2xl font-bold leading-tight">
  Create Your Automation
</h1>

// Section Heading
<h2 className="text-xl font-semibold leading-tight">
  Your Automation Plan
</h2>

// Body Text
<p className="text-base font-regular leading-normal text-graphite-600">
  Describe what you want to automate...
</p>

// UI Label
<label className="text-sm font-medium text-ink-900">
  Workflow Name
</label>

// Caption
<span className="text-xs text-graphite-400">
  {characterCount}/500
</span>
```

---

## 📏 Spacing System

### 8pt Grid

**Base unit: 8px**

```css
--space-0: 0;
--space-1: 4px;      /* 0.25rem - Half unit, for fine-tuning */
--space-2: 8px;      /* 0.5rem - 1 unit */
--space-3: 12px;     /* 0.75rem - 1.5 units */
--space-4: 16px;     /* 1rem - 2 units */
--space-5: 20px;     /* 1.25rem - 2.5 units */
--space-6: 24px;     /* 1.5rem - 3 units */
--space-8: 32px;     /* 2rem - 4 units */
--space-10: 40px;    /* 2.5rem - 5 units */
--space-12: 48px;    /* 3rem - 6 units */
--space-16: 64px;    /* 4rem - 8 units */
--space-20: 80px;    /* 5rem - 10 units */
```

### Application Guidelines

**Component Padding**
- Small buttons: `px-4 py-2` (16px × 8px)
- Large buttons: `px-6 py-3` (24px × 12px)
- Cards: `p-4` or `p-6` (16px or 24px)
- Dialogs: `p-6` (24px)

**Margins & Gaps**
- Between related items: `gap-2` (8px)
- Between sections: `gap-4` (16px)
- Between groups: `gap-6` (24px)
- Page margins: `px-6` or `px-8` (24px or 32px)

**Exceptions (2px for borders/rings)**
- Border width: `border-2` (2px)
- Focus rings: `ring-2` (2px)

---

## 🎨 Color System

### Neutral Palette

```css
/* Backgrounds */
--porcelain: #F7F8FA;      /* Light background */
--white: #FFFFFF;           /* Cards, dialogs */

/* Borders & Dividers */
--mist: #ECEEF2;            /* Subtle borders */
--mist-dark: #D1D5DB;       /* Visible borders */

/* Text */
--graphite-400: #9CA3AF;    /* Muted text, placeholders */
--graphite-600: #5E6673;    /* Secondary text */
--ink-900: #14191F;         /* Primary text */
```

### Accent Colors

```css
/* Primary */
--lucid-blue: #0B84F3;      /* Actions, links, focus states */

/* AI Features */
--lucid-purple: #8B5CF6;    /* AI-related elements */

/* Secondary Accent */
--lucid-blue-light: #3B82F6;
```

### Semantic Colors

```css
/* Success */
--success: #2AB673;
--success-light: #D1FAE5;

/* Warning */
--warning: #F5B84B;
--warning-light: #FEF3C7;

/* Danger/Error */
--danger: #E05252;
--danger-light: #FEE2E2;

/* Info */
--info: #3B82F6;
--info-light: #DBEAFE;
```

### Usage Guidelines

**Text on Backgrounds**
```tsx
// Primary text
<p className="text-ink-900">Main content</p>

// Secondary text
<p className="text-graphite-600">Supporting text</p>

// Muted text
<p className="text-graphite-400">Captions, placeholders</p>

// On colored backgrounds
<p className="text-white">Text on lucid-blue</p>
```

**Interactive Elements**
```tsx
// Default state
<button className="bg-lucid-blue text-white">

// Hover state
<button className="hover:bg-lucid-blue/90">

// Focus state
<button className="focus:ring-2 focus:ring-lucid-blue">

// Disabled state
<button className="disabled:bg-graphite-400 disabled:text-graphite-600">
```

**Semantic Usage**
```tsx
// Success message
<div className="bg-success-light border-success text-success">

// Error message
<div className="bg-danger-light border-danger text-danger">

// Warning
<div className="bg-warning-light border-warning text-warning">
```

---

## 🌗 Depth & Shadows

### Shadow Scale

```css
/* Subtle depth (cards at rest) */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);

/* Cards on hover, dropdowns */
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);

/* Popovers, menus, tooltips */
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);

/* Modals, dialogs */
--shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.15);

/* Hero elements */
--shadow-2xl: 0 25px 50px rgba(0, 0, 0, 0.25);
```

### Usage Examples

```tsx
// Card at rest
<div className="shadow-sm">

// Card on hover
<div className="shadow-sm hover:shadow-md transition-shadow">

// Dropdown menu
<div className="shadow-lg">

// Modal dialog
<div className="shadow-xl">
```

### Focus Rings

```css
/* Default focus ring */
--ring: 0 0 0 2px var(--lucid-blue);

/* High contrast mode */
--ring-high-contrast: 0 0 0 3px var(--lucid-blue);

/* Offset */
--ring-offset: 2px;
```

**Usage:**
```tsx
<button className="
  focus-visible:outline-none
  focus-visible:ring-2
  focus-visible:ring-lucid-blue
  focus-visible:ring-offset-2
">
```

---

## ⚡ Motion System

### Timing

```css
/* Tap feedback, micro-interactions */
--duration-instant: 120ms;

/* Content reveals, fades */
--duration-reveal: 200ms;

/* View transitions, morphs */
--duration-morph: 240ms;

/* Slow emphasis, complex animations */
--duration-slow: 400ms;
```

### Easing Functions

```css
/* Apple-style cubic bezier (default) */
--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);

/* For entrances */
--ease-in: cubic-bezier(0.4, 0, 1, 1);

/* For exits */
--ease-exit: cubic-bezier(0, 0, 0.2, 1);

/* Elastic (playful emphasis) */
--ease-elastic: cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

### Animation Patterns

**Breathing (Hover)**
```css
@keyframes breathe {
  0%, 100% { 
    transform: scale(1); 
  }
  50% { 
    transform: scale(1.02); 
  }
}

.breathe-on-hover:hover {
  animation: breathe 2s ease-in-out infinite;
}
```

**Fade In**
```css
@keyframes fadeIn {
  from { 
    opacity: 0; 
  }
  to { 
    opacity: 1; 
  }
}

.fade-in {
  animation: fadeIn 200ms var(--ease-out);
}
```

**Slide Up**
```css
@keyframes slideUp {
  from { 
    opacity: 0;
    transform: translateY(8px);
  }
  to { 
    opacity: 1;
    transform: translateY(0);
  }
}

.slide-up {
  animation: slideUp 200ms var(--ease-out);
}
```

**Sparkle (Proof Arrival)**
```css
@keyframes sparkle {
  0%, 100% { 
    opacity: 0;
    transform: scale(0.5);
  }
  50% { 
    opacity: 1;
    transform: scale(1);
  }
}

.sparkle {
  animation: sparkle 1s ease-in-out;
}
```

**Pulse (Loading)**
```css
@keyframes pulse {
  0%, 100% { 
    opacity: 1; 
  }
  50% { 
    opacity: 0.5; 
  }
}

.pulse {
  animation: pulse 2s ease-in-out infinite;
}
```

### Framer Motion Variants

```typescript
// src/lib/design/motion.ts

export const motionVariants = {
  // Breathing hover effect
  breathe: {
    initial: { scale: 1 },
    whileHover: { 
      scale: 1.02,
      transition: { duration: 0.12, ease: [0.2, 0.8, 0.2, 1] }
    }
  },
  
  // Fade in/out
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 }
  },
  
  // Slide up entrance
  slideUp: {
    initial: { opacity: 0, y: 8 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }
    }
  },
  
  // Morph transition
  morph: {
    transition: { 
      duration: 0.24, 
      ease: [0.2, 0.8, 0.2, 1] 
    }
  },
  
  // Stagger children
  stagger: {
    animate: {
      transition: {
        staggerChildren: 0.05
      }
    }
  }
};
```

**Usage:**
```tsx
import { motion } from 'framer-motion';
import { motionVariants } from '@/lib/design/motion';

<motion.div {...motionVariants.breathe}>
  <Card />
</motion.div>

<motion.div {...motionVariants.slideUp}>
  <Content />
</motion.div>
```

---

## 🧩 Component Patterns

### Hero Prompt Input

```tsx
<div className="relative">
  <textarea
    className="
      min-h-[140px] w-full
      rounded-xl
      border-2 border-mist
      focus:border-lucid-blue
      bg-porcelain/50 backdrop-blur-sm
      px-6 py-5
      text-base font-regular leading-relaxed
      placeholder:text-graphite-400
      resize-none outline-none
      transition-all duration-200
      hover:shadow-sm
    "
    placeholder="Describe what you want to automate..."
  />
  
  {/* Character counter */}
  <div className="absolute bottom-4 right-4 text-xs text-graphite-400">
    {count}/500
  </div>
</div>
```

### Story Step Card

```tsx
<motion.div
  whileHover={{ scale: 1.02 }}
  transition={{ duration: 0.12, ease: [0.2, 0.8, 0.2, 1] }}
  className="
    p-4 rounded-lg
    bg-white border border-mist
    hover:border-lucid-blue
    hover:shadow-sm
    transition-all duration-120
    cursor-pointer
  "
>
  <div className="flex items-start gap-3">
    {/* Icon circle */}
    <div className="
      w-8 h-8 rounded-full
      bg-lucid-blue/10
      flex items-center justify-center
      flex-shrink-0
    ">
      <CheckIcon className="w-4 h-4 text-lucid-blue" />
    </div>
    
    {/* Content */}
    <div className="flex-1 min-w-0">
      <h4 className="text-sm font-medium text-ink-900 mb-1">
        When: New Stripe Payment
      </h4>
      <p className="text-sm text-graphite-600 leading-relaxed">
        Trigger on successful payment events
      </p>
    </div>
  </div>
</motion.div>
```

### Confidence Meter

```tsx
<div className="flex items-center gap-3 p-3 bg-porcelain rounded-lg">
  {/* Progress ring SVG */}
  <svg className="w-10 h-10" viewBox="0 0 36 36">
    {/* Background circle */}
    <circle
      cx="18" cy="18" r="16"
      fill="none"
      stroke="#ECEEF2"
      strokeWidth="3"
    />
    
    {/* Progress circle */}
    <circle
      cx="18" cy="18" r="16"
      fill="none"
      stroke="#2AB673"
      strokeWidth="3"
      strokeDasharray="100"
      strokeDashoffset={100 - percentage}
      strokeLinecap="round"
      className="transition-all duration-400"
      style={{ transformOrigin: '50% 50%', transform: 'rotate(-90deg)' }}
    />
  </svg>
  
  {/* Label */}
  <div>
    <div className="text-sm font-medium text-ink-900">
      Ready to run
    </div>
    <div className="text-xs text-graphite-600">
      95% confidence
    </div>
  </div>
</div>
```

### Proof Sparkle

```tsx
<div className="relative">
  {/* Content */}
  <div className="p-4">...</div>
  
  {/* Sparkle indicator */}
  {showProof && (
    <div className="
      absolute top-2 right-2
      w-2 h-2 rounded-full
      bg-lucid-purple
      animate-sparkle
      pointer-events-none
    " />
  )}
</div>

{/* CSS */}
<style jsx>{`
  @keyframes sparkle {
    0%, 100% { 
      opacity: 0;
      transform: scale(0.5);
    }
    50% { 
      opacity: 1;
      transform: scale(1);
    }
  }
  
  .animate-sparkle {
    animation: sparkle 1s ease-in-out;
  }
`}</style>
```

### Suggestion Chip

```tsx
<button className="
  px-4 py-2
  rounded-full
  bg-white border border-mist
  hover:border-lucid-blue
  hover:shadow-sm
  text-sm font-medium text-graphite-600
  hover:text-lucid-blue
  transition-all duration-120
  whitespace-nowrap
">
  Customer support agent
</button>
```

### Button Variants

```tsx
// Primary
<button className="
  px-6 py-3
  rounded-lg
  bg-lucid-blue text-white
  hover:bg-lucid-blue/90
  active:scale-[0.98]
  disabled:bg-graphite-400 disabled:text-graphite-600
  font-medium text-base
  transition-all duration-120
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lucid-blue
">
  Generate Workflow
</button>

// Secondary
<button className="
  px-6 py-3
  rounded-lg
  bg-white border-2 border-mist
  text-ink-900
  hover:border-lucid-blue hover:text-lucid-blue
  active:scale-[0.98]
  font-medium text-base
  transition-all duration-120
">
  Cancel
</button>

// Ghost
<button className="
  px-4 py-2
  rounded-lg
  text-graphite-600
  hover:bg-mist hover:text-ink-900
  active:scale-[0.98]
  font-medium text-sm
  transition-all duration-120
">
  Reveal Structure →
</button>
```

---

## 📱 Responsive Breakpoints

```css
/* Tailwind defaults */
--screen-sm: 640px;    /* Mobile landscape, small tablets */
--screen-md: 768px;    /* Tablet portrait */
--screen-lg: 1024px;   /* Desktop, laptop */
--screen-xl: 1280px;   /* Large desktop */
--screen-2xl: 1536px;  /* Extra large screens */
```

### Usage

```tsx
<div className="
  px-4 sm:px-6 md:px-8
  text-sm sm:text-base md:text-lg
  grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3
">
```

---

## ♿ Accessibility

### Focus Management

**Visible Focus States**
```tsx
<button className="
  focus-visible:outline-none
  focus-visible:ring-2
  focus-visible:ring-lucid-blue
  focus-visible:ring-offset-2
">
```

**Skip Links**
```tsx
<a href="#main-content" className="
  sr-only
  focus:not-sr-only
  focus:absolute focus:top-4 focus:left-4
  focus:z-50
  focus:px-4 focus:py-2
  focus:bg-white focus:text-ink-900
  focus:shadow-lg focus:rounded
">
  Skip to main content
</a>
```

### Screen Readers

**ARIA Labels**
```tsx
<button aria-label="Generate workflow from prompt">
  <Sparkles />
</button>

<div role="status" aria-live="polite">
  Generating workflow...
</div>

<nav aria-label="Main navigation">
```

**Semantic HTML**
```tsx
// Use proper heading hierarchy
<h1>Page Title</h1>
<h2>Section Title</h2>
<h3>Subsection</h3>

// Use semantic elements
<main>
<nav>
<article>
<aside>
```

### Motion Sensitivity

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**React Usage:**
```tsx
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

<motion.div
  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
>
```

### Color Contrast

**WCAG AA Standards (Minimum)**
- Normal text: 4.5:1
- Large text (18pt+): 3:1
- UI components: 3:1

**Current Palette Compliance:**
- ✅ ink-900 on white: 16:1
- ✅ graphite-600 on white: 7:1
- ✅ lucid-blue on white: 4.5:1
- ⚠️ graphite-400 on white: 3.2:1 (use for large text only)

---

## 🎯 Design Tokens Export

### TypeScript Tokens

```typescript
// src/lib/design/tokens.ts

export const tokens = {
  // Spacing (8pt grid)
  space: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
    16: 64,
    20: 80,
  },
  
  // Typography
  font: {
    family: {
      sans: 'Inter, system-ui, sans-serif',
      mono: 'JetBrains Mono, monospace',
    },
    size: {
      xs: 12,
      sm: 14,
      base: 16,
      lg: 20,
      xl: 24,
      '2xl': 34,
    },
    weight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.35,
      relaxed: 1.5,
    },
  },
  
  // Colors
  color: {
    neutral: {
      porcelain: '#F7F8FA',
      white: '#FFFFFF',
      mist: '#ECEEF2',
      'mist-dark': '#D1D5DB',
      'graphite-400': '#9CA3AF',
      'graphite-600': '#5E6673',
      'ink-900': '#14191F',
    },
    accent: {
      lucid: '#0B84F3',
      purple: '#8B5CF6',
      'lucid-light': '#3B82F6',
    },
    semantic: {
      success: '#2AB673',
      'success-light': '#D1FAE5',
      warning: '#F5B84B',
      'warning-light': '#FEF3C7',
      danger: '#E05252',
      'danger-light': '#FEE2E2',
      info: '#3B82F6',
      'info-light': '#DBEAFE',
    },
  },
  
  // Shadows
  shadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px rgba(0, 0, 0, 0.07)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.15)',
    '2xl': '0 25px 50px rgba(0, 0, 0, 0.25)',
  },
  
  // Motion
  motion: {
    duration: {
      instant: 120,
      reveal: 200,
      morph: 240,
      slow: 400,
    },
    easing: {
      out: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      in: 'cubic-bezier(0.4, 0, 1, 1)',
      exit: 'cubic-bezier(0, 0, 0.2, 1)',
      elastic: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    },
  },
  
  // Border Radius
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
};

export type Tokens = typeof tokens;
```

### Tailwind Configuration

```javascript
// tailwind.config.js

module.exports = {
  theme: {
    extend: {
      colors: {
        porcelain: '#F7F8FA',
        mist: '#ECEEF2',
        graphite: {
          400: '#9CA3AF',
          600: '#5E6673',
        },
        ink: {
          900: '#14191F',
        },
        lucid: {
          DEFAULT: '#0B84F3',
          purple: '#8B5CF6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      spacing: {
        // 8pt grid
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
        12: '48px',
        16: '64px',
        20: '80px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
        md: '0 4px 6px rgba(0, 0, 0, 0.07)',
        lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
        xl: '0 20px 25px rgba(0, 0, 0, 0.15)',
      },
      transitionDuration: {
        120: '120ms',
        200: '200ms',
        240: '240ms',
        400: '400ms',
      },
      transitionTimingFunction: {
        'apple': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
};
```

---

## 📚 Usage Examples

### Complete Story Step Card

```tsx
import { motion } from 'framer-motion';
import { Check, Plus } from 'lucide-react';
import { tokens } from '@/lib/design/tokens';

function StoryStepCard({ step, onEdit }: StoryStepCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.12, ease: [0.2, 0.8, 0.2, 1] }}
      className="
        p-4 rounded-lg
        bg-white border border-mist
        hover:border-lucid hover:shadow-sm
        transition-all duration-120
        cursor-pointer
      "
      onClick={() => onEdit(step)}
    >
      <div className="flex items-start gap-3">
        <div className="
          w-8 h-8 rounded-full
          bg-lucid/10
          flex items-center justify-center
          flex-shrink-0
        ">
          <Check className="w-4 h-4 text-lucid" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-ink-900 mb-1">
            {step.type}: {step.title}
          </h4>
          <p className="text-sm text-graphite-600 leading-relaxed">
            {step.description}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
```

### Complete Prompt Input

```tsx
import { Mic } from 'lucide-react';

function ApplePromptInput({ value, onChange, onSubmit }: Props) {
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Describe what you want to automate..."
        className="
          min-h-[140px] w-full
          rounded-xl
          border-2 border-mist
          focus:border-lucid
          bg-porcelain/50 backdrop-blur-sm
          px-6 py-5
          text-base font-regular leading-relaxed
          placeholder:text-graphite-400
          resize-none outline-none
          transition-all duration-200
          hover:shadow-sm
        "
      />
      
      <div className="absolute bottom-4 right-4 text-xs text-graphite-400">
        {value.length}/500
      </div>
      
      <button
        className="
          absolute bottom-4 left-4
          md:hidden
          w-8 h-8
