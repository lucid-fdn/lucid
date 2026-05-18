"use client"

import { useState, useEffect } from 'react'

const QUOTES = [
  "Create an agent that auto-invests on Hyperliquid.",
  "Create an app that arbitrates between DEX",
  "Create an agent that trades on Whales signals"
]

export function SimpleTyping() {
  const [text, setText] = useState('')
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const currentQuote = QUOTES[quoteIndex]
    const timeout = setTimeout(() => {
      if (!isDeleting) {
        // Typing
        if (text.length < currentQuote.length) {
          setText(currentQuote.substring(0, text.length + 1))
        } else {
          // Pause before deleting
          setTimeout(() => setIsDeleting(true), 2000)
        }
      } else {
        // Deleting
        if (text.length > 0) {
          setText(currentQuote.substring(0, text.length - 1))
        } else {
          setIsDeleting(false)
          setQuoteIndex((quoteIndex + 1) % QUOTES.length)
        }
      }
    }, isDeleting ? 25 : 50)

    return () => clearTimeout(timeout)
  }, [text, quoteIndex, isDeleting])

  return (
    <p className="text-base text-white/40 whitespace-normal leading-relaxed">
      {text}
      <span className="animate-pulse">|</span>
    </p>
  )
}
