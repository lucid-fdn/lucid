'use client'

import Image from 'next/image'
import { clsx } from 'clsx'
import { motion } from 'motion/react'
import { Topheading } from './text-marketing'

// Original BentoCard for home page
export function BentoCard({
  dark = false,
  className = '',
  eyebrow,
  title,
  description,
  graphic,
  fade = [],
  children,
}: {
  dark?: boolean
  className?: string
  eyebrow: React.ReactNode
  title: React.ReactNode
  description: React.ReactNode
  graphic?: React.ReactNode
  fade?: ('top' | 'bottom')[]
  children?: React.ReactNode
}) {
  return (
    <motion.div
      initial="idle"
      whileHover="active"
      variants={{ idle: {}, active: {} }}
      data-dark={dark ? 'true' : undefined}
      className={clsx(
        className,
        'group relative flex flex-col overflow-hidden rounded-lg',
        'bg-white shadow-xs ring-1 ring-black/5',
        'data-dark:bg-neutral-900/30 data-dark:ring-white/5',
      )}
    >
      {graphic && (
        <div className="relative h-80 shrink-0">
          {graphic}
          {fade.includes('top') && (
            <div className="absolute inset-0 bg-linear-to-b from-white to-50% group-data-dark:from-gray-800 group-data-dark:from-[-25%]" />
          )}
          {fade.includes('bottom') && (
            <div className="absolute inset-0 bg-linear-to-t from-white to-50% group-data-dark:from-gray-800 group-data-dark:from-[-25%]" />
          )}
        </div>
      )}
      <div className="relative p-10">
        <Topheading as="h3" dark={dark}>
          {eyebrow}
        </Topheading>
        <p className=" mt-1 text-2xl/8 font-semibold tracking-tight text-gray-950 group-data-dark:text-white">
          {title}
        </p>
        <p className="mt-2 max-w-[600px] text-sm/6 text-gray-600 group-data-dark:text-white/50">
          {description}
        </p>
      </div>
      {children}
    </motion.div>
  )
}

// Enterprise BentoCard props (for backward compatibility)
interface EnterpriseBentoCardProps {
  title: string
  description: string
  image?: {
    src: string
    alt: string
    darkSrc?: string
    customStyles?: React.CSSProperties
  }
  customMedia?: React.ReactNode
  codeExample?: {
    files: Array<{
      name: string
      isActive?: boolean
    }>
    content?: string
  }
  borderRadius?: {
    mobile?: 'top' | 'bottom' | 'none'
    desktop?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'left' | 'right' | 'none'
  }
  layout?: 'image' | 'code' | 'simple'
  className?: string
  colSpan?: {
    default?: number  // Base span (mobile)
    sm?: number       // Small screens
    md?: number       // Medium screens
    lg?: number       // Large screens
    xl?: number       // Extra large screens
  }
  rowSpan?: {
    default?: number
    sm?: number
    md?: number
    lg?: number
    xl?: number
  }
  gridColumn?: string  // Direct CSS grid-column value (e.g., "1 / 3", "span 2")
  gridRow?: string     // Direct CSS grid-row value (e.g., "1 / 3", "span 2")
}

