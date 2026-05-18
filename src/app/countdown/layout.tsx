'use client'

import Image from 'next/image'
import { NavLogo } from '@/components/navigation/nav-logo'
import { NAV_LINKS } from '@/content/nav'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/animate-ui/primitives/radix/tooltip'

function CountdownNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [mobileMenuOpen])

  return (
    <header className="fixed top-0 z-50 w-full">
      <nav
        className={cn(
          'mx-auto backdrop-blur-lg transition-all duration-500 ease-in-out',
          isScrolled
            ? 'mt-2 w-[min(100%,64rem)] px-6 bg-background/50 rounded-2xl border-border lg:px-5'
            : 'w-full px-6 border-transparent',
          mobileMenuOpen && 'h-screen'
        )}
      >
        <div className="flex items-center justify-between h-14 gap-4">
          {/* Left: Logo */}
          <div className="flex items-center gap-6 flex-1">
            <NavLogo size="md" showText={false} />
            
            {/* Desktop Search - Disabled with tooltip */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="hidden md:block flex-shrink min-w-[200px] max-w-[300px] opacity-50 cursor-not-allowed">
                    <div className="relative">
                      <input
                        type="text"
                        disabled
                        placeholder="Explore the Internet of AI..."
                        className="w-full px-3 py-1.5 text-sm rounded-lg bg-muted/50 border border-border/50 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Coming Soon</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Desktop Navigation - Disabled with tooltips */}
            <ul className="hidden lg:flex text-sm items-center ml-auto gap-6">
              {NAV_LINKS.map((item) => (
                <li key={item.name}>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-foreground/50 cursor-not-allowed">
                          {item.name}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Coming Soon</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: Actions - No Get Started button */}
          <div className="flex items-center gap-2">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 hover:bg-accent rounded-md transition-colors duration-120"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen ? (
                <XMarkIcon className="h-6 w-6" />
              ) : (
                <Bars3Icon className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <div 
          className={cn(
            "lg:hidden fixed inset-0 top-14 bg-background/95 backdrop-blur-lg transition-all duration-300 ease-in-out overflow-y-auto z-50",
            mobileMenuOpen ? "opacity-100 visible pointer-events-auto" : "opacity-0 invisible pointer-events-none"
          )}
        >
          <div className="h-full py-6 px-6 space-y-6">
            {/* Disabled Search */}
            <div className="opacity-50">
              <input
                type="text"
                disabled
                placeholder="Explore the Internet of AI... (Coming Soon)"
                className="w-full px-3 py-2 text-sm rounded-lg bg-muted/50 border border-border/50 cursor-not-allowed"
              />
            </div>
            
            {/* Disabled Nav Items */}
            <div className="space-y-4">
              {NAV_LINKS.map((item) => (
                <div key={item.name} className="space-y-2">
                  <div className="font-medium text-sm px-2 text-foreground/50 flex items-center justify-between">
                    {item.name}
                    <span className="text-xs text-muted-foreground">Coming Soon</span>
                  </div>
                  {item.groups && (
                    <div className="pl-4 space-y-2">
                      {item.groups.flatMap((g) => g.items).map((subitem) => (
                        <div
                          key={subitem.name}
                          className="block px-2 py-2 text-sm text-muted-foreground/50 cursor-not-allowed rounded-md"
                        >
                          {subitem.name}
                        </div>
                      ))}
                    </div>
                  )}
                  {item.subitems && (
                    <div className="pl-4 space-y-2">
                      {item.subitems.map((subitem) => (
                        <div
                          key={subitem.name}
                          className="block px-2 py-2 text-sm text-muted-foreground/50 cursor-not-allowed rounded-md"
                        >
                          {subitem.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </nav>
    </header>
  )
}

function SimpleFooter() {
  return (
    <footer className="py-8">
      <div className="max-w-7xl mx-auto px-6 flex flex-col items-center justify-center gap-4">
        <Image src="/lucid_w.gif" alt="Lucid Logo" width={88} height={88} className="h-22" unoptimized />
        <p className="text-sm text-white/70">
          © {new Date().getFullYear()} Lucid Foundation.
        </p>
      </div>
    </footer>
  )
}

export default function CountdownLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <CountdownNavbar />
      {children}
      <SimpleFooter />
    </>
  )
}
