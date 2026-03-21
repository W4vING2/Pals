"use client";

import { useEffect, useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore, useUnreadMessagesStore, useNotificationStore } from "@/lib/store";

/**
 * Global hook: loads initial unread counts and subscribes to realtime
 * updates for message badges in the nav.
 * Notification badges are handled by useNotifications.
 */
export function useRealtimeBadges() {
  const { user } = useAuthStore();
  const { setUnreadMessagesCount } = useUnreadMessagesStore();
  const { setUnreadCount } = useNotificationStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadUnreadMessages = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("conversation_participants")
      .select("unread_count")
      .eq("user_id", user.id);

    if (data) {
      const total = data.reduce(
        (sum, row) => sum + (row.unread_count ?? 0),
        0
      );
      setUnreadMessagesCount(total);
    }
  }, [user, setUnreadMessagesCount]);

  const loadUnreadNotifications = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    setUnreadCount(count ?? 0);
  }, [user, setUnreadCount]);

  // Initial loads
  useEffect(() => {
    loadUnreadMessages();
    loadUnreadNotifications();
  }, [loadUnreadMessages, loadUnreadNotifications]);

  // Realtime: only unread messages badge (debounced)
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();

    const debouncedReload = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => loadUnreadMessages(), 1000);
    };

    const channel = supabase
      .channel(`badges:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
          filter: `user_id=eq.${user.id}`,
        },
        debouncedReload
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, loadUnreadMessages]);
}
