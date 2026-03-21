"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { FeedList } from "@/components/feed/FeedList";
import { CreatePost } from "@/components/feed/CreatePost";
import { Button } from "@/components/ui/Button";
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

  const handleLoadNewPosts = () => {
    setNewPostCount(0);
    loadPosts(true);
  };

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-[var(--accent-blue)] border-t-transparent animate-spin-slow" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display text-[var(--text-primary)]">Feed</h1>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M8 2v12M2 8h12" />
          </svg>
          New Post
        </Button>
      </div>

      {/* New posts banner */}
      {newPostCount > 0 && (
        <button
          onClick={handleLoadNewPosts}
          className="w-full mb-4 py-2.5 px-4 glass rounded-2xl text-sm font-medium text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 transition-all duration-150 animate-slide-down"
        >
          ↑ {newPostCount} new {newPostCount === 1 ? "post" : "posts"} — tap to refresh
        </button>
      )}

      <FeedList
        posts={posts}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={() => loadPosts(false)}
      />

      <CreatePost
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => loadPosts(true)}
      />
    </div>
  );
}
