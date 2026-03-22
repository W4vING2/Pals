"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ArrowUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { FeedList } from "@/components/feed/FeedList";
import { CreatePost } from "@/components/feed/CreatePost";
import { PageTransition } from "@/components/layout/PageTransition";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { Post } from "@/lib/supabase";

const PAGE_SIZE = 10;

export default function FeedPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newPostCount, setNewPostCount] = useState(0);
  const [fabVisible, setFabVisible] = useState(true);
  const lastScrollY = useRef(0);
  const hasLoadedRef = useRef(false);

  // Use a ref to track page offset to avoid stale closure in loadPosts
  const pageRef = useRef(0);
  // Track user liked post IDs for batch checking
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());

  const loadPosts = useCallback(async (reset = false) => {
    const supabase = getSupabaseBrowserClient();
    const currentPage = reset ? 0 : pageRef.current;
    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Only show skeleton on first load — never again
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
            // Deduplicate by id
            const existingIds = new Set(prev.map((p) => p.id));
            const unique = newPosts.filter((p) => !existingIds.has(p.id));
            return [...prev, ...unique];
          });
          pageRef.current = currentPage + 1;
        }
        setHasMore(newPosts.length === PAGE_SIZE);

        // Batch load like statuses for all loaded posts
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

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadPosts(true);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time new posts + like/comment count updates
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();

    const channel = supabase
      .channel("feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        (payload) => {
          const newPost = payload.new as Post;
          if (newPost.user_id !== user.id) {
            setNewPostCount((c) => c + 1);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "likes" },
        (payload) => {
          const like = payload.new as { post_id: string; user_id: string };
          setPosts((prev) =>
            prev.map((p) =>
              p.id === like.post_id
                ? { ...p, likes_count: (p.likes_count ?? 0) + 1 }
                : p
            )
          );
          // Update liked set if it's our like
          if (like.user_id === user.id) {
            setLikedPostIds((prev) => new Set(prev).add(like.post_id));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "likes" },
        (payload) => {
          const like = payload.old as { post_id?: string; user_id?: string };
          if (like.post_id) {
            setPosts((prev) =>
              prev.map((p) =>
                p.id === like.post_id
                  ? { ...p, likes_count: Math.max(0, (p.likes_count ?? 0) - 1) }
                  : p
              )
            );
            if (like.user_id === user.id) {
              setLikedPostIds((prev) => {
                const next = new Set(prev);
                next.delete(like.post_id!);
                return next;
              });
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments" },
        (payload) => {
          const comment = payload.new as { post_id: string };
          setPosts((prev) =>
            prev.map((p) =>
              p.id === comment.post_id
                ? { ...p, comments_count: (p.comments_count ?? 0) + 1 }
                : p
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // FAB hide/show on scroll
  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY > lastScrollY.current && currentY > 100) {
        setFabVisible(false);
      } else {
        setFabVisible(true);
      }
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
        {/* Desktop create button */}
        <div className="flex items-center justify-end mb-6">
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="hidden sm:inline-flex"
          >
            <Plus className="w-4 h-4" />
            Новый пост
          </Button>
        </div>

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
          posts={posts}
          loading={loading}
          hasMore={hasMore}
          onLoadMore={() => loadPosts(false)}
          likedPostIds={likedPostIds}
        />

        {/* Mobile FAB */}
        <motion.button
          onClick={() => setCreateOpen(true)}
          className={cn(
            "fixed bottom-20 right-4 z-40 sm:hidden",
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
      </div>
    </PageTransition>
  );
}
