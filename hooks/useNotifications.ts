"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  CACHE_TTL,
  useAppDataStore,
  useAuthStore,
  useNotificationStore,
} from "@/lib/store";
import { dedupeRequest, getCachedQuery, isCacheFresh, setCachedQuery } from "@/lib/cache";
import type { Notification } from "@/lib/supabase";

const NOTIFICATIONS_CACHE_KEY = "notifications";

export function useNotifications() {
  const { user } = useAuthStore();
  const { setUnreadCount, incrementUnread } = useNotificationStore();
  const notifications = useAppDataStore((s) => s.notifications);
  const notificationsLoadedAt = useAppDataStore((s) => s.notificationsLoadedAt);
  const setCachedNotifications = useAppDataStore((s) => s.setNotifications);
  const upsertNotification = useAppDataStore((s) => s.upsertNotification);
  const markCachedNotificationRead = useAppDataStore((s) => s.markNotificationRead);
  const markAllCachedNotificationsRead = useAppDataStore((s) => s.markAllNotificationsRead);
  const [loading, setLoading] = useState(notifications.length === 0);

  const persistNotifications = useCallback((items: Notification[]) => {
    if (!user) return;
    void setCachedQuery(
      user.id,
      NOTIFICATIONS_CACHE_KEY,
      items,
      CACHE_TTL.notifications
    );
  }, [user]);

  const loadNotifications = useCallback(async (force = false) => {
    if (!user) return;

    const memoryFresh = Date.now() - notificationsLoadedAt < CACHE_TTL.notifications;
    if (!force && notificationsLoadedAt > 0 && memoryFresh) {
      setLoading(false);
      return;
    }

    if (!force && notificationsLoadedAt === 0) {
      const cached = await getCachedQuery<Notification[]>(
        user.id,
        NOTIFICATIONS_CACHE_KEY
      );
      if (cached?.value) {
        setCachedNotifications(cached.value, cached.updated_at);
        setUnreadCount(cached.value.filter((n) => !n.is_read).length);
        setLoading(false);
        if (isCacheFresh(cached)) return;
      }
    }

    if (notifications.length === 0 && notificationsLoadedAt === 0) setLoading(true);
    const supabase = getSupabaseBrowserClient();

    const enriched = await dedupeRequest(
      `${user.id}:${NOTIFICATIONS_CACHE_KEY}`,
      async () => {
        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error || !data) return null;

        const notifs = data as Notification[];
        const actorIds = [...new Set(notifs.map((n) => n.actor_id))];
        const { data: profilesData } = actorIds.length > 0
          ? await supabase.from("profiles").select("*").in("id", actorIds)
          : { data: [] };
        const profilesMap = new Map((profilesData ?? []).map((p) => [p.id, p]));
        return notifs.map((n) => ({
          ...n,
          profiles: profilesMap.get(n.actor_id) as Notification["profiles"],
        }));
      }
    );

    if (enriched) {
      setCachedNotifications(enriched);
      const unread = enriched.filter((n) => !n.is_read).length;
      setUnreadCount(unread);
      persistNotifications(enriched);
    }
    setLoading(false);
  }, [
    notifications,
    notificationsLoadedAt,
    persistNotifications,
    setCachedNotifications,
    setUnreadCount,
    user,
  ]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      const supabase = getSupabaseBrowserClient();
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId);

      markCachedNotificationRead(notificationId);
      const next = notifications.map((n) =>
        n.id === notificationId ? { ...n, is_read: true } : n
      );
      setUnreadCount(next.filter((n) => !n.is_read).length);
      persistNotifications(next);
    },
    [markCachedNotificationRead, notifications, persistNotifications, setUnreadCount]
  );

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    markAllCachedNotificationsRead();
    persistNotifications(notifications.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [markAllCachedNotificationsRead, notifications, persistNotifications, user, setUnreadCount]);

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const notification = payload.new as Notification;

          // Fetch actor profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", notification.actor_id)
            .single();

          const enriched: Notification = {
            ...notification,
            profiles: (profile ?? undefined) as Notification["profiles"],
          };

          upsertNotification(enriched);
          const current = useAppDataStore.getState().notifications;
          persistNotifications([
            enriched,
            ...current.filter((item) => item.id !== enriched.id),
          ]);
          incrementUnread();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [incrementUnread, persistNotifications, upsertNotification, user]);

  useEffect(() => {
    if (user) {
      loadNotifications();
    }
  }, [user, loadNotifications]);

  return {
    notifications,
    loading,
    loadNotifications,
    markAsRead,
    markAllAsRead,
  };
}
