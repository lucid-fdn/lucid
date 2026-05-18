"use client";

import { useEffect, useState } from 'react';
import { Search, FileText, HelpCircle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNotification } from '@/contexts/notification-context';
import Image from 'next/image';

interface TeamMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
  avatar_url?: string;
  mfa_enabled: boolean;
}

interface TeamMembersListProps {
  orgId: string;
  searchQuery?: string;
}

export function TeamMembersList({ orgId, searchQuery = '' }: TeamMembersListProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchQuery);
  const [updatingRoleFor, setUpdatingRoleFor] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const { showNotification } = useNotification();

  useEffect(() => {
    loadMembers();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [orgId]);

  const loadMembers = async () => {
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to load members');
      }
      
      const data = await res.json();
      setMembers(data.members || []);
    } catch (error: unknown) {
      console.error('Failed to load members:', error);
      showNotification({
        type: 'error',
        title: 'Failed to load team members',
        message: error instanceof Error ? error.message : 'Unable to fetch team members. Please try again.',
        duration: 7000,
      });
    } finally {
      setLoading(false);
    }
  };

  const changeMemberRole = async (userId: string, newRole: string, memberName: string) => {
    setUpdatingRoleFor(userId);
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update role');
      }

      showNotification({
        type: 'success',
        title: 'Role updated',
        message: `${memberName}'s role changed to ${newRole}`,
        duration: 4000,
      });
      
      loadMembers();
    } catch (error: unknown) {
      console.error('Failed to update role:', error);
      showNotification({
        type: 'error',
        title: 'Failed to update role',
        message: error instanceof Error ? error.message : 'Unable to change member role. Please try again.',
        duration: 7000,
      });
    } finally {
      setUpdatingRoleFor(null);
    }
  };

  const removeMember = async (userId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from this organization? This action cannot be undone.`)) {
      return;
    }

    setRemovingMember(userId);
    try {
      const res = await fetch(`/api/organizations/${orgId}/members?userId=${userId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to remove member');
      }

      showNotification({
        type: 'success',
        title: 'Member removed',
        message: `${memberName} has been removed from the organization`,
        duration: 4000,
      });
      
      loadMembers();
    } catch (error: unknown) {
      console.error('Failed to remove member:', error);
      showNotification({
        type: 'error',
        title: 'Failed to remove member',
        message: error instanceof Error ? error.message : 'Unable to remove member. Please try again.',
        duration: 7000,
      });
    } finally {
      setRemovingMember(null);
    }
  };

  const filteredMembers = members.filter(
    (member) =>
      member.name?.toLowerCase().includes(search.toLowerCase()) ||
      member.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header with Search and Actions */}
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-muted border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="icon" className="border-zinc-700">
            <FileText className="h-4 w-4" />
          </Button>
          <span className="text-zinc-400 text-sm">Docs</span>
        </div>
      </div>

      {/* Table Header */}
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[2fr,1fr,1fr,auto] gap-4 px-4 py-3 bg-muted border-b border-border">
          <div className="flex items-center space-x-2 text-sm font-medium text-zinc-400">
            <span>USER</span>
          </div>
          <div className="flex items-center space-x-2 text-sm font-medium text-zinc-400">
            <span>ENABLED MFA</span>
          </div>
          <div className="flex items-center space-x-2 text-sm font-medium text-zinc-400">
            <span>ROLE</span>
            <HelpCircle className="h-4 w-4" />
          </div>
          <div className="flex items-center space-x-2 text-sm font-medium text-zinc-400">
            <span>ACTIONS</span>
          </div>
        </div>

        {/* Table Body */}
        {loading ? (
          <div className="px-4 py-8 text-center text-zinc-400">
            Loading members...
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="px-4 py-8">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-1">
                <div className="h-5 w-5 rounded-full bg-zinc-800 flex items-center justify-center">
                  <span className="text-zinc-400 text-xs">i</span>
                </div>
              </div>
              <div>
                <p className="text-zinc-400 text-sm">
                  {search
                    ? `No users matched the search query "${search}"`
                    : 'No members in this organization yet'}
                </p>
                {!search && (
                  <p className="text-zinc-500 text-sm mt-1">
                    Invite team members to get started
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {filteredMembers.map((member) => (
              <div
                key={member.user_id}
                className="grid grid-cols-[2fr,1fr,1fr,auto] gap-4 px-4 py-3 hover:bg-zinc-900/50"
              >
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    {member.avatar_url ? (
                      <Image
                        src={member.avatar_url}
                        alt={member.name}
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full"
                        unoptimized
                      />
                    ) : (
                      <span className="text-white text-sm font-medium">
                        {member.name?.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{member.name}</p>
                    <p className="text-zinc-400 text-sm">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center">
                  {member.mfa_enabled ? (
                    <Badge variant="secondary" className="bg-green-900/20 text-green-400">
                      Enabled
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-zinc-800 text-zinc-400">
                      Disabled
                    </Badge>
                  )}
                </div>
                <div className="flex items-center">
                  <select
                    value={member.role}
                    onChange={(e) => changeMemberRole(member.user_id, e.target.value, member.name)}
                    disabled={updatingRoleFor === member.user_id}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="guest">Guest</option>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  {updatingRoleFor === member.user_id && (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin text-zinc-400" />
                  )}
                </div>
                <div className="flex items-center justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMember(member.user_id, member.name)}
                    disabled={removingMember === member.user_id}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20 disabled:opacity-50"
                  >
                    {removingMember === member.user_id ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Removing...
                      </>
                    ) : (
                      'Remove'
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {!loading && filteredMembers.length > 0 && (
          <div className="px-4 py-3 bg-muted border-t border-border flex items-center justify-between">
            <div className="text-sm text-zinc-400">
              {filteredMembers.length} of {members.length} users
            </div>
            <div className="flex space-x-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled
              >
                ‹
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled
              >
                ›
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
