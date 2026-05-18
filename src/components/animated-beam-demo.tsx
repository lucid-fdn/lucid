"use client"

import React, { forwardRef, useRef } from "react"
import { cn } from "@/lib/utils"
import { AnimatedBeam } from "@/ui/components/animated-beam"
import { OpenAI } from '@lobehub/icons'
import Image from 'next/image'

const Circle = forwardRef<
  HTMLDivElement,
  { className?: string; children?: React.ReactNode }
>(({ className, children }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "z-10 flex size-12 items-center justify-center rounded-full border-2 bg-white p-3 shadow-[0_0_20px_-12px_rgba(0,0,0,0.8)]",
        className
      )}
    >
      {children}
    </div>
  )
})

Circle.displayName = "Circle"

export function AnimatedBeamDemo() {
  const containerRef = useRef<HTMLDivElement>(null)
  const div1Ref = useRef<HTMLDivElement>(null)
  const div2Ref = useRef<HTMLDivElement>(null)
  const div3Ref = useRef<HTMLDivElement>(null)
  const div5Ref = useRef<HTMLDivElement>(null)
  const div6Ref = useRef<HTMLDivElement>(null)
  const div7Ref = useRef<HTMLDivElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden p-6 md:p-10"
      ref={containerRef}
    >
      <div className="flex size-full max-w-6xl items-center justify-between">
        {/* Left Side - AI Models (Logo Only) */}
        <div className="flex flex-col gap-12">
          <Circle ref={div1Ref} className="bg-black/50 border-white/20">
            <OpenAI size={30} />
          </Circle>
          <Circle ref={div2Ref} className="bg-black/50 border-white/20 p-0">
            <div className="relative w-full h-full">
              <Image src="/logos/icon/hyperliquid.png" alt="Hyperliquid" fill className="object-contain" />
            </div>
          </Circle>
          <Circle ref={div3Ref} className="bg-black/50 border-white/20 p-0">
            <div className="relative w-full h-full">
              <Image src="/logos/icon/polymarket.png" alt="Polymarket" fill className="object-contain" />
            </div>
          </Circle>
        </div>

        {/* Center - Lucid Logo */}
        <div
          ref={centerRef}
          className="z-10 flex size-24 items-center justify-center rounded-full border-4 border-white/20 bg-black p-4 shadow-[0_0_30px_-8px_rgba(255,255,255,0.3)]"
        >
          <Image
            src="/lucid_w.gif"
            alt="Lucid"
            width={50}
            height={50}
            className="object-contain"
          />
        </div>

        {/* Right Side - Platforms */}
        <div className="flex flex-col gap-12">
          <Circle ref={div5Ref} className="bg-black/50 border-white/20">
            <Image src="/logos/x.svg" alt="X" width={80} height={80} />
          </Circle>
          <Circle ref={div6Ref} className="bg-black/50 border-white/20">
            <Image src="/logos/icon/solana.svg" alt="Solana" width={80} height={80} />
          </Circle>
          <Circle ref={div7Ref} className="bg-black/50 border-white/20 p-0">
            <Image src="/logos/telegram.svg" alt="Telegram" width={48} height={48} className="m-1 w-full h-full object-contain" />
          </Circle>
        </div>
      </div>

      {/* Animated Beams - Left Side to Center */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div1Ref}
        toRef={centerRef}
        curvature={-30}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div2Ref}
        toRef={centerRef}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div3Ref}
        toRef={centerRef}
        curvature={30}
      />

      {/* Animated Beams - Right Side to Center */}
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div5Ref}
        toRef={centerRef}
        curvature={-30}
        reverse
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div6Ref}
        toRef={centerRef}
        reverse
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={div7Ref}
        toRef={centerRef}
        curvature={30}
        reverse
      />
    </div>
  )
}
