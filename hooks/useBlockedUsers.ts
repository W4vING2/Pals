"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { CACHE_TTL, useAppDataStore, useAuthStore } from "@/lib/store";
import { dedupeRequest, getCachedQuery, isCacheFresh, setCachedQuery } from "@/lib/cache";

const BLOCKED_CACHE_KEY = "blocked-users";

export function useBlockedUsers() {
  const { user } = useAuthStore();
  const blockedIdsArray = useAppDataStore((s) => s.blockedIds);
  const blockedLoadedAt = useAppDataStore((s) => s.blockedLoadedAt);
  const setCachedBlockedIds = useAppDataStore((s) => s.setBlockedIds);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(
    () => new Set(blockedIdsArray)
  );
  const [loading, setLoading] = useState(blockedIdsArray.length === 0);

  useEffect(() => {
    setBlockedIds(new Set(blockedIdsArray));
    if (blockedLoadedAt > 0) setLoading(false);
  }, [blockedIdsArray, blockedLoadedAt]);

  const loadBlocked = useCallback(async (force = false) => {
    if (!user) {
      setLoading(false);
      setCachedBlockedIds([]);
      return;
    }

    const memoryFresh = Date.now() - blockedLoadedAt < CACHE_TTL.blockedUsers;
    if (!force && blockedLoadedAt > 0 && memoryFresh) {
      setLoading(false);
      return;
    }

    if (!force && blockedLoadedAt === 0) {
      const cached = await getCachedQuery<string[]>(user.id, BLOCKED_CACHE_KEY);
      if (cached?.value) {
        setCachedBlockedIds(cached.value, cached.updated_at);
        setBlockedIds(new Set(cached.value));
        setLoading(false);
        if (isCacheFresh(cached)) return;
      }
    }

    if (blockedIdsArray.length === 0) setLoading(true);
    const supabase = getSupabaseBrowserClient();
    const ids = await dedupeRequest(`${user.id}:${BLOCKED_CACHE_KEY}`, async () => {
      const { data } = await supabase
        .from("blocked_users")
        .select("blocked_id")
        .eq("blocker_id", user.id);
      return data?.map((d) => d.blocked_id) ?? [];
    });
    setCachedBlockedIds(ids);
    setBlockedIds(new Set(ids));
    void setCachedQuery(user.id, BLOCKED_CACHE_KEY, ids, CACHE_TTL.blockedUsers);
    setLoading(false);
  }, [blockedIdsArray, blockedLoadedAt, setCachedBlockedIds, user]);

  useEffect(() => { loadBlocked(); }, [loadBlocked]);

  const blockUser = useCallback(async (blockedId: string) => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    await supabase.from("blocked_users").insert({ blocker_id: user.id, blocked_id: blockedId });
    await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", blockedId);
    await supabase.from("follows").delete().eq("follower_id", blockedId).eq("following_id", user.id);
    const next = [...new Set([...blockedIdsArray, blockedId])];
    setCachedBlockedIds(next);
    setBlockedIds(new Set(next));
    void setCachedQuery(user.id, BLOCKED_CACHE_KEY, next, CACHE_TTL.blockedUsers);
  }, [blockedIdsArray, setCachedBlockedIds, user]);

  const unblockUser = useCallback(async (blockedId: string) => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    await supabase.from("blocked_users").delete().eq("blocker_id", user.id).eq("blocked_id", blockedId);
    const next = blockedIdsArray.filter((id) => id !== blockedId);
    setCachedBlockedIds(next);
    setBlockedIds(new Set(next));
    void setCachedQuery(user.id, BLOCKED_CACHE_KEY, next, CACHE_TTL.blockedUsers);
  }, [blockedIdsArray, setCachedBlockedIds, user]);

  const isBlocked = useCallback((userId: string) => blockedIds.has(userId), [blockedIds]);

  return { blockedIds, loading, blockUser, unblockUser, isBlocked, loadBlocked };
}
