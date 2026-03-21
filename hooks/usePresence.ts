"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";

const HEARTBEAT_INTERVAL = 60_000; // 60 seconds (reduced frequency)

export function usePresence() {
  const { user } = useAuthStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;

    const supabase = getSupabaseBrowserClient();

    const goOnline = async () => {
      try {
        await supabase
          .from("profiles")
          .update({ is_online: true, last_seen: new Date().toISOString() })
          .eq("id", user.id);
      } catch {
        // Silently ignore — connection might be temporarily lost
      }
    };

    const goOffline = async () => {
      try {
        await supabase
          .from("profiles")
          .update({ is_online: false, last_seen: new Date().toISOString() })
          .eq("id", user.id);
      } catch {
        // Silently ignore
      }
    };

    // Go online immediately
    goOnline();

    // Heartbeat to keep online status fresh
    intervalRef.current = setInterval(goOnline, HEARTBEAT_INTERVAL);

    // Go offline on tab close
    const handleBeforeUnload = () => {
      // Use sendBeacon — only reliable method during page unload
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`;
      const body = JSON.stringify({ is_online: false, last_seen: new Date().toISOString() });
      navigator.sendBeacon?.(
        url,
        new Blob([body], { type: "application/json" })
      );
    };

    // Handle visibility change (tab switch)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        goOnline();
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
