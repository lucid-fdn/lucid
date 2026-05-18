'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteAccountAction } from '@/lib/forms/actions'
import { LoadingRedirect } from '@/components/loading-redirect'

interface DangerZoneCardProps {
  username?: string
}

export function DangerZoneCard({ username }: DangerZoneCardProps) {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showLoadingScreen, setShowLoadingScreen] = useState(false)

  const handleDelete = async () => {
    if (confirmText !== username) return

    setLoading(true)
    setError(null)

    try {
      // 1. Delete from our database
      console.log('[danger-zone] Starting account deletion...');
      const result = await deleteAccountAction();
      
      if (!result.success) {
        setError(result.error || 'Failed to delete account')
        setLoading(false)
        return
      }

      console.log('[danger-zone] Account deleted from database, logging out...');

      // 2. Show loading screen (prevents FOUC)
      setOpen(false)
      setShowLoadingScreen(true)

      // 3. Logout from Privy (clears all sessions)
      await logout()

      // 4. Redirect to home
      window.location.href = '/'
    } catch (err) {
      console.error('Failed to delete account:', err)
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Show loading screen during account deletion
  if (showLoadingScreen) {
    return <LoadingRedirect message="Deleting account..." />
  }

  return (
    <Card className="border-destructive">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <CardTitle className="text-destructive">DANGER ZONE</CardTitle>
        </div>
        <CardDescription>
          Request for account deletion
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="rounded-lg bg-destructive/10 p-4">
            <p className="text-sm text-muted-foreground mb-4">
              Deleting your account is permanent and cannot be undone. Your data will be deleted within 30 days,
              except we may retain some metadata and logs for longer where required or permitted by law.
            </p>
            <Button 
              variant="destructive" 
              onClick={() => setOpen(true)}
              className="w-full sm:w-auto"
            >
              Request to delete account
            </Button>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Are you absolutely sure?</DialogTitle>
              <DialogDescription>
                This will permanently delete your account and remove all your data from our servers.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <p className="text-sm font-medium">
                To confirm, type your username <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">{username}</code> below:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Enter your username"
                className="text-sm"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={handleDelete}
                disabled={confirmText !== username || loading}
                variant="destructive"
              >
                {loading ? 'Deleting...' : 'Delete Account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
