/**
 * Legal Pages Layout (Public - No Auth Required)
 * 
 * Provides basic structure for legal pages:
 * - Publicly accessible (no authentication)
 * - Back button to return to previous page
 * - Clean, readable layout
 */

'use client'

import React from "react"
import Link from "next/link"
import { Toaster } from "@/components/ui/sonner"
import { useRouter } from "next/navigation"

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  return (
    <>
      {/* Simple header with back button */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6"/>
            </svg>
            Back
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="min-h-screen">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6">
        <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Lucid. All rights reserved.
          </p>
          <div className="flex gap-4 text-sm">
            <Link href="/legal/privacy-policy" className="text-muted-foreground hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/legal/terms-of-service" className="text-muted-foreground hover:text-foreground transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>

      <Toaster />
    </>
  )
}
