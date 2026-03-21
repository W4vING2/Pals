"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SkeletonUserResult } from "@/components/ui/Skeleton";
import { PostCard } from "@/components/feed/PostCard";
import type { Profile, Post } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import Link from "next/link";

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

    if (usersResult.data) setUsers(usersResult.data as Profile[]);
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

  const showEmpty = !loading && query && users.length === 0 && posts.length === 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Sticky search bar */}
      <div className="sticky top-0 z-10 pb-4 bg-[var(--bg-base)]">
        <h1 className="text-2xl font-bold font-display text-[var(--text-primary)] mb-4">Search</h1>
        <div className="relative">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people or posts…"
            className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl pl-12 pr-4 py-3.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-all duration-150"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 2l12 12M14 2L2 14" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonUserResult key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {showEmpty && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <svg className="w-20 h-20 text-[var(--text-secondary)]/20" viewBox="0 0 80 80" fill="none">
            <circle cx="36" cy="36" r="26" stroke="currentColor" strokeWidth="3" />
            <path d="M56 56l14 14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <path d="M26 36h20M36 26v20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div>
            <p className="font-semibold text-[var(--text-primary)]">No results for &ldquo;{query}&rdquo;</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">Try a different search term</p>
          </div>
        </div>
      )}

      {/* No query — hint */}
      {!query && !loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <svg className="w-16 h-16 text-[var(--text-secondary)]/20" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="28" cy="28" r="18" />
            <path d="M42 42l14 14" strokeLinecap="round" />
          </svg>
          <p className="text-[var(--text-secondary)] text-sm">Search for people and posts</p>
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
              <div className="space-y-1 bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] overflow-hidden">
                {users.map((u, idx) => {
                  const name = u.display_name ?? u.username;
                  const isOwn = u.id === storeUser?.id;
                  return (
                    <div
                      key={u.id}
                      className={`flex items-center gap-3 p-4 hover:bg-[var(--bg-elevated)] transition-colors ${
                        idx < users.length - 1 ? "border-b border-[var(--border)]" : ""
                      }`}
                    >
                      <Link href={`/profile/${u.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar src={u.avatar_url} name={name} size="md" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{name}</p>
                          <p className="text-xs text-[var(--text-secondary)]">@{u.username}</p>
                        </div>
                      </Link>
                      {!isOwn && (
                        <Button
                          variant={followed.has(u.id) ? "secondary" : "primary"}
                          size="sm"
                          onClick={() => toggleFollow(u.id)}
                        >
                          {followed.has(u.id) ? "Following" : "Follow"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Post results */}
          {posts.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                Posts
              </h2>
              <div className="space-y-4">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
