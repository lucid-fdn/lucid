'use client'

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, XCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface InviteDetails {
  org_name: string;
  org_slug: string;
  role: string;
  inviter_name?: string;
  expires_at: string;
}

export function AcceptInvitePage({ token }: { token: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch invite details
  useEffect(() => {
    async function fetchInvite() {
      try {
        const response = await fetch(`/api/invites/${token}/accept`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          setError(data.error || 'Failed to load invite');
        } else {
          setInvite(data.invite);
        }
      } catch (err) {
        console.error('[accept-invite] Fetch error:', err);
        setError('Failed to load invite details');
      } finally {
        setLoading(false);
      }
    }

    fetchInvite();
  }, [token]);

  // Accept invite
  const handleAccept = async () => {
    setAccepting(true);
    setError(null);

    try {
      const response = await fetch(`/api/invites/${token}/accept`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to accept invite');
        setAccepting(false);
        return;
      }

      // Success!
      toast.success(
        'Success!',
        data.message || `You've joined ${invite?.org_name}`
      );

      // Redirect to dashboard
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    } catch (err) {
      console.error('[accept-invite] Accept error:', err);
      setError('An unexpected error occurred');
      setAccepting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="container max-w-xl py-12">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Loading invite...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error && !invite) {
    return (
      <div className="container max-w-xl py-12">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <CardTitle>Invite Not Available</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{error}</p>
            <div className="flex gap-4">
              <Button onClick={() => router.push('/dashboard')}>
                Go to Dashboard
              </Button>
              <Button variant="outline" onClick={() => router.back()}>
                Go Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success/Accept state
  return (
    <div className="container max-w-xl py-12">
      <Card>
        <CardHeader>
          <CardTitle>Join Workspace</CardTitle>
          <CardDescription>
            You've been invited to join a workspace
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Invite Details */}
          <div className="rounded-lg border p-4 space-y-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Organization</label>
              <p className="text-lg font-semibold">{invite?.org_name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Your Role</label>
              <p className="text-lg font-semibold capitalize">{invite?.role}</p>
            </div>
            {invite?.inviter_name && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Invited By</label>
                <p className="text-lg">{invite.inviter_name}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-muted-foreground">Expires</label>
              <p className="text-sm">
                {new Date(invite?.expires_at || '').toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          {/* Info Note */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900 dark:text-blue-100">
              <p className="font-medium mb-1">What happens next?</p>
              <p className="text-blue-700 dark:text-blue-300">
                You'll be added to <strong>{invite?.org_name}</strong> with {invite?.role} permissions.
                You'll have access to their projects, environments, and resources.
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-lg p-4 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4">
            <Button
              onClick={handleAccept}
              disabled={accepting}
              size="lg"
              className="flex-1"
            >
              {accepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {accepting ? 'Joining...' : 'Accept & Join'}
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => router.back()}
              disabled={accepting}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
