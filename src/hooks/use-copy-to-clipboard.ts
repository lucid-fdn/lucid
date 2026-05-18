import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'

export function useCopyToClipboard() {
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const toast = useToast()

  const copy = async (text: string, successMessage?: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedText(text)
      toast.success(
        successMessage || 'Copied to clipboard!',
        text.length > 50 ? `${text.slice(0, 20)}...${text.slice(-10)}` : text
      )
      
      // Reset after 2 seconds
      setTimeout(() => setCopiedText(null), 2000)
      
      return true
    } catch (error) {
      console.error('Failed to copy:', error)
      toast.error('Failed to copy to clipboard')
      return false
    }
  }

  return { copy, copiedText }
}
