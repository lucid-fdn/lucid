"use client"

import React, { memo } from 'react'
import { TypingAnimation } from '@/ui/components/typing-animation'

export const PromptTypingPlaceholder = memo(function PromptTypingPlaceholder() {
  return (
    <TypingAnimation 
      words={[
        "Create an agent that auto-invests on Hyperliquid.", 
        "Create an app that arbitrates between DEX", 
        "Create an agent that trades on Whales signals"
      ]} 
      loop 
      startOnView={false}
      as="p"
      className="text-base text-white/40 whitespace-normal leading-relaxed"
      typeSpeed={50}
      deleteSpeed={25}
      pauseDelay={2000}
    />
  )
})
