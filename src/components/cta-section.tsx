import { Button } from './button'

interface CTAButton {
  text: string
  href: string
  note?: string
  variant?: 'primary' | 'secondary'
}

interface CTASectionProps {
  title: string
  description: string
  primaryButton: CTAButton
  secondaryButton?: CTAButton
  buttonNote?: string
  backgroundGradient?: {
    from: string
    to: string
  }
  className?: string
}

export default function CTASection({
  title,
  description,
  primaryButton,
  secondaryButton,
  backgroundGradient = {
    from: "#7775D6",
    to: "#E935C1"
  },
  className = ""
}: CTASectionProps) {
  return (
    <div className={`bg-white dark:bg-gray-900 ${className}`}>
      <div className="mx-auto max-w-7xl py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="relative isolate overflow-hidden bg-gray-900 px-6 py-24 text-center shadow-2xl sm:rounded-3xl sm:px-16 dark:bg-gray-800 dark:shadow-none dark:after:pointer-events-none dark:after:absolute dark:after:inset-0 dark:after:inset-ring dark:after:inset-ring-white/10 dark:after:sm:rounded-3xl">
          <h2 className="text-4xl font-semibold tracking-tight text-balance text-white sm:text-5xl">
            {title}
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg/8 text-pretty text-gray-300">
            {description}
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <div className="flex flex-col items-center">
              <Button
                href={primaryButton.href}
                color="white"
                className="bg-white text-gray-900 hover:bg-white hover:text-black"
              >
                {primaryButton.text}
              </Button>
              {primaryButton.note && (
                <p className="mt-2 text-xs text-gray-300 text-center">
                  {primaryButton.note}
                </p>
              )}
            </div>
            {secondaryButton && (
              <div className="flex flex-col items-center">
                <Button
                  href={secondaryButton.href}
                  plain
                  className="text-white hover:bg-white hover:text-black"
                >
                  {secondaryButton.text} →
                </Button>
                {secondaryButton.note && (
                  <p className="mt-2 text-xs text-gray-300 text-center">
                    {secondaryButton.note}
                  </p>
                )}
              </div>
            )}
          </div>
          <svg
            viewBox="0 0 1024 1024"
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 -z-10 size-256 -translate-x-1/2 mask-[radial-gradient(closest-side,white,transparent)]"
          >
            <circle r={512} cx={512} cy={512} fill="url(#cta-gradient)" fillOpacity="0.7" />
            <defs>
              <radialGradient id="cta-gradient">
                <stop stopColor={backgroundGradient.from} />
                <stop offset={1} stopColor={backgroundGradient.to} />
              </radialGradient>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  )
}
