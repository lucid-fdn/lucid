'use client'

import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

interface CopyButtonProps {
  text: string
  successMessage?: string
  className?: string
  iconClassName?: string
  showCheck?: boolean
  variant?: 'default' | 'ghost' | 'outline' | 'secondary'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export function CopyButton({
  text,
  successMessage,
  className,
  iconClassName,
  showCheck = true,
  variant = 'ghost',
  size = 'sm'
}: CopyButtonProps) {
  const { copy, copiedText } = useCopyToClipboard()
  const isCopied = copiedText === text

  return (
    <Button
      onClick={() => copy(text, successMessage)}
      variant={variant}
      size={size}
      className={cn('h-6 w-6 p-0', className)}
      title="Copy to clipboard"
    >
      {showCheck && isCopied ? (
        <Check className={cn('h-3 w-3 text-green-500', iconClassName)} />
      ) : (
        <Copy className={cn('h-3 w-3', iconClassName)} />
      )}
    </Button>
  )
}
