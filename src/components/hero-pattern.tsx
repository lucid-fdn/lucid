import { GridPattern } from '@/components/GridPattern'
import { Heading } from '@/components/heading'

interface HeroPatternProps {
  title: string
  subtitle?: string
  description?: string
  className?: string
}

export default function HeroPattern({ 
  title, 
  subtitle, 
  description, 
  className = "" 
}: HeroPatternProps) {
  return (
    <div className={`relative mb-16 text-center m-auto h-96 ${className}`}>
      <GridPattern
        className="absolute inset-x-0 -top-14 h-[1000px] w-full mask-[linear-gradient(to_bottom_left,white_40%,transparent_50%)] fill-neutral-700/20 stroke-neutral-600/40 z-[1] pointer-events-none"
        yOffset={-96}
        interactive
      />
      <div className="relative z-[4] flex flex-col items-center justify-center h-full pt-20 lg:pt-16">
        <Heading as="h1" dark className="mb-4 max-w-3xl mx-auto text-center break-words">
          {title}
        </Heading>
        {subtitle && (
          <p className="mx-auto max-w-2xl sm:text-center text-center mt-4 text-lg font-semibold text-gray-900 dark:text-white">
            {subtitle}
          </p>
        )}
        {description && (
          <p className="mx-auto max-w-2xl sm:text-center text-center mt-2 text-lg text-gray-600 dark:text-gray-400">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}
