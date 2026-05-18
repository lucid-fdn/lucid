'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { UserPlus, UserMinus, Loader2 } from 'lucide-react';
import { useFollowContributor, useFollowOrganization } from '@/hooks/use-marketplace-actions';

interface FollowButtonProps {
  type: 'org' | 'contributor';
  id: string;
  initialFollowing?: boolean;
  className?: string;
}

export function FollowButton({
  type,
  id,
  initialFollowing = false,
  className = '',
}: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  
  const contributorHooks = useFollowContributor();
  const orgHooks = useFollowOrganization();
  
  const { follow: _follow, unfollow: _unfollow, isFollowing, isUnfollowing } =
    type === 'contributor' ? contributorHooks : orgHooks;

  const handleToggle = async () => {
    const wasFollowing = following;
    
    // Optimistic update
    setFollowing(!following);
    
    try {
      if (type === 'contributor') {
        if (wasFollowing) {
          await contributorHooks.unfollowAsync({ handle: id });
        } else {
          await contributorHooks.followAsync({ handle: id });
        }
      } else {
        if (wasFollowing) {
          await orgHooks.unfollowAsync({ orgId: id });
        } else {
          await orgHooks.followAsync({ orgId: id });
        }
      }
    } catch (error) {
      // Revert on error
      console.error('[FollowButton] Error:', error);
      setFollowing(wasFollowing);
    }
  };

  const loading = isFollowing || isUnfollowing;

  return (
    <Button
      onClick={handleToggle}
      disabled={loading}
      variant={following ? 'outline' : 'default'}
      className={className}
      size="sm"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : following ? (
        <UserMinus className="w-4 h-4 mr-2" />
      ) : (
        <UserPlus className="w-4 h-4 mr-2" />
      )}
      {following ? 'Unfollow' : 'Follow'}
    </Button>
  );
}
