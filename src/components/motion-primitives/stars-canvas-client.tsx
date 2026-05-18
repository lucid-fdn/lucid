'use client'

import dynamic from 'next/dynamic'

const StarsCanvas = dynamic(
  () =>
    import('@/components/motion-primitives/star-background').then((mod) => ({
      default: mod.StarsCanvas,
    })),
  { ssr: false },
)

export { StarsCanvas }
