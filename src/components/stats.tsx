'use client'

import { Container } from './container'
import { useEffect, useState, useRef } from 'react'

interface Stat {
  id: string
  name: string
  value: string
  comment: string
  numericValue?: number // Optional numeric value for animation
  suffix?: string // Optional suffix like '+', '%', etc.
}

interface StatsProps {
  stats: Stat[]
  className?: string
  animate?: boolean // Parameter to control animation
  duration?: number // Animation duration in milliseconds
  delay?: number // Delay before starting animation
}

// Animated counter component
function AnimatedCounter({ 
  target, 
  duration = 2000, 
  delay = 0, 
  suffix = '',
  className = ''
}: {
  target: number
  duration?: number
  delay?: number
  suffix?: string
  className?: string
}) {
  const [count, setCount] = useState(() => {
    // Start with a reasonable initial value based on target
    if (target <= 10) return Math.max(0, Math.floor(target * 0.1))
    if (target <= 100) return Math.max(0, Math.floor(target * 0.05))
    return Math.max(0, Math.floor(target * 0.01))
  })
  const [isVisible, setIsVisible] = useState(false)
  const elementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Intersection Observer to trigger animation when element comes into view
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true)
        }
      },
      { threshold: 0.1 }
    )

    if (elementRef.current) {
      observer.observe(elementRef.current)
    }

    return () => observer.disconnect()
  }, [isVisible])

  useEffect(() => {
    if (!isVisible) return

    const timer = setTimeout(() => {
      const startTime = Date.now()
      
      // Start from the current count value (already set to a reasonable initial value)
      const startValue = count
      
      // All animations take the same duration regardless of target value
      const actualDuration = duration

      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / actualDuration, 1)
        
        // Easing function for smooth animation
        const easeOutCubic = 1 - Math.pow(1 - progress, 3)
        const currentValue = Math.floor(startValue + (target - startValue) * easeOutCubic)
        
        setCount(currentValue)

        if (progress < 1) {
          requestAnimationFrame(animate)
        }
      }

      requestAnimationFrame(animate)
    }, delay)

    return () => clearTimeout(timer)
  }, [isVisible, target, duration, delay, count])

  return (
    <div ref={elementRef} className={className}>
      {count.toLocaleString()}{suffix}
    </div>
  )
}

export function Stats({ 
  stats, 
  className = '', 
  animate = false, 
  duration = 2000, 
  delay = 0 
}: StatsProps) {
  return (
    <div className={`py-16 ${className}`}>
      <Container>
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-8 text-center lg:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.id} className="mx-auto flex max-w-xs flex-col gap-y-2">
                <dd className="text-4xl font-semibold tracking-tight sm:text-5xl">

                  {animate && stat.numericValue !== undefined ? (
                    <AnimatedCounter
                      target={stat.numericValue}
                      duration={duration}
                      delay={delay}
                      suffix={stat.suffix || ''}
                    />
                  ) : (
                    stat.value
                  )}

                </dd>
                <dt className="text-xl font-semibold text-white/50">{stat.name}</dt>
                {/* <dd className="text-md font-medium tracking-tight text-white/50 sm:text-sm">
                  {stat.comment}
                </dd> */}
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </div>
  )
}
