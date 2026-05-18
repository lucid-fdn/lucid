import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface HeroTitleProps {
  children: ReactNode
  className?: string
}

export function HeroTitle({ children, className }: HeroTitleProps) {
  return (
    <h1 
      className={cn(
        "bg-gradient-to-b from-white to-gray-300/30 bg-clip-text text-transparent font-display text-5xl/[1.2] xl:text-[5.25rem] font-semibold tracking-tight text-balance sm:text-8xl/[1.15] md:text-7xl/[1.15] pb-8",
        className
      )}
    >
      {children}
    </h1>
  )
}

interface HeroSubtitleProps {
  children: ReactNode
  className?: string
}

export function HeroSubtitle({ children, className }: HeroSubtitleProps) {
  return (
    <p 
      className={cn(
        "mx-auto max-w-3xl text-xl/5 text-white/70 text-balance text-md sm:text-xl/8 mb-6",
        className
      )}
    >
      {children}
    </p>
  )
}
