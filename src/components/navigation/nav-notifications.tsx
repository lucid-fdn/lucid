"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useNotifications,
  type NotificationItem,
} from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffS = Math.floor((now - then) / 1000);

  if (diffS < 60) return "just now";

  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m`;

  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h`;

  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;

  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const SEVERITY_CONFIG: Record<
  NonNullable<NotificationItem["severity"]>,
  { icon: typeof Info; className: string }
> = {
  error: { icon: AlertTriangle, className: "text-destructive" },
  warning: { icon: AlertCircle, className: "text-amber-500" },
  success: { icon: CheckCircle2, className: "text-emerald-500" },
  info: { icon: Info, className: "text-blue-500" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NavNotifications() {
  const router = useRouter();
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    unreadCount,
  } = useNotifications();
  const [open, setOpen] = useState(false);

  // Track previous unread count so we can trigger a shake on increase.
  const prevUnreadRef = useRef(unreadCount);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      setShake(true);
      const timer = setTimeout(() => setShake(false), 600);
      return () => clearTimeout(timer);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  // After shake animation ends, sync the ref so next increase triggers again.
  useEffect(() => {
    if (!shake) {
      prevUnreadRef.current = unreadCount;
    }
  }, [shake, unreadCount]);

  const handleNotificationClick = (
    notificationId: string,
    href?: string,
  ) => {
    markAsRead(notificationId);
    if (href) {
      router.push(href);
      setOpen(false);
    }
  };

  const handleViewAll = () => {
    router.push("/settings/notifications");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hover:bg-accent"
          aria-label="Notifications"
        >
          <Bell
            className={cn(
              "h-5 w-5 transition-transform duration-200",
              unreadCount > 0 && "animate-[pulse_2s_ease-in-out_infinite]",
              shake && "animate-bell-shake",
            )}
          />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-[18px] min-w-[18px] flex items-center justify-center rounded-full p-0 text-[10px] leading-none font-semibold pointer-events-none"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-96 p-0" align="end" sideOffset={8}>
        {/* ---- Header ---- */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">Notifications</h4>
            {unreadCount > 0 && (
              <Badge
                variant="secondary"
                className="h-5 min-w-5 flex items-center justify-center rounded-full px-1.5 text-[10px] font-medium"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllAsRead()}
            >
              Mark all read
            </Button>
          )}
        </div>

        {/* ---- Notification list ---- */}
        <ScrollArea className="max-h-[480px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/25 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                All caught up
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                No new notifications
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification: NotificationItem) => {
                const severityKey = notification.severity ?? legacySeverityFromType(notification.type);
                const severity = SEVERITY_CONFIG[severityKey];
                const SeverityIcon = severity.icon;

                return (
                  <button
                    key={notification.id}
                    onClick={() =>
                      handleNotificationClick(
                        notification.id,
                        notification.href,
                      )
                    }
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-accent/50",
                      !notification.read && "bg-accent/30",
                    )}
                  >
                    {/* Severity icon */}
                    <div
                      className={cn(
                        "mt-0.5 flex-shrink-0 rounded-full p-1",
                        severity.className,
                      )}
                    >
                      <SeverityIcon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium leading-tight truncate">
                          {notification.title}
                        </p>
                        {notification.org_name && (
                          <Badge
                            variant="outline"
                            className="flex-shrink-0 text-[10px] px-1.5 py-0 h-4"
                          >
                            {notification.org_name}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {notification.message}
                      </p>
                      <p className="text-[11px] text-muted-foreground/60">
                        {formatRelativeTime(notification.created_at)}
                      </p>
                    </div>

                    {/* Unread dot */}
                    {!notification.read && (
                      <div className="mt-2 flex-shrink-0">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* ---- Footer ---- */}
        {notifications.length > 0 && (
          <div className="border-t border-border p-1.5">
            <Button
              variant="ghost"
              className="w-full h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleViewAll}
            >
              View all
            </Button>
          </div>
        )}
      </PopoverContent>

    </Popover>
  );
}

function legacySeverityFromType(type: string): NonNullable<NotificationItem["severity"]> {
  if (type === "error" || type === "success" || type === "warning" || type === "info") return type;
  return "info";
}
