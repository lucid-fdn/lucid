/**
 * Design Tokens - Lucid Flows
 * Apple-inspired design system with 8pt grid
 * 
 * Usage:
 * import { tokens } from '@/lib/design/tokens';
 * const spacing = tokens.space[4]; // 16px
 */

export const tokens = {
  // Spacing (8pt grid)
  space: {
    0: 0,
    1: 4,      // 0.25rem - Half unit for fine-tuning
    2: 8,      // 0.5rem - 1 unit
    3: 12,     // 0.75rem - 1.5 units
    4: 16,     // 1rem - 2 units
    5: 20,     // 1.25rem - 2.5 units
    6: 24,     // 1.5rem - 3 units
    8: 32,     // 2rem - 4 units
    10: 40,    // 2.5rem - 5 units
    12: 48,    // 3rem - 6 units
    16: 64,    // 4rem - 8 units
    20: 80,    // 5rem - 10 units
  },
  
  // Typography
  font: {
    family: {
      sans: 'Inter, system-ui, -apple-system, sans-serif',
      mono: 'JetBrains Mono, monospace',
    },
    size: {
      xs: 12,    // 0.75rem - Captions, labels
      sm: 14,    // 0.875rem - Body small, UI text
      base: 16,  // 1rem - Body, default
      lg: 20,    // 1.25rem - Subheadings
      xl: 24,    // 1.5rem - Headings
      '2xl': 34, // 2.125rem - Page titles
    },
    weight: {
      regular: 400,    // Body text
      medium: 500,     // UI elements, labels
      semibold: 600,   // Emphasis, buttons
      bold: 700,       // Strong emphasis, headings
    },
    lineHeight: {
      tight: 1.2,      // Headings
      normal: 1.35,    // Default
      relaxed: 1.5,    // Comfortable reading
    },
  },
  
  // Colors
  color: {
    neutral: {
      porcelain: '#F7F8FA',      // Light background
      white: '#FFFFFF',           // Cards, dialogs
      mist: '#ECEEF2',            // Subtle borders
      'mist-dark': '#D1D5DB',     // Visible borders
      'graphite-400': '#9CA3AF',  // Muted text, placeholders
      'graphite-600': '#5E6673',  // Secondary text
      'ink-900': '#14191F',       // Primary text
    },
    accent: {
      lucid: '#0B84F3',           // Primary actions, focus, links
      purple: '#8B5CF6',          // AI features
      'lucid-light': '#3B82F6',   // Hover states
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
  
  // Shadows (depth)
  shadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',     // Subtle depth
    md: '0 4px 6px rgba(0, 0, 0, 0.07)',     // Cards on hover
    lg: '0 10px 15px rgba(0, 0, 0, 0.1)',    // Popovers, menus
    xl: '0 20px 25px rgba(0, 0, 0, 0.15)',   // Modals, dialogs
    '2xl': '0 25px 50px rgba(0, 0, 0, 0.25)', // Hero elements
  },
  
  // Motion
  motion: {
    duration: {
      instant: 120,   // Tap feedback, micro-interactions
      reveal: 200,    // Content reveals, fades
      morph: 240,     // View transitions, morphs
      slow: 400,      // Slow emphasis, complex animations
    },
    easing: {
      out: 'cubic-bezier(0.2, 0.8, 0.2, 1)',      // Apple-style (default)
      in: 'cubic-bezier(0.4, 0, 1, 1)',           // For entrances
      exit: 'cubic-bezier(0, 0, 0.2, 1)',         // For exits
      elastic: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)', // Playful emphasis
    },
  },
  
  // Border Radius
  radius: {
    sm: 4,      // Small elements
    md: 8,      // Buttons, inputs
    lg: 12,     // Cards, containers
    xl: 16,     // Dialogs, large cards
    full: 9999, // Pills, circular
  },
} as const;

export type Tokens = typeof tokens;

// Helper types for TypeScript autocomplete
export type SpaceKey = keyof typeof tokens.space;
export type FontSizeKey = keyof typeof tokens.font.size;
export type ColorKey = keyof typeof tokens.color.neutral | keyof typeof tokens.color.accent | keyof typeof tokens.color.semantic;
