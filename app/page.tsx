"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ArrowUp, TrendingUp, Users as UsersIcon } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { FeedList } from "@/components/feed/FeedList";
import { CreatePost } from "@/components/feed/CreatePost";
import { PageTransition } from "@/components/layout/PageTransition";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { StoryCircles } from "@/components/stories/StoryCircles";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { CreateStory } from "@/components/stories/CreateStory";
import { AnimatedList } from "@/components/shared/AnimatedList";
import { PostCard } from "@/components/feed/PostCard";
import { useAuthStore } from "@/lib/store";
import type { Post, Profile, Story } from "@/lib/supabase";

const PAGE_SIZE = 10;

type FeedTab = "following" | "trending";

export default function FeedPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { user: storeUser } = useAuthStore();
  const { blockedIds } = useBlockedUsers();

  // Tab state
  const [tab, setTab] = useState<FeedTab>("trending");

  // Following feed state
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [newPostCount, setNewPostCount] = useState(0);
  const pageRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());

  // Trending state
  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const hasTrendingRef = useRef(false);
  const [recommendedUsers, setRecommendedUsers] = useState<Profile[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  // Create post
  const [createOpen, setCreateOpen] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);
  const lastScrollY = useRef(0);

  // Stories
  const [viewerStories, setViewerStories] = useState<Story[] | null>(null);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const [createStoryOpen, setCreateStoryOpen] = useState(false);
  const [storiesKey, setStoriesKey] = useState(0);

  // ── Following feed ─────────────────────────────────────────
  const loadPosts = useCallback(async (reset = false) => {
    const supabase = getSupabaseBrowserClient();
    const currentPage = reset ? 0 : pageRef.current;
    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    if (!hasLoadedRef.current) setLoading(true);

    try {
      const { data, error } = await supabase
        .from("posts")
        .select("*, profiles:user_id (id, username, display_name, avatar_url)")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (!error && data) {
        const newPosts = data as Post[];
        if (reset) {
          setPosts(newPosts);
          pageRef.current = 1;
        } else {
          setPosts((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const unique = newPosts.filter((p) => !existingIds.has(p.id));
            return [...prev, ...unique];
          });
          pageRef.current = currentPage + 1;
        }
        setHasMore(newPosts.length === PAGE_SIZE);

        if (user && newPosts.length > 0) {
          const postIds = newPosts.map((p) => p.id);
          const { data: likeData } = await supabase
            .from("likes")
            .select("post_id")
            .eq("user_id", user.id)
            .in("post_id", postIds);
          if (likeData) {
            const newLikedIds = new Set(likeData.map((l) => l.post_id));
            setLikedPostIds((prev) => {
              if (reset) return newLikedIds;
              const merged = new Set(prev);
              newLikedIds.forEach((id) => merged.add(id));
              return merged;
            });
          }
        }
      }
      hasLoadedRef.current = true;
    } catch (err) {
      console.warn("loadPosts failed:", err);
    }
    setLoading(false);
  }, [user]);

  // ── Trending feed ─────────────────────────────────────────
  const loadTrending = useCallback(async () => {
    if (!storeUser) return;
    setTrendingLoading(true);
    const supabase = getSupabaseBrowserClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

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

    if (postsResult.data) setTrendingPosts(postsResult.data as Post[]);

    const followingIds = new Set(followingResult.data?.map((f) => f.following_id) ?? []);
    followingIds.add(storeUser.id);
    setFollowed(new Set(followingResult.data?.map((f) => f.following_id) ?? []));

    const { data: allUsers } = await supabase
      .from("profiles")
      .select("*")
      .order("followers_count", { ascending: false })
      .limit(30);
    if (allUsers) {
      setRecommendedUsers((allUsers as Profile[]).filter((p) => !followingIds.has(p.id)).slice(0, 10));
    }

    setTrendingLoading(false);
    hasTrendingRef.current = true;
  }, [storeUser]);

  const toggleFollow = async (targetId: string) => {
    if (!storeUser) return;
    const supabase = getSupabaseBrowserClient();
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

  // Real-time new posts
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel("feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (payload) => {
        const newPost = payload.new as Post;
        if (newPost.user_id !== user.id) setNewPostCount((c) => c + 1);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "likes" }, (payload) => {
        const like = payload.new as { post_id: string; user_id: string };
        // Only update liked set — count comes from posts UPDATE trigger
        if (like.user_id === user.id) setLikedPostIds((prev) => new Set(prev).add(like.post_id));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "likes" }, (payload) => {
        const like = payload.old as { post_id?: string; user_id?: string };
        if (like.post_id && like.user_id === user.id) {
          setLikedPostIds((prev) => { const next = new Set(prev); next.delete(like.post_id!); return next; });
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "posts" }, (payload) => {
        const updated = payload.new as Post;
        setPosts((prev) => prev.map((p) => p.id === updated.id ? { ...p, likes_count: updated.likes_count, comments_count: updated.comments_count } : p));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, (payload) => {
        const deleted = payload.old as { id?: string };
        if (deleted.id) setPosts((prev) => prev.filter((p) => p.id !== deleted.id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, (payload) => {
        // Only update liked set — count comes from posts UPDATE trigger
        void payload;
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // FAB hide/show on scroll
  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      setFabVisible(!(currentY > lastScrollY.current && currentY > 100));
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLoadNewPosts = () => {
    setNewPostCount(0);
    loadPosts(true);
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
        <div className="flex items-center gap-1 mb-4 mt-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-1">
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
              onDeletePost={(postId) => setPosts((prev) => prev.filter((p) => p.id !== postId))}
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
                    <PostCard key={post.id} post={post} />
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
                            <img src={u.avatar_url} alt={name ?? u.username} className="w-10 h-10 rounded-full object-cover shrink-0" />
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

        {/* FAB — create post */}
        <motion.button
          onClick={() => setCreateOpen(true)}
          className={cn(
            "fixed bottom-20 right-4 z-40",
            "w-14 h-14 rounded-full shadow-lg",
            "bg-gradient-to-br from-[var(--accent-blue)] to-purple-700",
            "text-white flex items-center justify-center",
            "active:scale-95 transition-shadow",
            "hover:shadow-xl"
          )}
          animate={{
            scale: fabVisible ? 1 : 0,
            opacity: fabVisible ? 1 : 0,
          }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          <Plus className="w-6 h-6" />
        </motion.button>

        <CreatePost
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => loadPosts(true)}
        />

        {/* Story viewer */}
        {viewerStories && (
          <StoryViewer
            stories={viewerStories}
            startIndex={viewerStartIndex}
            onClose={() => setViewerStories(null)}
          />
        )}

        {/* Create story */}
        <CreateStory
          open={createStoryOpen}
          onClose={() => setCreateStoryOpen(false)}
          onCreated={() => {
            setCreateStoryOpen(false);
            setStoriesKey((k) => k + 1);
          }}
        />
      </div>
    </PageTransition>
  );
}
