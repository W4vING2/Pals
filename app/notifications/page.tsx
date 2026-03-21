"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
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
          <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
        </div>
      );
    case "comment":
      return (
        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
          </svg>
        </div>
      );
    case "follow":
      return (
        <div className="w-8 h-8 rounded-full bg-[var(--accent-mint)]/10 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-[var(--accent-mint)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
      );
    case "mention":
      return (
        <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.92 7.94" />
          </svg>
        </div>
      );
    default:
      return null;
  }
}

function getNotificationText(notification: Notification): string {
  const name = notification.profiles?.display_name ?? notification.profiles?.username ?? "Someone";
  switch (notification.type) {
    case "like": return `${name} liked your post`;
    case "comment": return `${name} commented on your post`;
    case "follow": return `${name} started following you`;
    case "mention": return `${name} mentioned you in a post`;
    default: return "New notification";
  }
}

function getNotificationHref(notification: Notification): string {
  if (notification.post_id) return `/posts/${notification.post_id}`;
  if (notification.profiles?.username) return `/profile/${notification.profiles.username}`;
  return "/notifications";
}

export default function NotificationsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { notifications, loading, markAsRead, markAllAsRead } = useNotifications();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [user, authLoading, router]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display text-[var(--text-primary)]">Notifications</h1>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllAsRead}>
            Mark all read
          </Button>
        )}
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-4 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]">
              <div className="skeleton w-8 h-8 rounded-full" />
              <div className="skeleton w-8 h-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3.5 w-48 rounded" />
                <div className="skeleton h-3 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <svg className="w-16 h-16 text-[var(--text-secondary)]/20" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M48 21.33A16 16 0 0016 32c0 18.67-8 24-8 24h48s-8-5.33-8-24" />
            <path d="M36.18 56a4 4 0 01-8 0" />
          </svg>
          <div>
            <p className="font-semibold text-[var(--text-primary)]">All caught up!</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">No notifications yet</p>
          </div>
        </div>
      )}

      {!loading && notifications.length > 0 && (
        <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] overflow-hidden">
          {notifications.map((notification, idx) => {
            const href = getNotificationHref(notification);
            const actorProfile = notification.profiles;

            return (
              <Link
                key={notification.id}
                href={href}
                onClick={() => !notification.is_read && markAsRead(notification.id)}
                className={[
                  "flex items-start gap-3 p-4 hover:bg-[var(--bg-elevated)] transition-colors",
                  idx < notifications.length - 1 ? "border-b border-[var(--border)]" : "",
                  !notification.is_read ? "bg-[var(--accent-blue)]/5" : "",
                ].join(" ")}
              >
                {/* Unread dot */}
                <div className="w-2 h-2 mt-1.5 shrink-0">
                  {!notification.is_read && (
                    <span className="block w-2 h-2 rounded-full bg-[var(--accent-blue)]" />
                  )}
                </div>

                {/* Actor avatar */}
                <Avatar
                  src={actorProfile?.avatar_url}
                  name={actorProfile?.display_name ?? actorProfile?.username ?? "?"}
                  size="sm"
                />

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
        </div>
      )}
    </div>
  );
}
