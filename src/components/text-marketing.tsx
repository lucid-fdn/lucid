import { clsx } from 'clsx'

type HeadingProps = {
  as?: 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  dark?: boolean
} & React.ComponentPropsWithoutRef<
  'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
>

export function Heading({
  className,
  as: Element = 'h2',
  dark = false,
  ...props
}: HeadingProps) {
  return (
    <Element
      {...props}
      data-dark={dark ? 'true' : undefined}
      className={clsx(
        className,
        'text-4xl font-medium tracking-tighter text-pretty text-gray-950 data-dark:text-white sm:text-6xl',
      )}
    />
  )
}

export function Subheading({
  className,
  as: Element = 'h2',
  dark = false,
  ...props
}: HeadingProps) {
  return (
    <Element 
      {...props}
      data-dark={dark ? 'true' : undefined}
      className={clsx(
        className,
        'text-xl font-semibold text-gray-500 data-dark:text-white/50',
      )}
    />
  )
}

export function Topheading({
  className,
  as: Element = 'h2',
  dark = false,
  ...props
}: HeadingProps) {
  return (
    <Element
      {...props}
      data-dark={dark ? 'true' : undefined}
      className={clsx(
        className,
        'font-mono text-xs/5 font-semibold tracking-widest text-gray-500 uppercase data-dark:text-white/50',
      )}
    />
  )
}

export function Lead({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'p'>) {
  return (
    <p
      className={clsx(className, 'text-2xl font-medium text-gray-500')}
      {...props}
    />
  )
}

export function Heading2({
  className,
  dark = false,
  ...props
}: React.ComponentPropsWithoutRef<'p'> & { dark?: boolean }) {
  return (
    <p
      {...props}
      data-dark={dark ? 'true' : undefined}
      className={clsx(
        className,
        'mx-auto max-w-2xl sm:text-center text-center mt-4 text-lg text-gray-600 data-dark:text-gray-400'
      )}
    />
  )
}
