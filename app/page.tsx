"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlignJustify,
  ArrowUp,
  PanelsTopLeft,
  RefreshCw,
  TrendingUp,
  Users as UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { FeedList } from "@/components/feed/FeedList";
import { PageTransition } from "@/components/layout/PageTransition";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { StoryCircles } from "@/components/stories/StoryCircles";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { AnimatedList } from "@/components/shared/AnimatedList";
import { PostCard } from "@/components/feed/PostCard";
import {
  CACHE_TTL,
  useAppDataStore,
  useAuthStore,
  useCreatePostStore,
  useFeedPreferencesStore,
  useQuickActionStore,
} from "@/lib/store";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import {
  cachePosts,
  dedupeRequest,
  getCachedPosts,
  getCachedQuery,
  isCacheFresh,
  safeCache,
  setCachedQuery,
} from "@/lib/cache";
import type { Post, Profile, Story } from "@/lib/supabase";
import { filterVisiblePosts } from "@/lib/postVisibility";

const PAGE_SIZE = 10;

type FeedTab = "following" | "trending";

type FollowingFeedCache = {
  posts: Post[];
  likedPostIds: string[];
  cursor: string | null;
  hasMore: boolean;
};

type TrendingFeedCache = {
  posts: Post[];
  recommendedUsers: Profile[];
  followedIds: string[];
};

const FOLLOWING_FEED_CACHE_KEY = "feed:following";
const TRENDING_FEED_CACHE_KEY = "feed:trending";

