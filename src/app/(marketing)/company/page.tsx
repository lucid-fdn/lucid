'use client'

import Image from 'next/image'
import { Button } from '@/components/ui/button'

const jobOpenings = [
  {
    id: 1,
    role: 'Senior AI Research Engineer',
    href: '/contact?from=careers&position=senior-ai-research-engineer',
    description:
      'Lead research and development of novel AI verification algorithms and techniques for real-time validation systems.',
    location: 'Remote',
  },
  {
    id: 2,
    role: 'Distributed Systems Engineer',
    href: '/contact?from=careers&position=distributed-systems-engineer',
    description:
      'Build and scale our high-performance verification infrastructure to handle billions of data points with sub-100ms latency.',
    location: 'Remote',
  },
  {
    id: 3,
    role: 'Machine Learning Engineer',
    href: '/contact?from=careers&position=machine-learning-engineer',
    description:
      'Develop and optimize ML models for AI output verification, working with large-scale datasets and real-time inference.',
    location: 'Remote',
  },
]

export default function Example() {

  return (
    <div className="bg-white dark:bg-gray-900">

      <main className="isolate">
        {/* Hero section */}
        <div className="relative isolate -z-10 overflow-hidden bg-linear-to-b from-indigo-100/20 pt-14 dark:from-indigo-950/10">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-1/2 -z-10 -mr-96 w-[200%] origin-top-right skew-x-[-30deg] bg-white shadow-xl ring-1 shadow-indigo-600/10 ring-indigo-50 sm:-mr-80 lg:-mr-96 dark:bg-gray-800/30 dark:shadow-indigo-400/10 dark:ring-white/5"
          />
          <div className="mx-auto max-w-7xl px-6 py-32 sm:py-40 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <h1 className="text-5xl font-semibold tracking-tight text-balance text-gray-900 sm:text-7xl dark:text-white">
                We&apos;re a passionate group of people building the future of AI infrastructure
              </h1>
              <div className="mt-6">
                <p className="text-lg font-medium text-pretty text-gray-500 sm:text-xl/8 dark:text-gray-400">
                  We&apos;re revolutionizing how AI systems process and validate data at scale. Our platform enables 
                  real-time verification of AI outputs, ensuring accuracy and reliability for mission-critical 
                  applications across industries.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA section 
        <div className="mt-32 overflow-hidden sm:mt-40">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <h2 className="text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl dark:text-white">
                Our team
              </h2>
              <p className="mt-6 text-xl/8 text-gray-700 dark:text-gray-300">
                We're a diverse team of AI researchers, engineers, and data scientists who believe in the power 
                of verifiable intelligence. Our mission is to build infrastructure that makes AI systems more 
                reliable, transparent, and trustworthy.
              </p>
              <p className="mt-6 text-base/7 text-gray-600 dark:text-gray-400">
                With backgrounds spanning machine learning, distributed systems, and cryptography, we're 
                uniquely positioned to solve the complex challenges of AI verification at scale.
              </p>
            </div>
          </div>
        </div>*/}

        {/* Stats */}
        <div className="mx-auto mt-32 max-w-7xl px-6 sm:mt-40 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <h2 className="text-4xl font-semibold tracking-tight text-pretty text-gray-900 sm:text-5xl dark:text-white">
              We&apos;re building the infrastructure for trustworthy AI
            </h2>
            <p className="mt-6 text-base/7 text-gray-600 dark:text-gray-300">
              Our platform processes billions of data points to verify AI outputs in real-time, ensuring 
              accuracy and reliability for mission-critical applications across healthcare, finance, and beyond.
            </p>
          </div>
          <div className="mx-auto mt-16 flex max-w-2xl flex-col gap-8 lg:mx-0 lg:mt-20 lg:max-w-none lg:flex-row lg:items-end">
            <div className="flex flex-col-reverse justify-between gap-x-16 gap-y-8 rounded-2xl bg-gray-50 p-8 sm:w-3/4 sm:max-w-md sm:flex-row-reverse sm:items-end lg:w-72 lg:max-w-none lg:flex-none lg:flex-col lg:items-start dark:bg-white/5 dark:inset-ring dark:inset-ring-white/10">
              <p className="flex-none text-3xl font-bold tracking-tight text-gray-900 dark:text-white">100M+</p>
              <div className="sm:w-80 sm:shrink lg:w-auto lg:flex-none">
                <p className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                  Data points verified
                </p>
                <p className="mt-2 text-base/7 text-gray-600 dark:text-gray-300">
                  Real-time verification of AI outputs across our platform.
                </p>
              </div>
            </div>
            <div className="flex flex-col-reverse justify-between gap-x-16 gap-y-8 rounded-2xl bg-gray-900 p-8 sm:flex-row-reverse sm:items-end lg:w-full lg:max-w-sm lg:flex-auto lg:flex-col lg:items-start lg:gap-y-44 dark:bg-gray-700 dark:inset-ring dark:inset-ring-white/10">
              <p className="flex-none text-3xl font-bold tracking-tight text-white">&lt;100ms</p>
              <div className="sm:w-80 sm:shrink lg:w-auto lg:flex-none">
                <p className="text-lg font-semibold tracking-tight text-white">
                  Average response time for AI verification
                </p>
                <p className="mt-2 text-base/7 text-gray-400 dark:text-gray-300">
                  Sub-100ms verification ensures real-time AI applications remain responsive.
                </p>
              </div>
            </div>
            <div className="flex flex-col-reverse justify-between gap-x-16 gap-y-8 rounded-2xl bg-indigo-600 p-8 sm:w-11/12 sm:max-w-xl sm:flex-row-reverse sm:items-end lg:w-full lg:max-w-none lg:flex-auto lg:flex-col lg:items-start lg:gap-y-28 dark:inset-ring dark:inset-ring-white/10">
              <p className="flex-none text-3xl font-bold tracking-tight text-white">99.99%</p>
              <div className="sm:w-80 sm:shrink lg:w-auto lg:flex-none">
                <p className="text-lg font-semibold tracking-tight text-white">Uptime guarantee</p>
                <p className="mt-2 text-base/7 text-indigo-200 dark:text-indigo-100">
                  Enterprise-grade reliability for mission-critical AI verification systems.
                </p>
              </div>
            </div>
          </div>
        </div>
        {/* Logo cloud */}
        <div className="py-16 mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div className="relative isolate overflow-hidden bg-gray-900 px-6 py-24 text-center shadow-2xl sm:rounded-3xl sm:px-16 dark:shadow-none dark:after:pointer-events-none dark:after:absolute dark:after:inset-0 dark:after:inset-ring dark:after:inset-ring-white/10 dark:after:sm:rounded-3xl">
            <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Trusted by leading AI companies
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg/8 text-gray-300">
              From top tiers enterprises to innovative startups, organizations rely on Lucid to ensure their 
              AI systems deliver accurate, verifiable results at scale.
            </p>
            <div aria-hidden="true" className="absolute -top-24 right-0 -z-10 transform-gpu blur-3xl">
              <div
                style={{
                  clipPath:
                    'polygon(73.6% 51.7%, 91.7% 11.8%, 100% 46.4%, 97.4% 82.2%, 92.5% 84.9%, 75.7% 64%, 55.3% 47.5%, 46.5% 49.4%, 45% 62.9%, 50.3% 87.2%, 21.3% 64.1%, 0.1% 100%, 5.4% 51.1%, 21.4% 63.9%, 58.9% 0.2%, 73.6% 51.7%)',
                }}
                className="aspect-1404/767 w-351 bg-linear-to-r from-[#80caff] to-[#4f46e5] opacity-25"
              />
            </div>
          </div>
        </div>

        {/* Blog section */}
        <div className="mx-auto mt-32 max-w-7xl px-6 sm:mt-40 lg:px-8">
          <div className="mx-auto flex max-w-2xl flex-col items-end justify-between gap-16 lg:mx-0 lg:max-w-none lg:flex-row">
            <div className="w-full lg:max-w-lg lg:flex-auto">
              <h2 className="text-3xl font-semibold tracking-tight text-pretty text-gray-900 sm:text-4xl dark:text-white">
                Join us in building the future of AI verification
              </h2>
              <p className="mt-6 text-xl/8 text-gray-600 dark:text-gray-400">
                We&apos;re looking for talented engineers, researchers, and data scientists who share our vision 
                of making AI systems more reliable and trustworthy.
              </p>
              <Image
                alt=""
                src="https://images.unsplash.com/photo-1606857521015-7f9fcf423740?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1344&h=1104&q=80"
                width={1344}
                height={1104}
                className="mt-16 aspect-6/5 w-full rounded-2xl object-cover outline-1 -outline-offset-1 outline-black/5 lg:aspect-auto lg:h-138 dark:outline-white/10"
                unoptimized
              />
            </div>
            <div className="w-full lg:max-w-xl lg:flex-auto">
              <h3 className="sr-only">Job openings</h3>
              <ul className="-my-8 divide-y divide-gray-100 dark:divide-gray-800">
                {jobOpenings.map((opening) => (
                  <li key={opening.id} className="py-8">
                    <dl className="relative flex flex-wrap gap-x-3">
                      <dt className="sr-only">Role</dt>
                      <dd className="w-full flex-none text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                        {opening.role}
                      </dd>
                      <dt className="sr-only">Description</dt>
                      <dd className="mt-2 w-full flex-none text-base/7 text-gray-600 dark:text-gray-400">
                        {opening.description}
                      </dd>
                      <dt className="sr-only">Location</dt>
                      <dd className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-x-3 text-base/7 text-gray-500 dark:text-gray-400">
                          <svg
                            viewBox="0 0 2 2"
                            aria-hidden="true"
                            className="size-0.5 flex-none fill-gray-300 dark:fill-gray-600"
                          >
                            <circle r={1} cx={1} cy={1} />
                          </svg>
                          {opening.location}
                        </div>
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className='ml-5 rounded-full'
                        >
                          <a href={opening.href}>Apply now</a>
                        </Button>
                      </dd>
                    </dl>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>

    </div>
  )
}
