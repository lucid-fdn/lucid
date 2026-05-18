'use client'

import { clsx } from 'clsx'
import { motion } from 'motion/react'

export function Logo({ className }: { className?: string }) {
  let transition = {
    duration: 0.5,
    ease: 'easeInOut' as const,
  }

  return (
    <motion.img
      variants={{ idle: {}, active: {} }}
      initial="idle"
      whileHover="active"
      src="/lucid.png"
      alt="Lucid"
      width={34}
      height={34}
      className={clsx(className, 'overflow-visible')}
      transition={transition}
    />
  )
}