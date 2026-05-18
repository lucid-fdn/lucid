"use client"

import { useState, useEffect, useRef } from 'react'

export function PromptInputDemo() {
  const [displayText, setDisplayText] = useState('')
  const indexRef = useRef(0)
  const quotesRef = useRef([
    "Create an agent that auto-invests on Hyperliquid.",
    "Create an app that arbitrates between DEX.",
    "Create an agent that trades on Whales signals."
  ])
  const currentQuoteRef = useRef(0)
  const isDeletingRef = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    const type = () => {
      if (!isMountedRef.current) return

      const quote = quotesRef.current[currentQuoteRef.current]
      
      if (!isDeletingRef.current) {
        if (indexRef.current < quote.length) {
          setDisplayText(quote.slice(0, indexRef.current + 1))
          indexRef.current++
          timeoutRef.current = setTimeout(type, 30)
        } else {
          timeoutRef.current = setTimeout(() => {
            isDeletingRef.current = true
            type()
          }, 1000)
        }
      } else {
        if (indexRef.current > 0) {
          setDisplayText(quote.slice(0, indexRef.current - 1))
          indexRef.current--
          timeoutRef.current = setTimeout(type, 15)
        } else {
          isDeletingRef.current = false
          currentQuoteRef.current = (currentQuoteRef.current + 1) % quotesRef.current.length
          timeoutRef.current = setTimeout(type, 300)
        }
      }
    }

    type()

    return () => {
      isMountedRef.current = false
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="flex h-full w-full items-center justify-center p-2 md:p-8">
      <div className="relative w-full max-w-3xl rounded-2xl border border-white/20 bg-white/5 p-12 backdrop-blur">
        <div className="min-h-[120px] text-xl text-white/80 leading-relaxed">
          {displayText}<span className="animate-pulse">|</span>
        </div>
        <button
          className="absolute bottom-4 right-4 flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 transition-colors border border-white/20"
          aria-label="Generate"
        >
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 10l7-7m0 0l7 7m-7-7v18"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
