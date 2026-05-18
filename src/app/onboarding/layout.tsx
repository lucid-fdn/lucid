/**
 * Onboarding Layout (Minimal - No Distractions)
 * 
 * Dedicated layout for user and workspace onboarding flows
 * - No navbar (clean, focused experience)
 * - No sidebar
 * - Full-screen content area
 * - Requires authentication
 */

import React from "react"
import { redirect } from "next/navigation"
import { Toaster } from "@/components/ui/sonner"
import { getServerSession } from "@/lib/auth/session"

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Check authentication
  const session = await getServerSession()
  
  // Redirect to login if not authenticated
  if (!session?.userId) {
    redirect('/login?next=/onboarding')
  }

  return (
    <>
      <div className="flex min-h-screen w-full items-center justify-center bg-zinc-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-zinc-950">
        <div className="w-full max-w-2xl px-6 py-12">
          {children}
        </div>
      </div>
      <Toaster />
    </>
  )
}
