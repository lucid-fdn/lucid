import type { Config } from "tailwindcss";

export default {
  darkMode: 'class',
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Design System Colors
      colors: {
        // Custom white - slightly off-white for better contrast
        white: '#F8F9FA',  // Slightly warm off-white instead of pure #FFFFFF
        
        // Lucid Flows Design Tokens
        porcelain: '#F7F8FA',
        mist: '#ECEEF2',
        'mist-dark': '#D1D5DB',
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
          light: '#3B82F6',
        },
        
        // Legacy colors (keep for compatibility)
        'custom-orange': '#FF791B',
        
        // Workflow theme colors (from CSS variables)
        'workflow': {
          'status-waiting': 'rgb(var(--workflow-status-waiting) / <alpha-value>)',
          'status-running': 'rgb(var(--workflow-status-running) / <alpha-value>)',
          'status-success': 'rgb(var(--workflow-status-success) / <alpha-value>)',
          'status-error': 'rgb(var(--workflow-status-error) / <alpha-value>)',
          'node-trigger': 'var(--workflow-node-trigger-hex)',
          'node-action': 'var(--workflow-node-action-hex)',
          'node-condition': 'var(--workflow-node-condition-hex)',
          'node-transform': 'var(--workflow-node-transform-hex)',
          'pin-indicator': 'rgb(var(--workflow-pin-indicator) / <alpha-value>)',
        },
      },
      
      // Typography - Switzer (aligned with Tailwind v4 @theme inline --font-sans)
      fontFamily: {
        sans: ['Switzer', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      
      // 8pt Spacing Grid
      spacing: {
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
      
      // Apple-style Shadows
      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
        md: '0 4px 6px rgba(0, 0, 0, 0.07)',
        lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
        xl: '0 20px 25px rgba(0, 0, 0, 0.15)',
        '2xl': '0 25px 50px rgba(0, 0, 0, 0.25)',
      },
      
      // Motion Timing
      transitionDuration: {
        120: '120ms',  // Instant (taps)
        200: '200ms',  // Reveal
        240: '240ms',  // Morph
        400: '400ms',  // Slow
      },
      
      // Apple Easing
      transitionTimingFunction: {
        'apple': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      
      // Pulsating Button Animation
      keyframes: {
        pulse: {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--pulse-color)" },
          "50%": { boxShadow: "0 0 0 8px var(--pulse-color)" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(calc(-100% - var(--gap)))" },
        },
        "marquee-vertical": {
          from: { transform: "translateY(0)" },
          to: { transform: "translateY(calc(-100% - var(--gap)))" },
        },
      },
      animation: {
        pulse: "pulse var(--duration) ease-out infinite",
        marquee: "marquee var(--duration) linear infinite",
        "marquee-vertical": "marquee-vertical var(--duration) linear infinite",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
  ],
} satisfies Config;
