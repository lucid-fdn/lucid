# Workflow Theme System
**Industry-Standard Design System with CSS Variables**

## 🎨 Overview

Our theme system follows **industry-standard best practices**:

- ✅ **CSS Variables at Root Level** (`src/styles/themes/workflow.css`)
- ✅ **Not Tailwind-dependent** - Works with any CSS framework
- ✅ **One-Click Theme Changes** - Modify CSS variables, not code
- ✅ **Dark Mode Support** - Automatic dark mode overrides
- ✅ **Type-Safe** - Tailwind integration for autocomplete

---

## 📁 File Structure

```
src/
├── styles/
│   └── themes/
│       └── workflow.css          # 🎯 THEME DEFINITION (Root level)
├── app/
│   └── globals.css                # Imports theme
└── tailwind.config.js             # Optional Tailwind integration
```

---

## 🎯 How It Works

### 1. Theme Defined at Root (`src/styles/themes/workflow.css`)

```css
:root {
  /* Status colors */
  --workflow-status-success: 34 197 94;
  --workflow-status-error: 239 68 68;
  
  /* Node colors */
  --workflow-node-trigger-hex: #10b981;
  --workflow-node-action-hex: #3b82f6;
  
  /* Spacing */
  --workflow-sidebar-palette: 16rem;
  
  /* Timings */
  --workflow-autosave-delay: 3000;
}
```

### 2. Imported in Global CSS

```css
/* src/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@import '../styles/themes/workflow.css';
```

### 3. Used in Components

Two ways to use:

**Option A: Pure CSS Classes**
```tsx
<div className="workflow-status-success-bg workflow-status-success-text">
  Success!
</div>
```

**Option B: Tailwind (if using Tailwind)**
```tsx
<div className="bg-workflow-status-success text-workflow-status-success">
  Success!
</div>
```

---

## 🔧 One-Click Theme Modifications

### Example 1: Change All Success Colors

**File:** `src/styles/themes/workflow.css`

```css
/* Change from green to emerald */
:root {
  --workflow-status-success: 16 185 129;  /* Changed */
  --workflow-status-success-bg: 236 253 245;  /* Changed */
}
```

**Result:** All success indicators app-wide update instantly!

- ✅ Node status indicators
- ✅ Execution history
- ✅ Toast notifications
- ✅ All success states

**No code changes needed!**

---

### Example 2: Change Node Colors

```css
:root {
  /* Rebrand trigger nodes from green to purple */
  --workflow-node-trigger-hex: #9333ea;  /* purple-600 */
  --workflow-node-trigger-rgb: 147, 51, 234;
}
```

**Result:** All trigger nodes turn purple everywhere!

---

### Example 3: Change Spacing

```css
:root {
  /* Make sidebars wider */
  --workflow-sidebar-palette: 20rem;  /* was 16rem */
  --workflow-sidebar-config: 28rem;   /* was 24rem */
}
```

**Result:** All sidebars resize!

---

### Example 4: Change Timings

```css
:root {
  /* Slower autosave */
  --workflow-autosave-delay: 5000;  /* was 3000 */
  
  /* Faster node execution animation */
  --workflow-node-execution-delay: 300;  /* was 500 */
}
```

**Result:** All timings update!

---

## 🌙 Dark Mode

Dark mode is handled automatically in the CSS file:

```css
/* src/styles/themes/workflow.css */
.dark {
  --workflow-status-success-bg: 20 83 45;  /* darker green */
  --workflow-status-error-bg: 127 29 29;   /* darker red */
}
```

When user switches to dark mode, colors update automatically!

---

## 🎨 Available Theme Variables

### Status Colors

```css
--workflow-status-waiting
--workflow-status-waiting-bg
--workflow-status-waiting-border

--workflow-status-running
--workflow-status-running-bg
--workflow-status-running-border

--workflow-status-success
--workflow-status-success-bg
--workflow-status-success-border

--workflow-status-error
--workflow-status-error-bg
--workflow-status-error-border
```

