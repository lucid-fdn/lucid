// components/TypingBubble.tsx
import React from "react";
import { AnimatePresence, motion } from "motion/react";

interface TypingBubbleProps {
  show: boolean;
}

export default function TypingBubble({ show }: TypingBubbleProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="inline-block w-2 h-2 bg-white rounded-full ml-1 animate-pulse"
        />
      )}
    </AnimatePresence>
  );
}
