'use client'

import { Button } from './button'

interface HeroSectionProps {
  announcement?: {
    text: string
    linkText: string
    linkHref: string
  }
  title: string
  description: string
  primaryButton: {
    text: string
    href: string
    note?: string
  }
  secondaryButton?: {
    text: string
    href: string
    note?: string
  }
  backgroundGradient?: {
    from: string
    to: string
  }
  backgroundVideo?: string
  showOverlay?: boolean
  overlayClasses?: string
  className?: string
}

export default function HeroSection({
  announcement,
  title,
  description,
  primaryButton,
  secondaryButton,
  backgroundGradient = {
    from: "#ff80b5",
    to: "#9089fc"
  },
  backgroundVideo,
  showOverlay,
  overlayClasses,
  className = ""
}: HeroSectionProps) {

  return (
    <div className={`bg-white dark:bg-gray-900 ${className}`}>
      <div className="relative isolate px-6 pt-14 lg:px-8">
        {/* Background Video */}
        {backgroundVideo && (
          <div className="absolute inset-0 -z-10 h-screen">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="h-full w-full min-h-screen object-cover opacity-40 dark:opacity-30"
            >
              <source src={backgroundVideo} type="video/webm" />
            </video>
            {/* Gradient overlay for progressive transparency */}
            {showOverlay && overlayClasses && (
              <div className={`absolute inset-0 ${overlayClasses}`} />
            )}
          </div>
        )}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
        >
          <div
            className="relative left-[calc(50%-11rem)] aspect-1155/678 w-144.5 -translate-x-1/2 rotate-30 bg-linear-to-tr opacity-30 sm:left-[calc(50%-30rem)] sm:w-288.75"
            style={{
              clipPath:
                'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
              background: `linear-gradient(to top right, ${backgroundGradient.from}, ${backgroundGradient.to})`
            }}
          />
        </div>
        <div className="mx-auto max-w-2xl py-32 sm:py-48 lg:py-56 min-h-screen flex flex-col justify-center">
          {announcement && (
            <div className="hidden sm:mb-8 sm:flex sm:justify-center">
              <div className="relative rounded-full px-3 py-1 text-sm/6 text-gray-600 ring-1 ring-gray-900/10 hover:ring-gray-900/20 dark:text-gray-400 dark:ring-white/10 dark:hover:ring-white/20">
                {announcement.text}{' '}
                <a href={announcement.linkHref} className="font-semibold text-indigo-600 dark:text-indigo-400">
                  <span aria-hidden="true" className="absolute inset-0" />
                  {announcement.linkText} <span aria-hidden="true">&rarr;</span>
                </a>
              </div>
            </div>
          )}
          <div className="text-center">
            <h1 className="text-5xl font-semibold tracking-tight text-balance text-gray-900 sm:text-7xl dark:text-white">
              {title}
            </h1>
            <p className="mt-8 text-lg font-medium text-pretty text-gray-500 sm:text-xl/8 dark:text-gray-400">
              {description}
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <div className="flex flex-col items-center">
                <Button
                  href={primaryButton.href}
                  color="blue"
                >
                  {primaryButton.text}
                </Button>
                {primaryButton.note && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                    {primaryButton.note}
                  </p>
                )}
              </div>
              {secondaryButton && (
                <div className="flex flex-col items-center">
                  <Button
                    href={secondaryButton.href}
                    plain
                    className="text-gray-900 dark:text-white hover:bg-white hover:text-black"
                  >
                    {secondaryButton.text} →
                  </Button>
                  {secondaryButton.note && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                      {secondaryButton.note}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]"
        >
          <div
            className="relative left-[calc(50%+3rem)] aspect-1155/678 w-144.5 -translate-x-1/2 bg-linear-to-tr opacity-30 sm:left-[calc(50%+36rem)] sm:w-288.75"
            style={{
              clipPath:
                'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
              background: `linear-gradient(to top right, ${backgroundGradient.from}, ${backgroundGradient.to})`
            }}
          />
        </div>
      </div>
    </div>
  )
}
