'use client'

import React, { useState, useEffect } from 'react'
import { Container } from '@/components/container'
import dynamic from 'next/dynamic'

const StarsCanvas = dynamic(() => import('@/components/motion-primitives/star-background').then(mod => ({ default: mod.StarsCanvas })), { ssr: false })
import { HeroLoader } from '@/components/hero-loader'
import { Stats } from '@/components/stats'
import { WhyItMatter } from '@/components/WhyItMatter'
import LogoCloud from '@/components/logo-cloud'
import { PulsatingButton } from '@/ui/components/pulsating-button'
import { Applications } from '@/components/Applications'

const stats = [
  { 
    id: '1', 
    name: 'Data Points', 
    value: '100M+', 
    comment: 'Proofs you can check for every result',
    numericValue: 100,
    suffix: 'M+'
  },
  { 
    id: '2', 
    name: 'Nodes', 
    value: '950+', 
    comment: 'All your favorite AIs & Apps',
    numericValue: 850,
    suffix: '+'
  },
  { 
    id: '3', 
    name: 'Uptime', 
    value: '99.99%', 
    comment: 'Targeted for human grade AI',
    numericValue: 99.99,
    suffix: '%'
  },
]

// Social icon components from footer
function SocialIconX(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" {...props}>
      <path d="M12.6 0h2.454l-5.36 6.778L16 16h-4.937l-3.867-5.594L2.771 16H.316l5.733-7.25L0 0h5.063l3.495 5.114L12.6 0zm-.86 14.376h1.36L4.323 1.539H2.865l8.875 12.837z" />
    </svg>
  )
}

function SocialIconDiscord(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  )
}

export default function CountdownPage() {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  })

  useEffect(() => {
    // Calculate next Monday 12pm EST
    const getNextMonday12pmEST = () => {
      const now = new Date()
      const estOffset = -5 * 60 // EST is UTC-5
      const nowEST = new Date(now.getTime() + (now.getTimezoneOffset() + estOffset) * 60000)
      
      // Get next Monday
      const daysUntilMonday = (8 - nowEST.getDay()) % 7 || 7
      const nextMonday = new Date(nowEST)
      nextMonday.setDate(nowEST.getDate() + daysUntilMonday)
      nextMonday.setHours(12, 0, 0, 0)
      
      // Convert back to local time
      return new Date(nextMonday.getTime() - (now.getTimezoneOffset() + estOffset) * 60000)
    }

    const timer = setInterval(() => {
      const targetDate = getNextMonday12pmEST().getTime()
      const now = new Date().getTime()
      const difference = targetDate - now

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000)
        })
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const _socialLinks = [
    { name: 'X', icon: SocialIconX, href: 'https://x.com/LucidChain', color: 'hover:text-blue-400' },
    { name: 'Discord', icon: SocialIconDiscord, href: 'https://discord.gg/UesvgVEXRD', color: 'hover:text-indigo-400' },
  ]

  return (
    <div className="overflow-hidden">
      <HeroLoader videoSrc="/videos/blackhole.webm">
        <div>
          <div className="mt-14 relative min-h-screen">
            <StarsCanvas className="z-1" />
            <video
              autoPlay
              muted
              loop
              playsInline
              className="absolute left-0 w-full h-full object-cover z-0"
            >
              <source src="/videos/blackholes.webm" type="video/webm" />
            </video>
            <div className="absolute bottom-[0px] left-0 w-full h-full bg-gradient-to-b from-black/0 via-black/70 to-black/80 pointer-events-none" />
            
            <Container className="relative flex items-center justify-center min-h-screen z-10 py-20">
              <div className="text-center max-w-4xl mx-auto px-4">
                {/* Main Title */}
                <h1 className="bg-gradient-to-b from-white to-gray-300/30 bg-clip-text text-transparent font-display text-5xl/[1.2] xl:text-[5.25rem] font-semibold tracking-tight text-balance sm:text-8xl/[1.15] md:text-7xl/[1.15] mb-8">
                  The Internet of AI
                </h1>
                
                {/* Subtitle */}
                <p className="mx-auto max-w-3xl text-xl/5 text-white/70 text-balance text-md sm:text-xl/8 mb-6">
                  The Layer to Compose Interoperable AI
                </p>

                {/* Countdown Timer */}
                <div className="mt-12 mb-12">
                  <div className="inline-flex gap-4 sm:gap-8 p-6 sm:p-8 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl">
                    {[
                      { value: timeLeft.days, label: 'Days' },
                      { value: timeLeft.hours, label: 'Hours' },
                      { value: timeLeft.minutes, label: 'Minutes' },
                      { value: timeLeft.seconds, label: 'Seconds' }
                    ].map((item) => (
                      <div key={item.label} className="text-center min-w-[70px] sm:min-w-[90px]">
                        <div className="text-4xl sm:text-6xl font-bold text-white tabular-nums tracking-tight mb-2">
                          {String(item.value).padStart(2, '0')}
                        </div>
                        <div className="text-xs sm:text-sm text-white/50 uppercase tracking-wider font-medium">
                          {item.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Social Links */}
                <div className="mt-12">
                  <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                    {/* Discord Button with Pulsating Effect */}
                    <a
                      href="https://discord.gg/sSkAY9UDcn"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <PulsatingButton>
                        Get Whitelisted
                      </PulsatingButton>
                    </a>
                  </div>
                </div>
              </div>
            </Container>
            <LogoCloud />
          </div>
        </div>
      </HeroLoader>
      
      <Stats 
        stats={stats} 
        animate={true}
        duration={2500}
        delay={500}
      />
      <WhyItMatter />
      <Applications />
    </div>
  )
}
