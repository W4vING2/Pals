"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";

const HEARTBEAT_INTERVAL = 55_000; // 55 seconds (cron cleans up after 2 min)

export function usePresence() {
  const { user } = useAuthStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const supabase = getSupabaseBrowserClient();

    // Cache the access token for beforeunload
    const cacheToken = async () => {
      const { data } = await supabase.auth.getSession();
      tokenRef.current = data?.session?.access_token ?? null;
    };
    cacheToken();

    const goOnline = async () => {
      try {
        await supabase
          .from("profiles")
          .update({ is_online: true, last_seen: new Date().toISOString() })
          .eq("id", user.id);
      } catch { /* ignore */ }
    };

    const goOffline = async () => {
      try {
        await supabase
          .from("profiles")
          .update({ is_online: false, last_seen: new Date().toISOString() })
          .eq("id", user.id);
      } catch { /* ignore */ }
    };

    // Go online immediately
    goOnline();

    // Heartbeat
    intervalRef.current = setInterval(goOnline, HEARTBEAT_INTERVAL);

    // Go offline on tab close — use fetch with keepalive + auth token
    const handleBeforeUnload = () => {
      const token = tokenRef.current || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`;
      const body = JSON.stringify({ is_online: false, last_seen: new Date().toISOString() });
      try {
        fetch(url, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
            "Authorization": `Bearer ${token}`,
            "Prefer": "return=minimal",
          },
          body,
          keepalive: true,
        });
      } catch { /* ignore */ }
    };

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        goOnline();
      } else {
        // Mark offline immediately via supabase client (works better on Android)
        goOffline();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      goOffline();
    };
  }, [user]);
}
