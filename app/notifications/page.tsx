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
  Inbox,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/Button";
import { PageTransition } from "@/components/layout/PageTransition";
import { AnimatedList } from "@/components/shared/AnimatedList";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/supabase";
import {
  useNotificationPreferencesStore,
  type NotificationView,
} from "@/lib/store";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "сейчас";
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  return `${Math.floor(hours / 24)} дн. назад`;
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
    "Кто-то";
  switch (notification.type) {
    case "like":
      return `${name} оценил(а) ваш пост`;
    case "comment":
      return `${name} оставил(а) комментарий`;
    case "follow":
      return `${name} подписался(-ась) на вас`;
    case "mention":
      return `${name} упомянул(а) вас в посте`;
    default:
      return "Новое уведомление";
  }
}

function getNotificationHref(notification: Notification): string {
  if (notification.post_id) return `/posts/${notification.post_id}`;
  if (notification.profiles?.username)
    return `/profile/${notification.profiles.username}`;
  return "/notifications";
}

function matchesNotificationView(
  notification: Notification,
  view: NotificationView
): boolean {
  if (view === "all") return true;
  if (view === "important") {
    return !notification.is_read || notification.type === "mention";
  }
  if (view === "conversations") {
    return notification.type === "comment" || notification.type === "mention";
  }
  return notification.type === "like" || notification.type === "follow";
}

const VIEWS: Array<{
  id: NotificationView;
  label: string;
  description: string;
}> = [
  {
    id: "important",
    label: "Важное",
    description: "Непрочитанное и упоминания",
  },
  {
    id: "conversations",
    label: "Общение",
    description: "Комментарии и диалоги вокруг контента",
  },
  {
    id: "activity",
    label: "Активность",
    description: "Лайки и новые подписки",
  },
  {
    id: "all",
    label: "Все",
    description: "Полная история уведомлений",
  },
];

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
  const view = useNotificationPreferencesStore((s) => s.view);
  const setView = useNotificationPreferencesStore((s) => s.setView);
  const { notifications, loading, markAsRead, markAllAsRead } =
    useNotifications();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [user, authLoading, router]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const visibleNotifications = notifications.filter((notification) =>
    matchesNotificationView(notification, view)
  );
  const unreadVisible = visibleNotifications.filter((n) => !n.is_read);
  const readVisible = visibleNotifications.filter((n) => n.is_read);

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold font-display text-[var(--text-primary)]">
                Inbox
              </h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Уведомления разложены по смыслу, чтобы важное не терялось в фоне.
              </p>
            </div>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                Прочитать все
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {VIEWS.map((item) => {
              const count = notifications.filter((notification) =>
                matchesNotificationView(notification, item.id)
              ).length;
              const isActive = item.id === view;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition-colors",
                    isActive
                      ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10"
                      : "border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {item.label}
                    </span>
                    <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                      {count}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {item.description}
                  </p>
                </button>
              );
            })}
          </div>
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
                Всё прочитано!
              </p>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Пока нет уведомлений
              </p>
            </div>
          </div>
        )}

        {!loading && notifications.length > 0 && visibleNotifications.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-[var(--border)] bg-[var(--bg-surface)] px-6 py-16 text-center">
            <Inbox className="h-14 w-14 text-[var(--text-secondary)] opacity-20" />
            <div>
              <p className="font-semibold text-[var(--text-primary)]">
                В этой вкладке пока пусто
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Попробуйте переключиться на другой режим inbox.
              </p>
            </div>
          </div>
        )}

        {!loading && visibleNotifications.length > 0 && (
          <div className="space-y-4">
            {unreadVisible.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                    Непрочитанные
                  </h2>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {unreadVisible.length}
                  </span>
                </div>
                <AnimatedList className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] overflow-hidden">
                  {unreadVisible.map((notification, idx) => {
                    const href = getNotificationHref(notification);
                    const actorProfile = notification.profiles;

                    return (
                      <Link
                        key={notification.id}
                        href={href}
                        onClick={() => markAsRead(notification.id)}
                        className={cn(
                          "flex items-start gap-3 p-4 hover:bg-[var(--bg-elevated)] transition-colors border-l-2 border-l-[var(--accent-blue)] bg-[var(--accent-blue)]/5",
                          idx < unreadVisible.length - 1 &&
                            "border-b border-[var(--border)]"
                        )}
                      >
                        {actorProfile?.avatar_url ? (
                          <img
                            src={actorProfile.avatar_url}
                            alt={
                              actorProfile.display_name ??
                              actorProfile.username ??
                              "User"
                            }
                            className="w-9 h-9 rounded-full object-cover shrink-0"
                            loading="lazy"
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
                        <NotificationIcon type={notification.type} />
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
              </section>
            )}

            {readVisible.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                    Остальное
                  </h2>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {readVisible.length}
                  </span>
                </div>
                <AnimatedList className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] overflow-hidden">
                  {readVisible.map((notification, idx) => {
                    const href = getNotificationHref(notification);
                    const actorProfile = notification.profiles;

                    return (
                      <Link
                        key={notification.id}
                        href={href}
                        className={cn(
                          "flex items-start gap-3 p-4 hover:bg-[var(--bg-elevated)] transition-colors",
                          idx < readVisible.length - 1 &&
                            "border-b border-[var(--border)]"
                        )}
                      >
                        {actorProfile?.avatar_url ? (
                          <img
                            src={actorProfile.avatar_url}
                            alt={
                              actorProfile.display_name ??
                              actorProfile.username ??
                              "User"
                            }
                            className="w-9 h-9 rounded-full object-cover shrink-0"
                            loading="lazy"
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
                        <NotificationIcon type={notification.type} />
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
              </section>
            )}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
