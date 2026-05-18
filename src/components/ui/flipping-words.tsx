"use client"

import * as React from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"

interface FlippingWordsProps {
  words: string[]
  className?: string
  typingSpeed?: number
  deletingSpeed?: number
  pauseBeforeDelete?: number
}

export function FlippingWords({
  words,
  className,
  typingSpeed = 50,
  deletingSpeed = 50,
  pauseBeforeDelete = 1000,
}: FlippingWordsProps) {
  const [currentWordIndex, setCurrentWordIndex] = React.useState(0)
  const [visibleCharacters, setVisibleCharacters] = React.useState(0)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const currentWord = words[currentWordIndex] ?? ""

  React.useEffect(() => {
    if (words.length === 0) return

    let timeout: ReturnType<typeof setTimeout>

    if (!isDeleting && visibleCharacters < currentWord.length) {
      timeout = setTimeout(() => {
        setVisibleCharacters((prev) => prev + 1)
      }, typingSpeed)
    } else if (!isDeleting && visibleCharacters === currentWord.length) {
      timeout = setTimeout(() => {
        setIsDeleting(true)
      }, pauseBeforeDelete)
    } else if (isDeleting && visibleCharacters > 0) {
      timeout = setTimeout(() => {
        setVisibleCharacters((prev) => prev - 1)
      }, deletingSpeed)
    } else if (isDeleting && visibleCharacters === 0) {
      setIsDeleting(false)
      setCurrentWordIndex((prev) => (prev + 1) % words.length)
    }

    return () => clearTimeout(timeout)
  }, [
    currentWord,
    deletingSpeed,
    isDeleting,
    pauseBeforeDelete,
    typingSpeed,
    visibleCharacters,
    words.length,
  ])

  return (
    <span className={cn("relative inline-block", className)}>
      <span className="tracking-tighter">
        {currentWord
          .substring(0, visibleCharacters)
          .split("")
          .map((char, index) => (
            <motion.span
              key={`${currentWordIndex}-${index}-${char}`}
              initial={{
                opacity: 0,
                rotateY: 90,
                y: 10,
                filter: "blur(10px)",
              }}
              animate={{
                opacity: 1,
                rotateY: 0,
                y: 0,
                filter: "blur(0px)",
              }}
              exit={{
                opacity: 0,
                rotateY: -90,
                y: -10,
                filter: "blur(10px)",
              }}
              transition={{ duration: 0.3 }}
              className="inline-block"
            >
              {char === " " ? "\u00A0" : char}
            </motion.span>
          ))}
      </span>
      <motion.span
        layout
        className="absolute -right-4 bottom-2 inline-block rounded-full bg-black"
        style={{
          width: isDeleting ? "0.45em" : "0.25em",
          height: "0.25em",
        }}
        animate={{
          backgroundColor: isDeleting
            ? "#ef4444"
            : ["#60a5fa", "#22c55e", "#3b82f6"],
        }}
        transition={{ duration: 0.1 }}
      />
    </span>
  )
}
