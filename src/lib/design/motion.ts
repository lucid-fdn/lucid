/**
 * Motion Library - Lucid Flows
 * 
 * @module lib/design/motion
 * @description Framer Motion variants for Apple-inspired animations
 * 
 * ## Animation Strategy
 * 
 * Use this library (Framer Motion) when you need:
 * - Complex layout animations
 * - Gesture-based interactions (drag, swipe)
 * - Morphing between states
 * - Sequence orchestration
 * 
 * For simple animations (70% of cases), use tailwindcss-animate instead:
 * @example
 * <button className="hover:scale-105 transition-120">Button</button>
 * 
 * For pre-built effects (sparkles, animated lists), use Magic UI.
 * 
 * @see {@link docs/ANIMATION_STRATEGY.md} - Complete animation strategy guide
 */

import { Variants } from 'motion/react';
import { tokens } from './tokens';

/**
 * Apple-style easing curve
 * @constant
 * @type {readonly [number, number, number, number]}
 */
const appleEase = [0.2, 0.8, 0.2, 1] as const;

/**
 * Breathing hover effect - subtle scale
 * 
 * @description
 * Use for cards, buttons, and interactive elements that need gentle hover feedback.
 * Scales to 1.02 on hover with 120ms duration.
 * 
 * @example
 * ```tsx
 * <motion.div {...breathe}>
 *   <Card />
 * </motion.div>
 * ```
 * 
 * @alternative For simple buttons, prefer tailwindcss-animate:
 * ```tsx
 * <button className="hover:scale-102 transition-120">Button</button>
 * ```
 */
export const breathe: Variants = {
  initial: { scale: 1 },
  whileHover: { 
    scale: 1.02,
    transition: { 
      duration: tokens.motion.duration.instant / 1000,
      ease: appleEase 
    }
  },
};

/**
 * Fade in/out animation
 * 
 * @description
 * Smooth opacity transition for content reveals and disappearances.
 * Uses 200ms reveal, 120ms exit.
 * 
 * @example
 * ```tsx
 * <motion.div
 *   initial="initial"
 *   animate="animate"
 *   exit="exit"
 *   variants={fade}
 * >
 *   Content
 * </motion.div>
 * ```
 * 
 * @alternative For simple fades, prefer tailwindcss-animate:
 * ```tsx
 * <div className="animate-in fade-in duration-200">Content</div>
 * ```
 */
export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { 
    opacity: 1,
    transition: { 
      duration: tokens.motion.duration.reveal / 1000,
      ease: appleEase
    }
  },
  exit: { 
    opacity: 0,
    transition: {
      duration: tokens.motion.duration.instant / 1000
    }
  },
};

/**
 * Slide up entrance animation
 * 
 * @description
 * Combines fade with 8px upward slide. Perfect for modals, popovers, and dropdowns.
 * 200ms entrance, 120ms exit.
 * 
 * @example
 * ```tsx
 * <AnimatePresence>
 *   {isOpen && (
 *     <motion.div variants={slideUp}>
 *       <Dialog />
 *     </motion.div>
 *   )}
 * </AnimatePresence>
 * ```
 * 
 * @alternative For simple modals, prefer tailwindcss-animate:
 * ```tsx
 * <Dialog className="animate-in slide-in-from-bottom-2 fade-in">
 * ```
 */
export const slideUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { 
      duration: tokens.motion.duration.reveal / 1000,
      ease: appleEase 
    }
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: {
      duration: tokens.motion.duration.instant / 1000
    }
  }
};

/**
 * Morph transition for view switches
 * 
 * @description
 * Smooth 240ms transition for morphing between major UI states.
 * Use with Framer Motion's layout prop for spatial continuity.
 * 
 * @example
 * ```tsx
 * <motion.div
 *   layout
 *   variants={morph}
 *   key={mode}
 * >
 *   {mode === 'story' ? <StoryView /> : <StructureView />}
 * </motion.div>
 * ```
 * 
 * @note This requires Framer Motion - no CSS alternative available.
 */
export const morph: Variants = {
  initial: { opacity: 1 },
  animate: { 
    opacity: 1,
    transition: { 
      duration: tokens.motion.duration.morph / 1000,
      ease: appleEase 
    }
  }
};

/**
 * Stagger children animation
 * Use for lists, grids
 */
export const stagger: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.05
    }
  }
};

