"use client";

import { useEffect, useState, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

/**
 * Polls online status for a set of user IDs every 15 seconds.
 * Returns a Map<userId, isOnline>.
 */
export function useOnlineStatus(userIds: string[]) {
  const [statusMap, setStatusMap] = useState<Map<string, boolean>>(new Map());
  const idsRef = useRef(userIds);
  idsRef.current = userIds;

  useEffect(() => {
    if (userIds.length === 0) return;

    const load = async () => {
      const ids = idsRef.current;
      if (ids.length === 0) return;

      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase
          .from("profiles")
          .select("id, is_online")
          .in("id", ids);

        if (data) {
          const map = new Map<string, boolean>();
          for (const row of data) {
            map.set(row.id, row.is_online);
          }
          setStatusMap(map);
        }
      } catch {
        // ignore
      }
    };

    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [userIds.join(",")]); // re-setup when user list changes

  return statusMap;
}
