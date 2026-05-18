import React from 'react'
import type { SVGProps } from 'react'

interface Feature {
  name: string
  description: string
  icon: React.ComponentType<SVGProps<SVGSVGElement>>
}

interface FeatureGridProps {
  features: Feature[]
  className?: string
}

export function FeatureGrid({ features, className = '' }: FeatureGridProps) {
  return (
    <div className={`mx-auto mt-16 max-w-7xl px-6 sm:mt-20 md:mt-24 lg:px-8 ${className}`}>
      <dl className="mx-auto grid max-w-2xl grid-cols-1 gap-x-6 gap-y-10 text-base/7 text-gray-600 sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3 lg:gap-x-8 lg:gap-y-16 dark:text-gray-400">
        {features.map((feature) => (
          <div key={feature.name} className="relative pl-9">
            <dt className="inline font-semibold text-gray-900 dark:text-white">
              <feature.icon
                aria-hidden="true"
                className="absolute top-1 left-1 size-5 text-indigo-600 dark:text-indigo-400"
              />
              {feature.name}
            </dt>{' '}
            <dd className="inline">{feature.description}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
