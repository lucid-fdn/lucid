"use client";

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Trash2, Clock, Mail, Loader2 } from 'lucide-react';
import { useNotification } from '@/contexts/notification-context';

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
  acceptUrl: string | null;
  inviter: { name: string } | null;
}

interface PendingInvitesListProps {
  orgId: string;
  onInviteRevoked?: () => void;
}

export function PendingInvitesList({ orgId, onInviteRevoked }: PendingInvitesListProps) {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingInvite, setRevokingInvite] = useState<string | null>(null);
  const { showNotification } = useNotification();

  useEffect(() => {
    loadInvites();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [orgId]);

  const loadInvites = async () => {
    try {
      const res = await fetch(`/api/orgs/${orgId}/invites`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to load invites');
      }
      
      const data = await res.json();
      // Only show pending invites
      const pending = data.invites?.filter((inv: PendingInvite) => inv.status === 'pending') || [];
      setInvites(pending);
    } catch (error: unknown) {
      console.error('Failed to load invites:', error);
      showNotification({
        type: 'error',
        title: 'Failed to load pending invites',
        message: error instanceof Error ? error.message : 'Unable to fetch pending invites. Please try again.',
        duration: 7000,
      });
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = (url: string) => {
    navigator.clipboard.writeText(url);
    showNotification({
      type: 'success',
      title: 'Link copied!',
      message: 'Invite link copied to clipboard',
      duration: 3000,
    });
  };

  const resendInvite = async (inviteId: string, email: string) => {
    try {
      const invite = invites.find(inv => inv.id === inviteId);
      if (invite?.acceptUrl) {
        copyInviteLink(invite.acceptUrl);
        showNotification({
          type: 'info',
          title: 'Invite link ready',
          message: `Share the copied link with ${email}`,
          duration: 5000,
        });
      }
    } catch (error: unknown) {
      console.error('Failed to resend invite:', error);
      showNotification({
        type: 'error',
        title: 'Failed to get invite link',
        message: error instanceof Error ? error.message : 'Unable to access invite link. Please try again.',
        duration: 7000,
      });
    }
  };

  const revokeInvite = async (inviteId: string, email: string) => {
    if (!confirm(`Are you sure you want to revoke the invitation for ${email}? This action cannot be undone.`)) {
      return;
    }
    
    setRevokingInvite(inviteId);
    try {
      const res = await fetch(`/api/orgs/${orgId}/invites/${inviteId}/revoke`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to revoke invite');
      }
      
      showNotification({
        type: 'success',
        title: 'Invite revoked',
        message: `Invitation for ${email} has been revoked`,
        duration: 4000,
      });
      
      loadInvites();
      if (onInviteRevoked) onInviteRevoked();
    } catch (error: unknown) {
      console.error('Failed to revoke invite:', error);
      showNotification({
        type: 'error',
        title: 'Failed to revoke invite',
        message: error instanceof Error ? error.message : 'Unable to revoke invitation. Please try again.',
        duration: 7000,
      });
    } finally {
      setRevokingInvite(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Expires today';
    if (diffDays === 1) return 'Expires tomorrow';
    return `Expires in ${diffDays} days`;
  };

  if (loading) {
    return (
      <div className="border border-zinc-800 rounded-lg p-8">
        <div className="flex items-center justify-center space-x-2">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          <p className="text-zinc-400">Loading pending invites...</p>
        </div>
      </div>
    );
  }

  if (invites.length === 0) {
    return null; // Don't show section if no pending invites
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">Pending Invites</h2>
      
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[2fr,1fr,1fr,auto] gap-4 px-4 py-3 bg-zinc-900 border-b border-zinc-800">
          <div className="text-sm font-medium text-zinc-400">EMAIL</div>
          <div className="text-sm font-medium text-zinc-400">ROLE</div>
          <div className="text-sm font-medium text-zinc-400">STATUS</div>
          <div className="text-sm font-medium text-zinc-400">ACTIONS</div>
        </div>

        <div className="divide-y divide-zinc-800">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="grid grid-cols-[2fr,1fr,1fr,auto] gap-4 px-4 py-3 hover:bg-zinc-900/50"
            >
              <div className="flex flex-col">
                <span className="text-white text-sm">{invite.email}</span>
                <span className="text-zinc-400 text-xs">
                  Invited by {invite.inviter?.name || 'Unknown'}
                </span>
              </div>
              
              <div className="flex items-center">
                <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                  {invite.role}
                </Badge>
              </div>
              
              <div className="flex items-center">
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm text-zinc-400">
                    {formatDate(invite.expires_at)}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-end space-x-2">
                {invite.acceptUrl && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyInviteLink(invite.acceptUrl!)}
                    title="Copy invite link"
                    className="h-8 w-8"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => resendInvite(invite.id, invite.email)}
                  title="Resend invitation"
                  className="h-8 w-8"
                >
                  <Mail className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => revokeInvite(invite.id, invite.email)}
                  disabled={revokingInvite === invite.id}
                  title="Revoke invite"
                  className="h-8 w-8 text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  {revokingInvite === invite.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 bg-zinc-900 border-t border-zinc-800">
          <div className="text-sm text-zinc-400">
            {invites.length} pending {invites.length === 1 ? 'invite' : 'invites'}
          </div>
        </div>
      </div>
    </div>
  );
}
