'use client'

import { useState, useEffect } from 'react'
import { useMfaEnrollment, usePrivy } from '@privy-io/react-auth'
import { isWeb3Enabled } from '@/lib/auth/client-config'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DialogWithSidebar } from '@/ui/components/dialog-with-sidebar'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Shield, Smartphone, Key, QrCode } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import QRCodeReact from 'react-qr-code'
import { notificationCopy } from '@/lib/notifications/copy'
import { summarizeError } from '@/lib/logging/safe-log'

function PrivySecurityCardInner() {
  const { user, linkPasskey, unlinkPasskey } = usePrivy()
  const { initEnrollmentWithTotp, submitEnrollmentWithTotp, unenrollWithTotp } = useMfaEnrollment()
  const toast = useToast()

  const [showNameDialog, setShowNameDialog] = useState(false)
  const [showTotpDialog, setShowTotpDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [appName, setAppName] = useState('')
  const [totpAuthUrl, setTotpAuthUrl] = useState<string | null>(null)
  const [totpSecret, setTotpSecret] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [customAppNames, setCustomAppNames] = useState<Record<string, string>>({})

  // Load saved app names from localStorage on mount
  useEffect(() => {
    const savedNames = localStorage.getItem('totpAppNames')
    if (savedNames) {
      try {
        setCustomAppNames(JSON.parse(savedNames))
      } catch (error) {
        console.warn('Failed to parse saved authenticator app names:', summarizeError(error))
      }
    }
  }, [])

  // Get MFA methods - mfaMethods is an array of STRINGS like ['sms', 'totp', 'passkey']
  const mfaMethods: string[] = (user as unknown as { mfaMethods?: string[] })?.mfaMethods || []
  const hasTotpMfa = mfaMethods.includes('totp')
  const totpCount = hasTotpMfa ? 1 : 0  // Simplified: either enrolled or not
  const hasPasskey = user?.linkedAccounts?.some((acc: { type: string }) => acc.type === 'passkey')

  // Passkey handlers
  const handleLinkPasskey = async () => {
    try {
      await linkPasskey()
    } catch (_error) {
      toast.error('Failed to enable passkey')
    }
  }

  const handleUnlinkPasskey = async () => {
    try {
      const passkeyAccount = user?.linkedAccounts?.find((acc: { type: string }) => acc.type === 'passkey')
      if (passkeyAccount) {
        await unlinkPasskey((passkeyAccount as unknown as { passkeyId: string }).passkeyId)
      }
    } catch (_error) {
      toast.error('Failed to remove passkey')
    }
  }

  // Generate default app name
  const generateAppName = () => {
    const randomNum = Math.floor(100 + Math.random() * 900)
    return `App ${randomNum}`
  }

  // TOTP handlers - Step 1: Show name dialog
  const handleStartTotpEnrollment = () => {
    setAppName(generateAppName())
    setShowNameDialog(true)
  }

  // Step 2: Generate QR after name is provided
  const handleGenerateQR = async () => {
    try {
      setError(null)
      setMfaCode('')
      setShowNameDialog(false)

      const { authUrl, secret } = await initEnrollmentWithTotp()
      setTotpAuthUrl(authUrl)
      setTotpSecret(secret)
      setShowTotpDialog(true)
    } catch (_error) {
      toast.error('Failed to initialize authenticator', 'Please try again')
      setShowNameDialog(false)
    }
  }

  const handleSubmitTotpCode = async () => {
    try {
      setError(null)
      await submitEnrollmentWithTotp({ mfaCode })

      // Store the custom name (Privy only supports one TOTP enrollment)
      const updatedNames = { ...customAppNames, "0": appName }
      setCustomAppNames(updatedNames)
      localStorage.setItem('totpAppNames', JSON.stringify(updatedNames))

      // Success! Close modal and show success toast
      setShowTotpDialog(false)
      setMfaCode('')
      setTotpAuthUrl(null)
      setTotpSecret(null)

      toast.success(`Authenticator app "${appName}" enabled`, 'Your account is now more secure with 2FA')

      // Reset for next use
      setAppName('')

      // Note: Privy automatically updates user object, React will re-render
      // to show the newly enrolled app in the list
    } catch (_error) {
      setError('Invalid code. Please try again.')
    }
  }

  const handleRemoveTotpAccount = async () => {
    try {
      await unenrollWithTotp()

      // Clear custom name from localStorage
      const updatedNames = { ...customAppNames }
      delete updatedNames["0"]
      setCustomAppNames(updatedNames)
      localStorage.setItem('totpAppNames', JSON.stringify(updatedNames))

      toast.success('Authenticator app removed', 'MFA has been disabled')
    } catch (error) {
      console.error('Error removing TOTP:', summarizeError(error))
      toast.error('Failed to remove app', 'Please try again')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success(notificationCopy.common.copiedToClipboard)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle>Security</CardTitle>
        </div>
        <CardDescription>
          Enhance your account security with multi-factor authentication
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Authenticator App Section */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <h4 className="font-medium text-sm">Authenticator app</h4>
              </div>
            </div>
            {totpCount > 0 && (
              <span className="text-xs px-2 py-1 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 font-medium">
                {totpCount} {totpCount === 1 ? 'app' : 'apps'} configured
              </span>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            Generate one-time passwords via authenticator apps like 1Password, Authy, etc. as a second factor to verify your identity during sign-in.
          </p>

          {/* Show enrolled app if any */}
          {hasTotpMfa && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Enrolled apps:</p>
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/50 border">
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Name: </span>
                    <span className="font-medium">{customAppNames["0"] || "Authenticator App"}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    MFA enabled for embedded wallet
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  className="ml-3"
                >
                  Remove
                </Button>
              </div>
            </div>
          )}

          <Button
            onClick={handleStartTotpEnrollment}
            variant="default"
            size="sm"
            className="gap-2"
          >
            <QrCode className="h-4 w-4" />
            {hasTotpMfa ? 'Replace app' : 'Add new app'}
          </Button>
        </div>

        {/* Passkey Section */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Key className="h-5 w-5 text-muted-foreground" />
              <div>
                <h4 className="font-medium text-sm">Passkey</h4>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">
              {hasPasskey ? 'Enabled' : 'Not configured'}
            </span>
          </div>

          <p className="text-sm text-muted-foreground">
            Add a passkey for passwordless, phishing-resistant authentication using your device's biometrics or security key.
          </p>

          {!hasPasskey ? (
            <Button
              onClick={handleLinkPasskey}
              variant="default"
              size="sm"
              className="gap-2"
            >
              <Key className="h-4 w-4" />
              Enable passkey
            </Button>
          ) : (
            <Button
              onClick={handleUnlinkPasskey}
              variant="outline"
              size="sm"
            >
              Remove passkey
            </Button>
          )}
        </div>

        {/* Name Input Dialog - Step 1 */}
        <DialogWithSidebar
          open={showNameDialog}
          onOpenChange={setShowNameDialog}
          title="Add a new authenticator app as a factor"
          description="Provide a name to identify this app"
          zIndex={60}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Input
                id="app-name"
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="font-mono text-sm"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                A string will be randomly generated if a name is not provided
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowNameDialog(false)
                  setAppName('')
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerateQR}
                className="bg-green-600 hover:bg-green-700"
              >
                Generate QR
              </Button>
            </div>
          </div>
        </DialogWithSidebar>

        {/* QR Code Dialog - Step 2 */}
        <DialogWithSidebar
          open={showTotpDialog}
          onOpenChange={setShowTotpDialog}
          title={`Verify new factor ${appName}`}
          description="Use an authenticator app to scan the following QR code, and provide the code from the app to complete the enrollment."
          zIndex={60}
        >
          <div className="space-y-4">
            {totpAuthUrl && (
              <div className="flex flex-col items-center space-y-4">
                {/* QR Code */}
                <div className="bg-white p-4 rounded-lg">
                  <QRCodeReact value={totpAuthUrl} size={200} />
                </div>

                {/* Manual Entry */}
                {totpSecret && (
                  <div className="w-full space-y-2">
                    <p className="text-sm text-muted-foreground text-center">
                      Or enter this code manually:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-muted rounded text-sm font-mono">
                        {totpSecret}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(totpSecret)}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Code Input */}
            <div className="space-y-2">
              <label htmlFor="mfa-code" className="text-sm font-medium">
                Enter the 6-digit code from your app
              </label>
              <Input
                id="mfa-code"
                type="text"
                placeholder="123456"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                className="text-center text-lg tracking-widest"
                aria-invalid={!!error}
                autoComplete="off"
              />
              {error && (
                <p className="text-sm text-destructive" role="alert">{error}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowTotpDialog(false)
                  setMfaCode('')
                  setError(null)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitTotpCode}
                disabled={mfaCode.length !== 6}
              >
                Verify and enable
              </Button>
            </div>
          </div>
        </DialogWithSidebar>

        {/* Delete Confirmation AlertDialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="max-w-lg" style={{ zIndex: 60 }}>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm to delete factor</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4">
                  {/* Warning Banner */}
                  <div className="flex gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <div className="w-5 h-5 rounded bg-destructive/20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-destructive" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-destructive">Multi-factor authentication will be disabled</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        There are no other factors that are set up once you delete this factor, as such your account will no longer be guarded by multi-factor authentication
                      </p>
                    </div>
                  </div>

                  {/* Considerations */}
                  <div className="space-y-2">
                    <p className="font-medium text-sm">Before deleting this factor, consider:</p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex gap-2">
                        <span className="text-muted-foreground">•</span>
                        <span>Adding another authenticator app as a factor prior to deleting</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-muted-foreground">•</span>
                        <span>Ensure that your account does not need multi-factor authentication</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-muted-foreground">•</span>
                        <span>You will lose access to any organization that enforces multi-factor authentication</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async (e) => {
                  e.preventDefault()
                  setShowDeleteDialog(false)
                  await handleRemoveTotpAccount()
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

export function SecurityCard() {
  if (!isWeb3Enabled()) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Security</CardTitle>
          </div>
          <CardDescription>
            Available when Privy auth is configured
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return <PrivySecurityCardInner />
}
