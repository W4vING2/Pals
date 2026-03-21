"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { PostCard } from "@/components/feed/PostCard";
import { PageTransition } from "@/components/layout/PageTransition";
import { AnimatedList } from "@/components/shared/AnimatedList";
import { cn } from "@/lib/utils";
import type { Profile, Post } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";

function SkeletonUserRow() {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-32 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-3 w-20 rounded bg-[var(--bg-elevated)] animate-pulse" />
      </div>
      <div className="h-7 w-16 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
    </div>
  );
}

export default function SearchPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { user: storeUser } = useAuthStore();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [user, authLoading, router]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setUsers([]);
      setPosts([]);
      return;
    }
    setLoading(true);
    const supabase = getSupabaseBrowserClient();

    const [usersResult, postsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(10),
      supabase
        .from("posts")
        .select("*, profiles:user_id (id, username, display_name, avatar_url)")
        .ilike("content", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (usersResult.data) {
      setUsers(usersResult.data as Profile[]);
      // Load follow status for found users
      if (storeUser && usersResult.data.length > 0) {
        const ids = usersResult.data.map((u: { id: string }) => u.id);
        const { data: followData } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", storeUser.id)
          .in("following_id", ids);
        if (followData) {
          setFollowed(new Set(followData.map((f) => f.following_id)));
        }
      }
    }
    if (postsResult.data) setPosts(postsResult.data as Post[]);
    setLoading(false);
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      search(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const toggleFollow = async (targetId: string) => {
    if (!storeUser) return;
    const supabase = getSupabaseBrowserClient();
    if (followed.has(targetId)) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", storeUser.id)
        .eq("following_id", targetId);
      setFollowed((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    } else {
      await supabase.from("follows").insert({
        follower_id: storeUser.id,
        following_id: targetId,
      });
      setFollowed((prev) => new Set(prev).add(targetId));
    }
  };

  const showEmpty =
    !loading && query && users.length === 0 && posts.length === 0;

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Sticky search bar */}
        <div className="sticky top-0 z-10 pb-4 bg-[var(--bg-base)]">
          <motion.div
            className="relative"
            initial={false}
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people or posts..."
              className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-full pl-12 pr-10 py-3.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none input-focus transition-all duration-200"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </motion.div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-1 bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonUserRow key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {showEmpty && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Search className="w-20 h-20 text-[var(--text-secondary)] opacity-20" />
            <div>
              <p className="font-semibold text-[var(--text-primary)]">
                No results for &ldquo;{query}&rdquo;
              </p>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Try a different search term
              </p>
            </div>
          </div>
        )}

        {/* No query -- hint */}
        {!query && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Search className="w-16 h-16 text-[var(--text-secondary)] opacity-20" />
            <p className="text-[var(--text-secondary)] text-sm">
              Find your people
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && (users.length > 0 || posts.length > 0) && (
          <div className="space-y-6">
            {/* User results */}
            {users.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                  People
                </h2>
                <AnimatedList className="space-y-0 bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] overflow-hidden">
                  {users.map((u, idx) => {
                    const name = u.display_name ?? u.username;
                    const isOwn = u.id === storeUser?.id;
                    return (
                      <div
                        key={u.id}
                        className={cn(
                          "flex items-center gap-3 p-4 hover:bg-[var(--bg-elevated)] transition-colors",
                          idx < users.length - 1 &&
                            "border-b border-[var(--border)]"
                        )}
                      >
                        <Link
                          href={`/profile/${u.username}`}
                          className="flex items-center gap-3 flex-1 min-w-0"
                        >
                          {u.avatar_url ? (
                            <img
                              src={u.avatar_url}
                              alt={name ?? u.username}
                              className="w-10 h-10 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-emerald-500 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                              {(name ?? u.username)[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                              {name}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              @{u.username}
                            </p>
                          </div>
                        </Link>
                        {!isOwn && (
                          <Button
                            variant={
                              followed.has(u.id) ? "secondary" : "default"
                            }
                            size="sm"
                            onClick={() => toggleFollow(u.id)}
                          >
                            {followed.has(u.id) ? "Following" : "Follow"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </AnimatedList>
              </section>
            )}

            {/* Post results */}
            {posts.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                  Posts
                </h2>
                <AnimatedList className="space-y-4">
                  {posts.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </AnimatedList>
              </section>
            )}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
