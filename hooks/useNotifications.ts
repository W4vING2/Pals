"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore, useNotificationStore } from "@/lib/store";
import type { Notification } from "@/lib/supabase";

export function useNotifications() {
  const { user } = useAuthStore();
  const { setUnreadCount, incrementUnread } = useNotificationStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const supabase = getSupabaseBrowserClient();

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      // Enrich with actor profiles separately
      const notifs = data as Notification[];
      const actorIds = [...new Set(notifs.map((n) => n.actor_id))];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("*")
        .in("id", actorIds);
      const profilesMap = new Map((profilesData ?? []).map((p) => [p.id, p]));
      const enriched: Notification[] = notifs.map((n) => ({
        ...n,
        profiles: profilesMap.get(n.actor_id) as Notification["profiles"],
      }));
      setNotifications(enriched);
      const unread = enriched.filter((n) => !n.is_read).length;
      setUnreadCount(unread);
    }
    setLoading(false);
  }, [user, setUnreadCount]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      const supabase = getSupabaseBrowserClient();
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId);

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
    },
    []
  );

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [user, setUnreadCount]);

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

          setNotifications((prev) => [enriched, ...prev]);
          incrementUnread();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, incrementUnread]);

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
