"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import type { RealtimeSubscription } from "@/hooks/use-supabase-realtime";
import { useOAuthFlowActive } from "@/lib/oauth/flow-state";

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  severity?: "info" | "success" | "warning" | "error";
  read: boolean;
  href?: string;
  org_name?: string;
  created_at: string;
}

/** Play a subtle notification sound. Silently catches autoplay blocks. */
function playNotificationSound() {
  try {
    const audio = new Audio("/sounds/notification.mp3");
    audio.volume = 0.3;
    audio.play().catch(() => {});
  } catch {
    // Browser doesn't support Audio or path missing — ignore
  }
}

export function useNotifications() {
  const { isAuthenticated, user } = useAuth();
  const oauthFlowActive = useOAuthFlowActive();
  const queryClient = useQueryClient();
  const userId = user?.id;

  // ─── Supabase Realtime subscription (instant delivery) ───

  const subscriptions: RealtimeSubscription[] = useMemo(() => {
    if (!userId) return [];
    return [
      {
        table: "notifications",
        events: ["INSERT"] as const,
        filter: `user_id=eq.${userId}`,
      },
    ];
  }, [userId]);

  // Track whether we've done the initial fetch to avoid playing sound on mount
  const initialFetchDone = useRef(false);

  useSupabaseRealtime({
    channelName: `notifications-${userId ?? "anon"}`,
    subscriptions,
    onEvent: () => {
      // Invalidate React Query cache — triggers instant refetch
      queryClient.invalidateQueries({ queryKey: ["notifications"] });

      // Play sound only after initial data has loaded
      if (initialFetchDone.current) {
        playNotificationSound();
      }
    },
    enabled: isAuthenticated && !!userId && !oauthFlowActive,
  });

  // ─── React Query: initial fetch + polling fallback ───

  const { data: notifications = [], isLoading } = useQuery<NotificationItem[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const response = await fetch("/api/notifications", {
        credentials: "include",
      });
      if (!response.ok) {
        // Return empty array if endpoint doesn't exist or unauthorized
        if (response.status === 401 || response.status === 404) return [];
        throw new Error("Failed to fetch notifications");
      }
      return response.json();
    },
    enabled: isAuthenticated && !oauthFlowActive,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 120_000, // 2 minutes (Realtime handles instant, polling is fallback)
    retry: false, // Don't retry failed requests (prevents 404 spam)
  });

  // Mark initial fetch as done once we have data (or empty array)
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      initialFetchDone.current = true;
    }
  }, [isLoading, isAuthenticated]);

  // ─── Mutations ───

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to mark as read");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to mark all as read");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    isLoading,
    unreadCount,
    markAsRead: (id: string) => markAsReadMutation.mutate(id),
    markAllAsRead: () => markAllAsReadMutation.mutate(),
  };
}
