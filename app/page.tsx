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
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import type { Post } from "@/lib/supabase";

const PAGE_SIZE = 10;

export default function FeedPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [newPostCount, setNewPostCount] = useState(0);
  const [fabVisible, setFabVisible] = useState(true);
  const lastScrollY = useRef(0);

  const loadPosts = useCallback(async (reset = false) => {
    const supabase = getSupabaseBrowserClient();
    const from = reset ? 0 : page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    setLoading(true);
    const { data, error } = await supabase
      .from("posts")
      .select("*, profiles:user_id (id, username, display_name, avatar_url)")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!error && data) {
      if (reset) {
        setPosts(data as Post[]);
        setPage(1);
      } else {
        setPosts((prev) => [...prev, ...(data as Post[])]);
        setPage((p) => p + 1);
      }
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoading(false);
  }, [page]);

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

  // Real-time new posts
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
          // Don't add own posts (they'll be refreshed on create)
          if (newPost.user_id !== user.id) {
            setNewPostCount((c) => c + 1);
          }
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
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold font-display text-[var(--text-primary)]">Feed</h1>
          {/* Desktop create button */}
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="hidden sm:inline-flex"
          >
            <Plus className="w-4 h-4" />
            New Post
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
              {newPostCount} new {newPostCount === 1 ? "post" : "posts"} — tap to refresh
            </motion.button>
          )}
        </AnimatePresence>

        <FeedList
          posts={posts}
          loading={loading}
          hasMore={hasMore}
          onLoadMore={() => loadPosts(false)}
        />

        {/* Mobile FAB */}
        <motion.button
          onClick={() => setCreateOpen(true)}
          className={cn(
            "fixed bottom-20 right-4 z-40 sm:hidden",
            "w-14 h-14 rounded-full shadow-lg",
            "bg-gradient-to-br from-[var(--accent-blue)] to-blue-600",
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
