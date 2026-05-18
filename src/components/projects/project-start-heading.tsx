"use client"

import { FlippingWords } from "@/components/ui/flipping-words"

const DEFAULT_PROJECT_START_WORDS = [
  "Personal Assistant",
  "Sales Closer",
  "Support Operator",
  "Growth Team",
]

interface ProjectStartHeadingProps {
  words?: string[]
}

export function ProjectStartHeading({
  words = DEFAULT_PROJECT_START_WORDS,
}: ProjectStartHeadingProps) {
  return (
    <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
      <span className="block">Start your</span>
      <span className="mt-2 block text-primary">
        <FlippingWords words={words} />
      </span>
    </h1>
  )
}

export { DEFAULT_PROJECT_START_WORDS }
