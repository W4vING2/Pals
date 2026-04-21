"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { filterVisiblePosts } from "@/lib/postVisibility";

type Tab = "all" | "people" | "posts";

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

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "people", label: "Люди" },
  { id: "posts", label: "Посты" },
];

function SearchPageInner() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { user: storeUser } = useAuthStore();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [users, setUsers] = useState<Profile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [user, authLoading, router]);

  // Auto-switch to posts tab when query starts with #
  useEffect(() => {
    if (query.startsWith("#")) {
      setActiveTab("posts");
    }
  }, [query]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setUsers([]);
      setPosts([]);
      return;
    }
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const isHashtag = q.startsWith("#");

    if (isHashtag) {
      const { data: followingData } = storeUser
        ? await supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", storeUser.id)
        : { data: [] };
      const followingIds = new Set(
        followingData?.map((item) => item.following_id) ?? []
      );
      if (storeUser?.id) followingIds.add(storeUser.id);

      // Hashtag search: only fetch posts matching the tag
      const { data: postsData } = await supabase
        .from("posts")
        .select("*, profiles:user_id (id, username, display_name, avatar_url)")
        .ilike("content", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(20);

      setUsers([]);
      if (postsData) {
        setPosts(
          filterVisiblePosts(postsData as Post[], storeUser?.id, followingIds)
        );
      }
    } else {
      const [usersResult, postsResult, followingResult] = await Promise.all([
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
        storeUser
          ? supabase
              .from("follows")
              .select("following_id")
              .eq("follower_id", storeUser.id)
          : Promise.resolve({ data: [] }),
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
      const followingIds = new Set(
        followingResult.data?.map((item) => item.following_id) ?? []
      );
      if (storeUser?.id) followingIds.add(storeUser.id);
      if (postsResult.data) {
        setPosts(
          filterVisiblePosts(postsResult.data as Post[], storeUser?.id, followingIds)
        );
      }
    }

    setLoading(false);
  }, [storeUser]);

  // Sync query from URL params (e.g. when clicking a hashtag link)
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    if (q && q !== query) {
      setQuery(q);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!supabase) return;
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

  const isHashtagSearch = query.startsWith("#");

  // Determine what to show based on active tab
  const showUsers = !isHashtagSearch && (activeTab === "all" || activeTab === "people");
  const showPosts = activeTab === "all" || activeTab === "posts";

  const visibleUsers = showUsers ? users : [];
  const visiblePosts = showPosts ? posts : [];

  const showEmpty =
    !loading && query && visibleUsers.length === 0 && visiblePosts.length === 0;

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Sticky search bar + tabs */}
        <div className="sticky top-0 z-10 pb-3 bg-[var(--bg-base)]">
          <motion.div
            className="relative"
            initial={false}
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск людей и постов..."
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

          {/* Tabs — hidden when query starts with # (hashtag mode shows only posts) */}
          {!isHashtagSearch && (
            <div className="flex gap-2 mt-3">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                    activeTab === tab.id
                      ? "bg-[var(--accent-blue)] text-white"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
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
                Нет результатов по запросу &ldquo;{query}&rdquo;
              </p>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Попробуйте другой запрос
              </p>
            </div>
          </div>
        )}

        {/* No query -- hint */}
        {!query && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Search className="w-16 h-16 text-[var(--text-secondary)] opacity-20" />
            <p className="text-[var(--text-secondary)] text-sm">
              Найдите своих
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && (visibleUsers.length > 0 || visiblePosts.length > 0) && (
          <div className="space-y-6">
            {/* User results */}
            {visibleUsers.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                  Люди
                </h2>
                <AnimatedList className="space-y-0 bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] overflow-hidden">
                  {visibleUsers.map((u, idx) => {
                    const name = u.display_name ?? u.username;
                    const isOwn = u.id === storeUser?.id;
                    return (
                      <div
                        key={u.id}
                        className={cn(
                          "flex items-center gap-3 p-4 hover:bg-[var(--bg-elevated)] transition-colors",
                          idx < visibleUsers.length - 1 &&
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
                            {followed.has(u.id) ? "Вы подписаны" : "Подписаться"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </AnimatedList>
              </section>
            )}

            {/* Post results */}
            {visiblePosts.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                  {isHashtagSearch ? (
                    <span>
                      Посты по{" "}
                      <span className="text-[var(--accent-blue)]">{query}</span>
                      {" · "}{visiblePosts.length}{" "}
                      {visiblePosts.length === 1 ? "пост" : visiblePosts.length < 5 ? "поста" : "постов"}
                    </span>
                  ) : (
                    "Посты"
                  )}
                </h2>
                <AnimatedList className="space-y-4">
                  {visiblePosts.map((post) => (
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

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageInner />
    </Suspense>
  );
}