/**
 * Sparkle animation for proof receipts
 * 
 * @description
 * 1-second sparkle effect that scales and fades in/out.
 * Shows when proof receipts land asynchronously.
 * 
 * @example
 * ```tsx
 * <motion.div
 *   variants={sparkle}
 *   initial="initial"
 *   animate="animate"
 * >
 *   <Badge>Receipt saved</Badge>
 * </motion.div>
 * ```
 * 
 * @alternative Consider Magic UI's Sparkles component:
 * ```tsx
 * import Sparkles from '@/components/magicui/sparkles';
 * <Sparkles><Badge>Receipt saved</Badge></Sparkles>
 * ```
 */
export const sparkle: Variants = {
  initial: { 
    opacity: 0, 
    scale: 0.5 
  },
  animate: { 
    opacity: [0, 1, 0],
    scale: [0.5, 1, 0.5],
    transition: {
      duration: 1,
      ease: "easeInOut",
      repeat: 0
    }
  }
};

/**
 * Scale tap feedback
 * 
 * @description
 * Scales to 0.98 on tap for tactile feedback. 120ms instant response.
 * 
 * @example
 * ```tsx
 * <motion.button variants={tap}>
 *   Click me
 * </motion.button>
 * ```
 * 
 * @alternative For simple buttons, prefer tailwindcss-animate:
 * ```tsx
 * <button className="active:scale-98 transition-120">Click me</button>
 * ```
 */
export const tap: Variants = {
  whileTap: { 
    scale: 0.98,
    transition: { 
      duration: tokens.motion.duration.instant / 1000 
    }
  }
};

/**
 * Pre-configured animation variants
 * 
 * @description
 * Collection of ready-to-use Framer Motion variants.
 * Import and spread onto motion components.
 * 
 * @example
 * ```tsx
 * import { motionVariants } from '@/lib/design/motion';
 * 
 * // Single variant
 * <motion.div {...motionVariants.breathe}>
 * 
 * // Combined variants
 * <motion.button {...motionVariants.breatheAndTap}>
 * ```
 */
export const motionVariants = {
  breathe,
  fade,
  slideUp,
  morph,
  stagger,
  sparkle,
  tap,
  
  // Combo: breathing with tap feedback
  breatheAndTap: {
    ...breathe,
    ...tap,
  },
  
  // Combo: fade + slide up
  fadeSlideUp: {
    ...fade,
    ...slideUp,
  },
};

/**
 * Transition timing presets
 * 
 * @description
 * Pre-configured transition timings with Apple easing.
 * Use directly in transition props.
 * 
 * @example
 * ```tsx
 * <motion.div
 *   animate={{ x: 100 }}
 *   transition={transitions.reveal}
 * />
 * ```
 */
export const transitions = {
  instant: {
    duration: tokens.motion.duration.instant / 1000,
    ease: appleEase,
  },
  reveal: {
    duration: tokens.motion.duration.reveal / 1000,
    ease: appleEase,
  },
  morph: {
    duration: tokens.motion.duration.morph / 1000,
    ease: appleEase,
  },
  slow: {
    duration: tokens.motion.duration.slow / 1000,
    ease: appleEase,
  },
};

/**
 * Animation props for reduced motion accessibility
 * 
 * @description
 * Use when user has prefers-reduced-motion enabled.
 * Instant transitions with minimal animation.
 * 
 * @example
 * ```tsx
 * const prefersReducedMotion = usePrefersReducedMotion();
 * 
 * <motion.div
 *   {...(prefersReducedMotion ? reducedMotion : motionVariants.fade)}
 * />
 * ```
 */
export const reducedMotion = {
  initial: { opacity: 1 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.01 },
};

/**
 * Hook to detect if user prefers reduced motion
 * 
 * @description
 * Checks the prefers-reduced-motion media query.
 * Use to conditionally apply animations.
 * 
 * @returns {boolean} True if user prefers reduced motion
 * 
 * @example
 * ```tsx
 * const prefersReducedMotion = usePrefersReducedMotion();
 * 
 * return (
 *   <motion.div
 *     initial={{ opacity: 0 }}
 *     animate={{ opacity: 1 }}
 *     transition={{
 *       duration: prefersReducedMotion ? 0.01 : 0.2
 *     }}
 *   />
 * );
 * ```
 */
export const usePrefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};