// Enterprise BentoCard for enterprise page
export function EnterpriseBentoCard({
  title,
  description,
  image,
  customMedia,
  codeExample,
  borderRadius = {
    mobile: 'none',
    desktop: 'none'
  },
  layout = 'image',
  className = "",
  colSpan,
  rowSpan,
  gridColumn,
  gridRow
}: EnterpriseBentoCardProps) {
  // Mobile border radius classes
  const getMobileRadius = () => {
    switch (borderRadius.mobile) {
      case 'top':
        return 'max-lg:rounded-t-4xl'
      case 'bottom':
        return 'max-lg:rounded-b-4xl'
      default:
        return ''
    }
  }

  // Desktop border radius classes
  const getDesktopRadius = () => {
    switch (borderRadius.desktop) {
      case 'top-left':
        return 'lg:rounded-tl-4xl'
      case 'top-right':
        return 'lg:rounded-tr-4xl'
      case 'bottom-left':
        return 'lg:rounded-bl-4xl'
      case 'bottom-right':
        return 'lg:rounded-br-4xl'
      case 'left':
        return 'lg:rounded-l-4xl'
      case 'right':
        return 'lg:rounded-r-4xl'
      default:
        return ''
    }
  }

  // Desktop border radius for calc values
  const getDesktopRadiusCalc = () => {
    switch (borderRadius.desktop) {
      case 'top-left':
        return 'lg:rounded-tl-[calc(2rem+1px)]'
      case 'top-right':
        return 'lg:rounded-tr-[calc(2rem+1px)]'
      case 'bottom-left':
        return 'lg:rounded-bl-[calc(2rem+1px)]'
      case 'bottom-right':
        return 'lg:rounded-br-[calc(2rem+1px)]'
      case 'left':
        return 'lg:rounded-l-[calc(2rem+1px)]'
      case 'right':
        return 'lg:rounded-r-[calc(2rem+1px)]'
      default:
        return ''
    }
  }

  const mobileRadius = getMobileRadius()
  const desktopRadius = getDesktopRadius()
  const desktopRadiusCalc = getDesktopRadiusCalc()

  // Generate grid span classes
  const getGridSpanClasses = () => {
    const spanClasses: string[] = []
    
    if (colSpan) {
      if (colSpan.default) spanClasses.push(`col-span-${colSpan.default}`)
      if (colSpan.sm) spanClasses.push(`sm:col-span-${colSpan.sm}`)
      if (colSpan.md) spanClasses.push(`md:col-span-${colSpan.md}`)
      if (colSpan.lg) spanClasses.push(`lg:col-span-${colSpan.lg}`)
      if (colSpan.xl) spanClasses.push(`xl:col-span-${colSpan.xl}`)
    }
    
    if (rowSpan) {
      if (rowSpan.default) spanClasses.push(`row-span-${rowSpan.default}`)
      if (rowSpan.sm) spanClasses.push(`sm:row-span-${rowSpan.sm}`)
      if (rowSpan.md) spanClasses.push(`md:row-span-${rowSpan.md}`)
      if (rowSpan.lg) spanClasses.push(`lg:row-span-${rowSpan.lg}`)
      if (rowSpan.xl) spanClasses.push(`xl:row-span-${rowSpan.xl}`)
    }
    
    return spanClasses.join(' ')
  }

  const gridSpanClasses = getGridSpanClasses()

  // Build inline styles for direct grid positioning
  const gridStyles: React.CSSProperties = {}
  if (gridColumn) gridStyles.gridColumn = gridColumn
  if (gridRow) gridStyles.gridRow = gridRow

  return (
    <div 
      className={`relative ${gridSpanClasses} ${className}`}
      style={Object.keys(gridStyles).length > 0 ? gridStyles : undefined}
    >
      <div className={`absolute inset-px rounded-lg bg-white ${mobileRadius} ${desktopRadius} dark:ring-white/5 dark:bg-neutral-900/30`} />
      <div className={`relative flex h-full flex-col overflow-hidden rounded-[calc(var(--radius-lg)+1px)] ${mobileRadius} ${desktopRadiusCalc}`}>
        <div className="px-8 pt-8 pb-3 sm:px-10 sm:pt-10 sm:pb-0">
          <p className="mt-2 text-2xl/8 font-semibold tracking-tight text-gray-950 max-lg:text-center dark:text-white">
            {title}
          </p>
          <p className="mt-2 max-w-[600px] text-sm/6 text-gray-600 max-lg:text-center dark:text-white/50">
            {description}
          </p>
        </div>
        {layout === 'image' && image && (
          <div className="@container relative w-full grow max-lg:mx-auto max-lg:max-w-sm">
            <div className="absolute inset-x-10 top-10 bottom-0 overflow-hidden rounded-t-[12cqw] border-x-[3cqw] border-t-[3cqw] border-gray-700 bg-gray-900 shadow-2xl dark:shadow-none dark:outline dark:outline-white/20">
              <Image
                alt={image.alt}
                src={image.src}
                fill
                className="object-cover object-top"
                style={image.customStyles}
                unoptimized
              />
            </div>
          </div>
        )}
        
        {layout === 'code' && codeExample && (
          <div className="relative w-full grow">
            <div className="absolute top-10 right-0 bottom-0 left-10 overflow-hidden rounded-tl-xl bg-gray-900 shadow-2xl outline outline-white/10 dark:bg-gray-900/60 dark:shadow-none">
              <div className="flex bg-gray-900 outline outline-white/5">
                <div className="-mb-px flex text-sm/6 font-medium text-gray-400">
                  {codeExample.files.map((file, index) => (
                    <div
                      key={index}
                      className={`border-r border-b border-r-white/10 border-b-white/20 px-4 py-2 ${
                        file.isActive ? 'bg-white/5 text-white' : 'border-gray-600/10'
                      }`}
                    >
                      {file.name}
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-6 pt-6 pb-14">
                {codeExample.content && (
                  <pre className="text-sm text-gray-300">{codeExample.content}</pre>
                )}
              </div>
            </div>
          </div>
        )}
        
        {layout === 'simple' && image && (
          <div className="flex flex-1 items-center justify-center px-8 max-lg:pt-10 max-lg:pb-12 sm:px-10 lg:pb-2">
            <Image
              alt={image.alt}
              src={image.src}
              width={600}
              height={400}
              className="w-full max-lg:max-w-xs dark:hidden"
              style={image.customStyles}
              unoptimized
            />
            {image.darkSrc && (
              <Image
                alt={image.alt}
                src={image.darkSrc}
                width={600}
                height={400}
                className="w-full not-dark:hidden max-lg:max-w-xs"
                style={image.customStyles}
                unoptimized
              />
            )}
          </div>
        )}
        
        {customMedia && (
          <div className="flex flex-1 items-center justify-center max-lg:pt-10 h-80">
            <div className="w-full h-full">
              {customMedia}
            </div>
          </div>
        )}
      </div>
      <div className={`pointer-events-none absolute inset-px rounded-lg shadow-sm outline outline-black/5 ${mobileRadius} ${desktopRadius} dark:outline-white/15`} />
    </div>
  )
}

// Default export for backward compatibility
export default BentoCard
