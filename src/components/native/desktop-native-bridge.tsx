'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

import {
  getLucidDesktopApi,
  resolveDesktopDeepLink,
  workspaceSlugFromPathname,
} from '@/lib/native/desktop'

export function DesktopNativeBridge() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const desktop = getLucidDesktopApi()
    if (!desktop) return

    const routeDeepLink = (url: string | null) => {
      if (!url) return
      const resolved = resolveDesktopDeepLink(url, workspaceSlugFromPathname(pathname))
      if (resolved.ok) router.push(resolved.path)
    }

    void desktop.getLaunchDeepLink().then(routeDeepLink).catch(() => null)
    return desktop.onDeepLink(routeDeepLink)
  }, [pathname, router])

  return null
}
