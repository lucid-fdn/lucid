'use client'

import { useEffect, useState } from 'react'

const OAUTH_FLOW_EVENT = 'lucid:oauth-flow-state'

declare global {
  interface Window {
    __lucidOAuthFlowActive?: boolean
  }
}

export function setOAuthFlowActive(active: boolean) {
  if (typeof window === 'undefined') return
  window.__lucidOAuthFlowActive = active
  window.dispatchEvent(
    new CustomEvent(OAUTH_FLOW_EVENT, {
      detail: { active },
    }),
  )
}

export function useOAuthFlowActive() {
  const [active, setActive] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.__lucidOAuthFlowActive === true
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ active?: boolean }>
      setActive(customEvent.detail?.active === true)
    }

    window.addEventListener(OAUTH_FLOW_EVENT, handler)
    return () => window.removeEventListener(OAUTH_FLOW_EVENT, handler)
  }, [])

  return active
}
