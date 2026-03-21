"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Heart,
  MessageCircle,
  UserPlus,
  AtSign,
  Bell,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/Button";
import { PageTransition } from "@/components/layout/PageTransition";
import { AnimatedList } from "@/components/shared/AnimatedList";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/supabase";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function NotificationIcon({ type }: { type: Notification["type"] }) {
  switch (type) {
    case "like":
      return (
        <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
          <Heart className="w-4 h-4 text-red-400" />
        </div>
      );
    case "comment":
      return (
        <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
          <MessageCircle className="w-4 h-4 text-purple-400" />
        </div>
      );
    case "follow":
      return (
        <div className="w-8 h-8 rounded-full bg-[var(--accent-mint)]/10 flex items-center justify-center shrink-0">
          <UserPlus className="w-4 h-4 text-[var(--accent-mint)]" />
        </div>
      );
    case "mention":
      return (
        <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
          <AtSign className="w-4 h-4 text-purple-400" />
        </div>
      );
    default:
      return null;
  }
}

function getNotificationText(notification: Notification): string {
  const name =
    notification.profiles?.display_name ??
    notification.profiles?.username ??
    "Someone";
  switch (notification.type) {
    case "like":
      return `${name} liked your post`;
    case "comment":
      return `${name} commented on your post`;
    case "follow":
      return `${name} started following you`;
    case "mention":
      return `${name} mentioned you in a post`;
    default:
      return "New notification";
  }
}

function getNotificationHref(notification: Notification): string {
  if (notification.post_id) return `/posts/${notification.post_id}`;
  if (notification.profiles?.username)
    return `/profile/${notification.profiles.username}`;
  return "/notifications";
}

function SkeletonNotification() {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="w-2 h-2 shrink-0" />
      <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] animate-pulse shrink-0" />
      <div className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-48 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-3 w-24 rounded bg-[var(--bg-elevated)] animate-pulse" />
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { notifications, loading, markAsRead, markAllAsRead } =
    useNotifications();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [user, authLoading, router]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold font-display text-[var(--text-primary)]">
            Notifications
          </h1>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              Mark all read
            </Button>
          )}
        </div>

        {loading && (
          <div className="space-y-0 bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonNotification key={i} />
            ))}
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Bell className="w-16 h-16 text-[var(--text-secondary)] opacity-20" />
            <div>
              <p className="font-semibold text-[var(--text-primary)]">
                All caught up!
              </p>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                No notifications yet
              </p>
            </div>
          </div>
        )}

        {!loading && notifications.length > 0 && (
          <AnimatedList className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] overflow-hidden">
            {notifications.map((notification, idx) => {
              const href = getNotificationHref(notification);
              const actorProfile = notification.profiles;

              return (
                <Link
                  key={notification.id}
                  href={href}
                  onClick={() =>
                    !notification.is_read && markAsRead(notification.id)
                  }
                  className={cn(
                    "flex items-start gap-3 p-4 hover:bg-[var(--bg-elevated)] transition-colors",
                    idx < notifications.length - 1 &&
                      "border-b border-[var(--border)]",
                    !notification.is_read &&
                      "border-l-2 border-l-[var(--accent-blue)] bg-[var(--accent-blue)]/5"
                  )}
                >
                  {/* Actor avatar */}
                  {actorProfile?.avatar_url ? (
                    <img
                      src={actorProfile.avatar_url}
                      alt={
                        actorProfile.display_name ??
                        actorProfile.username ??
                        "User"
                      }
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-emerald-500 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                      {(
                        actorProfile?.display_name ??
                        actorProfile?.username ??
                        "?"
                      )[0]?.toUpperCase()}
                    </div>
                  )}

                  {/* Type icon */}
                  <NotificationIcon type={notification.type} />

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)]">
                      {getNotificationText(notification)}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {timeAgo(notification.created_at)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </AnimatedList>
        )}
      </div>
    </PageTransition>
  );
}
