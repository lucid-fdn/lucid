"use client"

import * as React from "react"
import { useState } from "react"
import { UserPlus, Loader2, X } from "lucide-react"
import { DialogWithSidebar } from "@/ui/components/dialog-with-sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useNotification } from "@/contexts/notification-context"
import { useLimit } from "@/components/access-control"
import { Alert, AlertDescription } from "@/ui/components/alert"
import { AlertCircle, Sparkles } from "lucide-react"
import Link from "next/link"
import { LoadingScreen } from "@/components/shared/loading-screen"

interface InviteMembersModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  workspaceName: string
  /** Current member count */
  currentMemberCount?: number
  /** Z-index for nested modals (default: 60 for use from settings/dropdown) */
  zIndex?: number
  onSuccess?: () => void
}

/**
 * Notion-style Invite Members Modal
 * 
 * Features:
 * - Clean, simple UI like Notion
 * - Multi-email support (comma-separated)
 * - Role selector
 * - Optional custom message
 * - Z-index support for nesting
 * - Uses centralized invite system
 * 
 * Usage:
 * ```tsx
 * // From dropdown (z-60)
 * <InviteMembersModal
 *   open={showInvite}
 *   onOpenChange={setShowInvite}
 *   workspaceId={workspace.id}
 *   workspaceName={workspace.name}
 *   zIndex={60}
 * />
 * 
 * // From settings modal (z-60, nested above settings z-50)
 * <InviteMembersModal
 *   open={showInvite}
 *   onOpenChange={setShowInvite}
 *   workspaceId={workspace.id}
 *   workspaceName={workspace.name}
 *   zIndex={60}
 * />
 * ```
 */
