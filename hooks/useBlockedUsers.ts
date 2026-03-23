"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";

export function useBlockedUsers() {
  const { user } = useAuthStore();
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadBlocked = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("blocked_users")
      .select("blocked_id")
      .eq("blocker_id", user.id);
    if (data) setBlockedIds(new Set(data.map((d: any) => d.blocked_id)));
    setLoading(false);
  }, [user]);

  useEffect(() => { loadBlocked(); }, [loadBlocked]);

  const blockUser = useCallback(async (blockedId: string) => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    await supabase.from("blocked_users").insert({ blocker_id: user.id, blocked_id: blockedId });
    await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", blockedId);
    await supabase.from("follows").delete().eq("follower_id", blockedId).eq("following_id", user.id);
    setBlockedIds((prev) => new Set([...prev, blockedId]));
  }, [user]);

  const unblockUser = useCallback(async (blockedId: string) => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    await supabase.from("blocked_users").delete().eq("blocker_id", user.id).eq("blocked_id", blockedId);
    setBlockedIds((prev) => { const next = new Set(prev); next.delete(blockedId); return next; });
  }, [user]);

  const isBlocked = useCallback((userId: string) => blockedIds.has(userId), [blockedIds]);

  return { blockedIds, loading, blockUser, unblockUser, isBlocked, loadBlocked };
}