### Node Colors

```css
--workflow-node-trigger-hex: #10b981
--workflow-node-action-hex: #3b82f6
--workflow-node-condition-hex: #f59e0b
--workflow-node-transform-hex: #8b5cf6
```

### UI Spacing

```css
--workflow-sidebar-palette: 16rem
--workflow-sidebar-config: 24rem
--workflow-history-width: 34rem
```

### Animation Timings

```css
--workflow-autosave-delay: 3000
--workflow-node-execution-delay: 500
--workflow-animation-duration: 200ms
--workflow-transition-duration: 300ms
```

### Limits

```css
--workflow-max-history-items: 20
--workflow-max-history-display: 10
```

---

## 💡 Best Practices

### ✅ DO

```css
/* Modify CSS variables in one place */
:root {
  --workflow-status-success: 16 185 129;
}
```

### ❌ DON'T

```tsx
/* Hard-code colors in components */
const color = '#10b981';  // Bad!
```

---

## 🔄 Migration from Tailwind-Only

### Before (Tailwind-dependent)

```tsx
// Tailwind classes hard-coded
<div className="text-green-500 bg-green-50">
  Success
</div>
```

**Problems:**
- ❌ Can't change without modifying code
- ❌ No central theme management
- ❌ Hard to maintain consistency

### After (CSS Variables)

```tsx
// Uses theme variables
<div className="workflow-status-success-text workflow-status-success-bg">
  Success
</div>

// Or with Tailwind integration
<div className="text-workflow-status-success bg-workflow-status-success">
  Success
</div>
```

**Benefits:**
- ✅ Change theme without touching code
- ✅ Central theme management
- ✅ Easy to maintain
- ✅ Works with or without Tailwind

---

## 🚀 Creating Custom Themes

### Example: Create "Ocean" Theme

```css
/* src/styles/themes/workflow-ocean.css */
:root {
  /* Ocean color palette */
  --workflow-status-success: 6 182 212;      /* cyan */
  --workflow-status-error: 251 146 60;       /* orange */
  --workflow-node-trigger-hex: #0891b2;      /* cyan-600 */
  --workflow-node-action-hex: #0284c7;       /* sky-600 */
  --workflow-node-condition-hex: #7c3aed;    /* violet-600 */
  --workflow-node-transform-hex: #db2777;    /* pink-600 */
}
```

Then import:

```css
/* src/app/globals.css */
/* @import '../styles/themes/workflow.css'; */
@import '../styles/themes/workflow-ocean.css';
```

**Entire app rebranded!** 🎉

---

## 📊 Comparison: Industry Standards

### Our Approach ✅

```
Theme → CSS Variables (Root)
Components → Use Variables
Change → Edit CSS File
```

**Used by:**
- Material-UI
- Ant Design
- Chakra UI
- shadcn/ui
- Every major design system

### Bad Approach ❌

```
Theme → Hard-coded in Components
Components → Duplicate Values
Change → Edit Every Component
```

---

## 🎯 Summary

### What We Built

1. **CSS Variables at Root** - Industry standard ✅
2. **Framework Agnostic** - Not tied to Tailwind ✅
3. **One-Click Changes** - Edit CSS, not code ✅
4. **Dark Mode** - Automatic support ✅
5. **Type-Safe** - Tailwind integration optional ✅

### How to Modify Theme

1. **Open:** `src/styles/themes/workflow.css`
2. **Edit:** CSS variables
3. **Save:** Changes apply instantly
4. **Done:** No code changes needed

### Files to Remember

- **Theme Definition:** `src/styles/themes/workflow.css` ← Edit here!
- **Global Import:** `src/app/globals.css`
- **Tailwind Config:** `tailwind.config.js` (optional)

---

## 🎓 This is Industry Standard

✅ **Not Tailwind-dependent**
✅ **CSS Variables at root level**
✅ **One file to change theme**
✅ **Works with any framework**
✅ **Used by all major design systems**

**This is how professional applications are themed!** 🚀