export function InviteMembersModal({
  open,
  onOpenChange,
  workspaceId,
  workspaceName: _workspaceName,
  currentMemberCount = 1,
  zIndex = 60,
  onSuccess,
}: InviteMembersModalProps) {
  const [inputValue, setInputValue] = useState("")
  const [emailChips, setEmailChips] = useState<string[]>([])
  const [role, setRole] = useState<string>("member")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false)
  const { showNotification } = useNotification()
  
  // Check member limits
  const { allowed: canAddMembers, limit, usage: _usage } = useLimit('maxMembers', currentMemberCount)
  const spotsRemaining = limit - currentMemberCount

  // Email validation
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }
  
  // Handle input change and chip creation
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)
    
    // Check if user typed comma or space
    if (value.endsWith(',') || value.endsWith(' ')) {
      const email = value.slice(0, -1).trim()
      if (email && isValidEmail(email) && !emailChips.includes(email)) {
        setEmailChips([...emailChips, email])
        setInputValue("")
      } else if (email && !isValidEmail(email)) {
        // Show error for invalid email
        showNotification({
          type: "error",
          title: "Invalid email",
          message: `"${email}" is not a valid email address`,
          duration: 3000,
        })
        setInputValue("")
      }
    }
  }
  
  // Handle input blur (when user clicks away)
  const handleInputBlur = () => {
    const email = inputValue.trim()
    if (email && isValidEmail(email) && !emailChips.includes(email)) {
      setEmailChips([...emailChips, email])
      setInputValue("")
    }
  }
  
  // Handle backspace to remove last chip
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !inputValue && emailChips.length > 0) {
      setEmailChips(emailChips.slice(0, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const email = inputValue.trim()
      if (email && isValidEmail(email) && !emailChips.includes(email)) {
        setEmailChips([...emailChips, email])
        setInputValue("")
      }
    }
  }
  
  // Remove specific chip
  const removeChip = (emailToRemove: string) => {
    setEmailChips(emailChips.filter(email => email !== emailToRemove))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Add current input if valid
    const currentEmail = inputValue.trim()
    const allEmails = [...emailChips]
    if (currentEmail && isValidEmail(currentEmail) && !allEmails.includes(currentEmail)) {
      allEmails.push(currentEmail)
    }

    if (allEmails.length === 0) {
      showNotification({
        type: "error",
        title: "No emails provided",
        message: "Please enter at least one email address",
        duration: 3000,
      })
      return
    }
    
    // Check if adding these members would exceed limit
    if (!canAddMembers || allEmails.length > spotsRemaining) {
      showNotification({
        type: "error",
        title: "Member limit reached",
        message: `Your plan allows ${limit} members. You have ${spotsRemaining} spot${spotsRemaining === 1 ? '' : 's'} remaining. Upgrade to add more members.`,
        duration: 7000,
      })
      return
    }

    // Close modal immediately
    onOpenChange(false)
    
    // Show loading overlay
    setShowLoadingOverlay(true)
    setLoading(true)

    try {
      const emailList = allEmails

      // Send invites (all emails already validated)
      const results = await Promise.allSettled(
        emailList.map(async (email, _index) => {
          const requestBody = {
            email,
            role,
            sendEmail: true,
            message: message || undefined,
          };

          try {
            const response = await fetch(`/api/orgs/${workspaceId}/invites`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
            });

            const responseData = await response.json();

            if (!response.ok) {
              throw new Error(responseData.error || `Failed to invite ${email}`)
            }

            return responseData;
          } catch (fetchError) {
            throw fetchError;
          }
        })
      )

      const successful = results.filter(r => r.status === "fulfilled").length
      const failed = results.filter(r => r.status === "rejected").length

      if (successful > 0) {
        showNotification({
          type: "success",
          title: `Invited ${successful} ${successful === 1 ? "member" : "members"}!`,
          message: `Invitation emails sent successfully`,
          duration: 5000,
        })

        // Reset form
        setEmailChips([])
        setInputValue("")
        setMessage("")
        setRole("member")
        
        // Callback
        onSuccess?.()
      }

      if (failed > 0) {
        showNotification({
          type: "error",
          title: `Failed to invite ${failed} ${failed === 1 ? "member" : "members"}`,
          message: "Some invitations could not be sent. Please try again.",
          duration: 7000,
        })
      }
    } catch (error: unknown) {
      showNotification({
        type: "error",
        title: "Failed to send invitations",
        message: error instanceof Error ? error.message : "An unexpected error occurred",
        duration: 7000,
      })
    } finally {
      setLoading(false)
      setShowLoadingOverlay(false)
    }
  }

  return (
    <>
      {/* Loading Overlay */}
      {showLoadingOverlay && (
        <LoadingScreen 
          message="Sending invitations..." 
          fullScreen 
        />
      )}

    <DialogWithSidebar
      open={open}
      onOpenChange={onOpenChange}
      title="Add members"
      description="Type or paste in emails below, separated by commas"
      zIndex={zIndex}
    >
      <div className="p-2">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Limit Warning */}
          {!canAddMembers && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <strong>Member limit reached</strong>
                    <p className="text-sm mt-1">
                      Your plan includes {limit} member{limit === 1 ? '' : 's'}. 
                      Upgrade to add more team members.
                    </p>
                  </div>
                  <Link href="/pricing">
                    <Button size="sm" className="shrink-0">
                      <Sparkles className="h-3 w-3 mr-1.5" />
                      Upgrade
                    </Button>
                  </Link>
                </div>
              </AlertDescription>
            </Alert>
          )}
          
          {canAddMembers && spotsRemaining <= 3 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="flex items-start justify-between gap-4">
                  <div className="text-sm flex-1">
                    {spotsRemaining} of {limit} member spot{spotsRemaining === 1 ? '' : 's'} remaining on your plan.
                  </div>
                  <Link href="/pricing">
                    <Button size="sm" variant="outline" className="shrink-0">
                      <Sparkles className="h-3 w-3 mr-1.5" />
                      Upgrade
                    </Button>
                  </Link>
                </div>
              </AlertDescription>
            </Alert>
          )}
          
          {/* Email Chips Input (Notion-style) */}
          <div className="space-y-2">
            <Label htmlFor="emails" className="text-sm font-medium">
              Email addresses
            </Label>
            <div 
              className="flex flex-wrap gap-2 p-2 border rounded-md bg-transparent min-h-[32px] cursor-text"
              onClick={() => document.getElementById('emails')?.focus()}
            >
              {emailChips.map((email) => (
                <div
                  key={email}
                  className="flex items-center gap-1 px-2 py-1 text-sm bg-primary/10 text-primary rounded-md"
                >
                  <span>{email}</span>
                  <button
                    type="button"
                    onClick={() => removeChip(email)}
                    className="hover:bg-primary/20 rounded-sm p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <Input
                id="emails"
                type="text"
                placeholder={emailChips.length === 0 ? "name@example.com" : ""}
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleKeyDown}
                className="flex-1 min-w-[200px] border-none shadow-none focus-visible:ring-0 px-0 !bg-transparent"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Press Enter, Space, or Comma to add multiple emails
            </p>
          </div>

          {/* Role Selector (with higher z-index) */}
          <div className="space-y-2">
            <Label htmlFor="role" className="text-sm font-medium">
              Select role
            </Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="role" className="w-full !h-[60px] px-4">
                <div className="text-left">
                  <SelectValue className="text-left" />
                </div>
              </SelectTrigger>
              <SelectContent className="z-[70]">
                <SelectItem value="member" className="cursor-pointer py-3 px-4">
                  <div>
                    <div className="font-medium">Member</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Can create and edit content, invite others
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="admin" className="cursor-pointer py-3 px-4">
                  <div>
                    <div className="font-medium">Admin</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Full access except billing and workspace deletion
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="guest" className="cursor-pointer py-3 px-4">
                  <div>
                    <div className="font-medium">Guest</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      View-only access for external collaborators
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="owner" className="cursor-pointer py-3 px-4">
                  <div>
                    <div className="font-medium">Owner</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Full workspace control, billing access
                    </div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Optional Message */}
          <div className="space-y-2">
            <Label htmlFor="message" className="text-sm font-medium">
              Message (optional)
            </Label>
            <Textarea
              id="message"
              placeholder="Add a note to your invite..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || (emailChips.length === 0 && !inputValue.trim()) || !canAddMembers}
              className="min-w-[120px]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Send invite
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </DialogWithSidebar>
    </>
  )
}
