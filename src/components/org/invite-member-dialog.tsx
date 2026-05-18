"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Copy, Check, Info, Loader2 } from 'lucide-react';
import { useNotification } from '@/contexts/notification-context';

const inviteSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  role: z.enum(['admin', 'member', 'guest']),
});

interface InviteMemberDialogProps {
  orgId: string;
  trigger?: React.ReactNode;
  onInviteCreated?: () => void;
}

export function InviteMemberDialog({ orgId, trigger, onInviteCreated }: InviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showNotification } = useNotification();

  const form = useForm({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: 'member' as const,
    },
  });

  const onSubmit = async (data: z.infer<typeof inviteSchema>) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          sendEmail: true, // Always send email
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create invite');
      }

      const result = await res.json();
      setInviteUrl(result.invite.acceptUrl);

      showNotification({
        type: 'success',
        title: 'Invitation sent!',
        message: `Invitation email sent to ${data.email}`,
        duration: 5000,
      });

      form.reset();
      if (onInviteCreated) onInviteCreated();
    } catch (error: unknown) {
      showNotification({
        type: 'error',
        title: 'Failed to send invitation',
        message: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.',
        duration: 7000,
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (inviteUrl) {
      navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      showNotification({
        type: 'success',
        title: 'Link copied!',
        message: 'Invite link copied to clipboard',
        duration: 3000,
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setInviteUrl(null);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="bg-green-600 hover:bg-green-700">
            Invite member
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px] bg-zinc-900 border-zinc-800">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-white">
            Invite a member to this organization
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-6 w-6 text-zinc-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {!inviteUrl ? (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="role" className="text-white">
                Member role
              </Label>
              <Select
                value={form.watch('role')}
                onValueChange={(value) => form.setValue('role', value as z.infer<typeof inviteSchema>['role'])}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="guest">Guest</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-red-400">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                {...form.register('email')}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-red-400">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="flex items-start space-x-3 rounded-md bg-zinc-800/50 p-4 border border-zinc-700">
              <Info className="h-5 w-5 text-zinc-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-zinc-300">
                Single Sign-on (SSO) login option available
              </p>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending invitation...
                </>
              ) : (
                'Send invitation'
              )}
            </Button>
          </form>
        ) : (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="text-white">Invitation link</Label>
              <p className="text-sm text-zinc-400">
                Share this link with the invitee (valid for 7 days):
              </p>
              <div className="flex items-center space-x-2">
                <Input
                  value={inviteUrl}
                  readOnly
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={copyToClipboard}
                  className="border-zinc-700 hover:bg-zinc-800"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex space-x-3">
              <Button
                onClick={handleClose}
                variant="outline"
                className="flex-1 border-zinc-700 hover:bg-zinc-800"
              >
                Done
              </Button>
              <Button
                onClick={() => setInviteUrl(null)}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                Invite Another
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
