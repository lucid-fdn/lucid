'use client'

import { useState, useEffect } from 'react'

interface UseKeyboardShortcutReturn {
  shortcut: string
  isMobile: boolean
  isMac: boolean
  isWindows: boolean
  isLinux: boolean
}

export function useKeyboardShortcut(): UseKeyboardShortcutReturn {
  const [shortcut, setShortcut] = useState('⌘K')
  const [isMobile, setIsMobile] = useState(false)
  const [isMac, setIsMac] = useState(false)
  const [isWindows, setIsWindows] = useState(false)
  const [isLinux, setIsLinux] = useState(false)

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase()
    
    // Detect operating system
    const mac = userAgent.includes('mac')
    const windows = userAgent.includes('windows')
    const linux = !mac && !windows && (
      userAgent.includes('linux') || 
      userAgent.includes('ubuntu') || 
      userAgent.includes('debian') ||
      userAgent.includes('fedora') ||
      userAgent.includes('centos')
    )

    setIsMac(mac)
    setIsWindows(windows)
    setIsLinux(linux)

    // Set appropriate keyboard shortcut
    if (windows || linux) {
      setShortcut('Ctrl+K')
    } else if (mac) {
      setShortcut('⌘K')
    } else {
      // Default fallback
      setShortcut('Ctrl+K')
    }

    // Detect mobile devices
    const checkIsMobile = () => {
      const mobile = window.innerWidth < 768 || 
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
      setIsMobile(mobile)
    }

    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)
    
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  return {
    shortcut,
    isMobile,
    isMac,
    isWindows,
    isLinux
  }
}
