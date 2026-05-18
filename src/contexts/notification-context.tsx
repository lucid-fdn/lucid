'use client'

import React, { createContext, useContext, useMemo } from 'react'
import { toast } from '@/hooks/use-toast'

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  duration?: number
  persistent?: boolean
}

interface NotificationContextType {
  showNotification: (notification: Omit<Notification, 'id'>) => string | number
  hideNotification: (id: string | number) => void
  clearAllNotifications: () => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function useNotification() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider')
  }
  return context
}

interface NotificationProviderProps {
  children: React.ReactNode
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const value = useMemo<NotificationContextType>(() => ({
    showNotification: (notification) => {
      const options = {
        description: notification.message,
        duration: notification.persistent ? Infinity : notification.duration,
      }

      switch (notification.type) {
        case 'success':
          return toast.success(notification.title, options)
        case 'error':
          return toast.error(notification.title, options)
        case 'warning':
          return toast.warning(notification.title, options)
        case 'info':
        default:
          return toast.info(notification.title, options)
      }
    },
    hideNotification: (id) => {
      toast.dismiss(id)
    },
    clearAllNotifications: () => {
      toast.dismiss()
    },
  }), [])

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}