export default function FeedPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { user: storeUser } = useAuthStore();
  const { blockedIds } = useBlockedUsers();
  const cachedFollowingPosts = useAppDataStore((s) => s.followingPosts);
  const cachedTrendingPosts = useAppDataStore((s) => s.trendingPosts);
  const cachedRecommendedUsers = useAppDataStore((s) => s.recommendedUsers);
  const cachedLikedPostIds = useAppDataStore((s) => s.likedPostIds);
  const feedLoadedAt = useAppDataStore((s) => s.feedLoadedAt);
  const trendingLoadedAt = useAppDataStore((s) => s.trendingLoadedAt);
  const setCachedFollowingPosts = useAppDataStore((s) => s.setFollowingPosts);
  const setCachedTrendingData = useAppDataStore((s) => s.setTrendingData);
  const setCachedLikedPostIds = useAppDataStore((s) => s.setLikedPostIds);
  const removeCachedLikedPostId = useAppDataStore((s) => s.removeLikedPostId);
  const patchCachedPostCounts = useAppDataStore((s) => s.patchPostCounts);
  const removeCachedPost = useAppDataStore((s) => s.removePost);

  // Tab state
  const [tab, setTab] = useState<FeedTab>("trending");

  // Following feed state
  const [posts, setPosts] = useState<Post[]>(cachedFollowingPosts);
  const [loading, setLoading] = useState(cachedFollowingPosts.length === 0);
  const [hasMore, setHasMore] = useState(true);
  const [newPostCount, setNewPostCount] = useState(0);
  const cursorRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(
    () => new Set(cachedLikedPostIds)
  );

  // Trending state
  const [trendingPosts, setTrendingPosts] = useState<Post[]>(cachedTrendingPosts);
  const [trendingLoading, setTrendingLoading] = useState(cachedTrendingPosts.length === 0);
  const hasTrendingRef = useRef(false);
  const [recommendedUsers, setRecommendedUsers] = useState<Profile[]>(cachedRecommendedUsers);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  // Stories
  const [viewerStories, setViewerStories] = useState<Story[] | null>(null);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const [storiesKey, setStoriesKey] = useState(0);
  const { density, setDensity } = useFeedPreferencesStore();
  const setCreatePostOpen = useCreatePostStore((s) => s.setOpen);
  const setCreateStoryOpen = useQuickActionStore((s) => s.setCreateStoryOpen);
  const storyRefreshKey = useQuickActionStore((s) => s.storyRefreshKey);

  useEffect(() => {
    if (cachedFollowingPosts.length > 0) {
      setPosts(cachedFollowingPosts);
      setLoading(false);
    }
  }, [cachedFollowingPosts]);

  useEffect(() => {
    if (cachedTrendingPosts.length > 0 || cachedRecommendedUsers.length > 0) {
      setTrendingPosts(cachedTrendingPosts);
      setRecommendedUsers(cachedRecommendedUsers);
      setTrendingLoading(false);
      hasTrendingRef.current = true;
    }
  }, [cachedRecommendedUsers, cachedTrendingPosts]);

  useEffect(() => {
    setLikedPostIds(new Set(cachedLikedPostIds));
  }, [cachedLikedPostIds]);

  // ── Following feed ─────────────────────────────────────────
  const loadPosts = useCallback(async (reset = false, force = false) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    if (reset && !force) {
      const memoryFresh = Date.now() - feedLoadedAt < CACHE_TTL.feed;
      if (feedLoadedAt > 0 && memoryFresh) {
        hasLoadedRef.current = true;
        setLoading(false);
        return;
      }
    }

    if (reset && !force && !hasLoadedRef.current && user) {
      const cached = await getCachedQuery<FollowingFeedCache>(
        user.id,
        FOLLOWING_FEED_CACHE_KEY
      );
      if (cached?.value) {
        setPosts(cached.value.posts);
        setCachedFollowingPosts(cached.value.posts, cached.updated_at);
        setHasMore(cached.value.hasMore);
        cursorRef.current = cached.value.cursor;
        setLikedPostIds(new Set(cached.value.likedPostIds));
        setCachedLikedPostIds(cached.value.likedPostIds);
        setLoading(false);
        hasLoadedRef.current = true;
        if (isCacheFresh(cached)) return;
      } else {
        // Legacy fallback from the old cache store.
        const cachedPosts = await safeCache(getCachedPosts, []);
        if (cachedPosts.length > 0) {
          setPosts(cachedPosts as Post[]);
          setCachedFollowingPosts(cachedPosts as Post[]);
          setLoading(false);
        } else {
          setLoading(true);
        }
      }
    } else if (posts.length === 0) {
      setLoading(true);
    }

    try {
      const data = await dedupeRequest(
        `${user?.id ?? "anon"}:${FOLLOWING_FEED_CACHE_KEY}:${reset ? "reset" : cursorRef.current ?? "next"}`,
        async () => {
          const followingResult = user
            ? await supabase
                .from("follows")
                .select("following_id")
                .eq("follower_id", user.id)
            : { data: [] };
          const followingIds = new Set(
            followingResult.data?.map((row) => row.following_id) ?? []
          );
          if (user?.id) followingIds.add(user.id);

          let query = supabase
            .from("posts")
            .select("*, profiles:user_id (id, username, display_name, avatar_url)")
            .order("created_at", { ascending: false })
            .limit(PAGE_SIZE);

          if (!reset && cursorRef.current) {
            query = query.lt("created_at", cursorRef.current);
          }

          const { data: postData, error } = await query;
          if (error || !postData) return null;

          return {
            rawPosts: postData as Post[],
            visiblePosts: filterVisiblePosts(
              (postData as Post[]).filter((post) => followingIds.has(post.user_id)),
              user?.id,
              followingIds
            ),
          };
        }
      );

      if (data) {
        const { rawPosts, visiblePosts } = data;
        if (reset) {
          setPosts(visiblePosts);
          setCachedFollowingPosts(visiblePosts);
          cursorRef.current =
            visiblePosts.length > 0
              ? visiblePosts[visiblePosts.length - 1].created_at
              : null;
        } else {
          setPosts((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const unique = visiblePosts.filter((p) => !existingIds.has(p.id));
            const next = [...prev, ...unique];
            setCachedFollowingPosts(next);
            return next;
          });
          if (visiblePosts.length > 0) {
            cursorRef.current = visiblePosts[visiblePosts.length - 1].created_at;
          }
        }
        const nextHasMore = rawPosts.length === PAGE_SIZE;
        setHasMore(nextHasMore);
        if (reset && visiblePosts.length > 0) {
          safeCache(() => cachePosts(visiblePosts), undefined);
        }

        if (user && visiblePosts.length > 0) {
          const postIds = visiblePosts.map((p) => p.id);
          const { data: likeData } = await supabase
            .from("likes")
            .select("post_id")
            .eq("user_id", user.id)
            .in("post_id", postIds);
          if (likeData) {
            const newLikedIds = new Set(likeData.map((l) => l.post_id));
            setLikedPostIds((prev) => {
              if (reset) {
                setCachedLikedPostIds(newLikedIds);
                return newLikedIds;
              }
              const merged = new Set(prev);
              newLikedIds.forEach((id) => merged.add(id));
              setCachedLikedPostIds(merged);
              return merged;
            });
            if (reset) {
              const cacheValue: FollowingFeedCache = {
                posts: visiblePosts,
                likedPostIds: [...newLikedIds],
                cursor: cursorRef.current,
                hasMore: nextHasMore,
              };
              void setCachedQuery(
                user.id,
                FOLLOWING_FEED_CACHE_KEY,
                cacheValue,
                CACHE_TTL.feed
              );
            }
          }
        }
      }
      hasLoadedRef.current = true;
    } catch (err) {
      console.warn("loadPosts failed:", err);
    }
    setLoading(false);
  }, [
    feedLoadedAt,
    posts.length,
    setCachedFollowingPosts,
    setCachedLikedPostIds,
    user,
  ]);

  // ── Trending feed ─────────────────────────────────────────
  const loadTrending = useCallback(async (force = false) => {
    if (!storeUser) return;

    const memoryFresh = Date.now() - trendingLoadedAt < CACHE_TTL.feed;
    if (!force && trendingLoadedAt > 0 && memoryFresh) {
      hasTrendingRef.current = true;
      setTrendingLoading(false);
      return;
    }

    if (!force && trendingPosts.length === 0 && recommendedUsers.length === 0) {
      const cached = await getCachedQuery<TrendingFeedCache>(
        storeUser.id,
        TRENDING_FEED_CACHE_KEY
      );
      if (cached?.value) {
        setTrendingPosts(cached.value.posts);
        setRecommendedUsers(cached.value.recommendedUsers);
        setFollowed(new Set(cached.value.followedIds));
        setCachedTrendingData(
          cached.value.posts,
          cached.value.recommendedUsers,
          cached.updated_at
        );
        setTrendingLoading(false);
        hasTrendingRef.current = true;
        if (isCacheFresh(cached)) return;
      }
    }

    if (trendingPosts.length === 0 && recommendedUsers.length === 0) {
      setTrendingLoading(true);
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const result = await dedupeRequest(`${storeUser.id}:${TRENDING_FEED_CACHE_KEY}`, async () => {
      const [postsResult, followingResult] = await Promise.all([
        supabase
          .from("posts")
          .select("*, profiles:user_id(id, username, display_name, avatar_url)")
          .gte("created_at", sevenDaysAgo)
          .order("likes_count", { ascending: false })
          .limit(20),
        supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", storeUser.id),
      ]);

      const followingIds = new Set(followingResult.data?.map((f) => f.following_id) ?? []);
      followingIds.add(storeUser.id);

      const nextTrendingPosts = postsResult.data
        ? filterVisiblePosts(postsResult.data as Post[], storeUser.id, followingIds)
        : [];

      const { data: allUsers } = await supabase
        .from("profiles")
        .select("*")
        .order("followers_count", { ascending: false })
        .limit(30);

      return {
        posts: nextTrendingPosts,
        recommendedUsers: allUsers
          ? (allUsers as Profile[]).filter((p) => !followingIds.has(p.id)).slice(0, 10)
          : [],
        followedIds: followingResult.data?.map((f) => f.following_id) ?? [],
      };
    });

    setTrendingPosts(result.posts);
    setRecommendedUsers(result.recommendedUsers);
    setFollowed(new Set(result.followedIds));
    setCachedTrendingData(result.posts, result.recommendedUsers);
    void setCachedQuery(storeUser.id, TRENDING_FEED_CACHE_KEY, result, CACHE_TTL.feed);

    setTrendingLoading(false);
    hasTrendingRef.current = true;
  }, [
    recommendedUsers.length,
    setCachedTrendingData,
    storeUser,
    trendingLoadedAt,
    trendingPosts.length,
  ]);

  const toggleFollow = async (targetId: string) => {
    if (!storeUser) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    if (followed.has(targetId)) {
      await supabase.from("follows").delete().eq("follower_id", storeUser.id).eq("following_id", targetId);
      setFollowed((prev) => { const next = new Set(prev); next.delete(targetId); return next; });
    } else {
      await supabase.from("follows").insert({ follower_id: storeUser.id, following_id: targetId });
      setFollowed((prev) => new Set(prev).add(targetId));
    }
  };

  // ── Effects ────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.replace("/auth");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) loadPosts(true);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load trending on first tab switch
  useEffect(() => {
    if (tab === "trending" && !hasTrendingRef.current) loadTrending();
  }, [tab, loadTrending]);

  useEffect(() => {
    setStoriesKey(storyRefreshKey);
  }, [storyRefreshKey]);

  // Real-time new posts
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const channel = supabase
      .channel("feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (payload) => {
        const newPost = payload.new as Post;
        if (newPost.user_id !== user.id) setNewPostCount((c) => c + 1);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "likes" }, (payload) => {
        const like = payload.new as { post_id: string; user_id: string };
        // Only update liked set — count comes from posts UPDATE trigger
        if (like.user_id === user.id) {
          setLikedPostIds((prev) => new Set(prev).add(like.post_id));
          setCachedLikedPostIds([like.post_id], true);
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "likes" }, (payload) => {
        const like = payload.old as { post_id?: string; user_id?: string };
        if (like.post_id && like.user_id === user.id) {
          setLikedPostIds((prev) => { const next = new Set(prev); next.delete(like.post_id!); return next; });
          removeCachedLikedPostId(like.post_id);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "posts" }, (payload) => {
        const updated = payload.new as Post;
        setPosts((prev) => prev.map((p) => p.id === updated.id ? { ...p, likes_count: updated.likes_count, comments_count: updated.comments_count } : p));
        patchCachedPostCounts(updated);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, (payload) => {
        const deleted = payload.old as { id?: string };
        if (deleted.id) {
          setPosts((prev) => prev.filter((p) => p.id !== deleted.id));
          removeCachedPost(deleted.id);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, (payload) => {
        // Only update liked set — count comes from posts UPDATE trigger
        void payload;
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [
    patchCachedPostCounts,
    removeCachedLikedPostId,
    removeCachedPost,
    setCachedLikedPostIds,
    user,
  ]);

  // Pull to refresh
  const { pullDistance, isRefreshing, triggered } = usePullToRefresh({
    onRefresh: async () => {
      setNewPostCount(0);
      if (tab === "following") {
        cursorRef.current = null;
        await loadPosts(true, true);
      } else {
        await loadTrending(true);
      }
    },
  });

  const handleLoadNewPosts = () => {
    setNewPostCount(0);
    cursorRef.current = null;
    loadPosts(true, true);
  };

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-[var(--accent-blue)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Pull-to-refresh indicator */}
        <AnimatePresence>
          {(pullDistance > 8 || isRefreshing) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex justify-center items-center py-2 -mt-2 mb-2"
            >
              <motion.div
                animate={isRefreshing ? { rotate: 360 } : { rotate: (pullDistance / 72) * 180 }}
                transition={isRefreshing ? { repeat: Infinity, duration: 0.8, ease: "linear" } : { duration: 0 }}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                  triggered || isRefreshing
                    ? "text-[var(--accent-blue)] bg-[var(--accent-blue)]/10"
                    : "text-[var(--text-secondary)] bg-[var(--bg-elevated)]"
                )}
              >
                <RefreshCw className="w-4 h-4" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Stories */}
        <StoryCircles
          onOpenViewer={(userId, stories) => {
            setViewerStories(stories);
            setViewerStartIndex(0);
          }}
          onCreateStory={() => setCreateStoryOpen(true)}
          key={storiesKey}
        />

        {/* Tabs: Популярное / Подписки */}
        <div className="mb-4 mt-4 flex items-center gap-3">
          <div className="flex flex-1 items-center gap-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-1">
            <button
              onClick={() => setTab("trending")}
              className={cn(
                "flex-1 py-2 px-4 text-sm font-medium rounded-xl transition-all",
                tab === "trending"
                  ? "bg-[var(--accent-blue)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              Популярное
            </button>
            <button
              onClick={() => setTab("following")}
              className={cn(
                "flex-1 py-2 px-4 text-sm font-medium rounded-xl transition-all",
                tab === "following"
                  ? "bg-[var(--accent-blue)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              Подписки
            </button>
          </div>
          <button
            type="button"
            onClick={() => setDensity("cozy")}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors",
              density === "cozy"
                ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
                : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
            )}
            aria-label="Обычная плотность ленты"
          >
            <PanelsTopLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setDensity("compact")}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors",
              density === "compact"
                ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
                : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
            )}
            aria-label="Компактная плотность ленты"
          >
            <AlignJustify className="h-4 w-4" />
          </button>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
        {tab === "following" ? (
          <motion.div key="following" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
            {/* New posts banner */}
            <AnimatePresence>
              {newPostCount > 0 && (
                <motion.button
                  initial={{ opacity: 0, y: -20, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto", marginBottom: 16 }}
                  exit={{ opacity: 0, y: -20, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                  onClick={handleLoadNewPosts}
                  className={cn(
                    "w-full py-2.5 px-4 rounded-2xl text-sm font-medium",
                    "text-[var(--accent-blue)] bg-[var(--accent-blue)]/10",
                    "hover:bg-[var(--accent-blue)]/15 transition-colors",
                    "border border-[var(--accent-blue)]/20",
                    "flex items-center justify-center gap-2"
                  )}
                >
                  <ArrowUp className="w-4 h-4" />
                  Новых постов: {newPostCount} — нажмите для обновления
                </motion.button>
              )}
            </AnimatePresence>

            <FeedList
              posts={posts.filter((p) => !blockedIds.has(p.user_id))}
              loading={loading}
              hasMore={hasMore}
              onLoadMore={() => loadPosts(false)}
              likedPostIds={likedPostIds}
              onDeletePost={(postId) => {
                setPosts((prev) => prev.filter((p) => p.id !== postId));
                removeCachedPost(postId);
              }}
              density={density}
              emptyTitle="Лента подписок пока тихая"
              emptyDescription="Подпишитесь на людей или опубликуйте свой первый пост, чтобы разогреть ленту."
              emptyAction={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button onClick={() => setCreatePostOpen(true)}>
                    Опубликовать пост
                  </Button>
                  <Button variant="ghost" onClick={() => setTab("trending")}>
                    Посмотреть популярное
                  </Button>
                </div>
              }
            />
          </motion.div>
        ) : (
          <motion.div key="trending" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
          {/* Trending tab */}
          <div className="space-y-6">
            {/* Trending posts */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-[var(--accent-blue)]" />
                <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                  Популярные посты
                </h3>
              </div>
              {trendingLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] animate-pulse shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3.5 w-32 rounded bg-[var(--bg-elevated)] animate-pulse" />
                          <div className="h-3 w-20 rounded bg-[var(--bg-elevated)] animate-pulse" />
                        </div>
                      </div>
                      <div className="h-3 w-full rounded bg-[var(--bg-elevated)] animate-pulse" />
                      <div className="h-3 w-3/4 rounded bg-[var(--bg-elevated)] animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : trendingPosts.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2">
                  <TrendingUp className="w-10 h-10 text-[var(--text-secondary)] opacity-20" />
                  <p className="text-sm text-[var(--text-secondary)]">Пока нет популярных постов</p>
                </div>
              ) : (
                <AnimatedList className="space-y-4">
                  {trendingPosts.map((post) => (
                    <PostCard key={post.id} post={post} density={density} />
                  ))}
                </AnimatedList>
              )}
            </section>

            {/* Recommended users */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <UsersIcon className="w-4 h-4 text-[var(--accent-blue)]" />
                <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                  Рекомендации
                </h3>
              </div>
              {trendingLoading ? (
                <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] animate-pulse shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-24 rounded bg-[var(--bg-elevated)] animate-pulse" />
                        <div className="h-2.5 w-16 rounded bg-[var(--bg-elevated)] animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recommendedUsers.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2">
                  <UsersIcon className="w-10 h-10 text-[var(--text-secondary)] opacity-20" />
                  <p className="text-sm text-[var(--text-secondary)]">Вы подписаны на всех!</p>
                </div>
              ) : (
                <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
                  {recommendedUsers.map((u, idx) => {
                    const name = u.display_name ?? u.username;
                    return (
                      <div
                        key={u.id}
                        className={cn(
                          "flex items-center gap-3 p-3 hover:bg-[var(--bg-elevated)] transition-colors",
                          idx < recommendedUsers.length - 1 && "border-b border-[var(--border)]"
                        )}
                      >
                        <Link href={`/profile/${u.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt={name ?? u.username} className="w-10 h-10 rounded-full object-cover shrink-0" loading="lazy" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-emerald-500 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                              {(name ?? u.username)[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{name}</p>
                            <p className="text-xs text-[var(--text-secondary)]">@{u.username}</p>
                          </div>
                        </Link>
                        <Button
                          variant={followed.has(u.id) ? "secondary" : "default"}
                          size="sm"
                          onClick={() => toggleFollow(u.id)}
                        >
                          {followed.has(u.id) ? "Подписки" : "Подписаться"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Story viewer */}
        {viewerStories && (
          <StoryViewer
            stories={viewerStories}
            startIndex={viewerStartIndex}
            onClose={() => setViewerStories(null)}
          />
        )}

        {/* Create story */}
      </div>
    </PageTransition>
  );
}
