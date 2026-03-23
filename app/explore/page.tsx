"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TrendingUp, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { PostCard } from "@/components/feed/PostCard";
import { PageTransition } from "@/components/layout/PageTransition";
import { AnimatedList } from "@/components/shared/AnimatedList";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store";
import type { Post, Profile } from "@/lib/supabase";

function SkeletonPostCard() {
  return (
    <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-32 rounded bg-[var(--bg-elevated)] animate-pulse" />
          <div className="h-3 w-20 rounded bg-[var(--bg-elevated)] animate-pulse" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-3 w-3/4 rounded bg-[var(--bg-elevated)] animate-pulse" />
      </div>
    </div>
  );
}

function SkeletonUserCard() {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-32 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-3 w-20 rounded bg-[var(--bg-elevated)] animate-pulse" />
      </div>
      <div className="h-7 w-24 rounded-lg bg-[var(--bg-elevated)] animate-pulse" />
    </div>
  );
}

export default function ExplorePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { user: storeUser } = useAuthStore();
  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);
  const [recommendedUsers, setRecommendedUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [user, authLoading, router]);

  const loadData = useCallback(async () => {
    if (!storeUser) return;
    setLoading(true);
    const supabase = getSupabaseBrowserClient();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Load trending posts and following list in parallel
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

    if (postsResult.data) {
      setTrendingPosts(postsResult.data as Post[]);
    }

    const followingIds = new Set(followingResult.data?.map((f) => f.following_id) ?? []);
    followingIds.add(storeUser.id); // exclude self
    setFollowed(new Set(followingResult.data?.map((f) => f.following_id) ?? []));

    // Get top users not followed
    const { data: allUsers } = await supabase
      .from("profiles")
      .select("*")
      .order("followers_count", { ascending: false })
      .limit(30);

    if (allUsers) {
      const filtered = allUsers.filter((p) => !followingIds.has(p.id)).slice(0, 10);
      setRecommendedUsers(filtered as Profile[]);
    }

    setLoading(false);
  }, [storeUser]);

  useEffect(() => {
    if (storeUser) {
      loadData();
    }
  }, [storeUser]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {/* Trending posts */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-[var(--accent-blue)]" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Популярное
            </h2>
          </div>

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonPostCard key={i} />
              ))}
            </div>
          ) : trendingPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <TrendingUp className="w-12 h-12 text-[var(--text-secondary)] opacity-20" />
              <p className="text-sm text-[var(--text-secondary)]">
                Пока нет популярных постов
              </p>
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
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-[var(--accent-blue)]" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Рекомендации
            </h2>
          </div>

          {loading ? (
            <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonUserCard key={i} />
              ))}
            </div>
          ) : recommendedUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <Users className="w-12 h-12 text-[var(--text-secondary)] opacity-20" />
              <p className="text-sm text-[var(--text-secondary)]">
                Нет рекомендаций — вы подписаны на всех!
              </p>
            </div>
          ) : (
            <div className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] overflow-hidden">
              <AnimatedList className="space-y-0">
                {recommendedUsers.map((u, idx) => {
                  const name = u.display_name ?? u.username;
                  return (
                    <div
                      key={u.id}
                      className={cn(
                        "flex items-center gap-3 p-4 hover:bg-[var(--bg-elevated)] transition-colors",
                        idx < recommendedUsers.length - 1 &&
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
                          {(u.followers_count ?? 0) > 0 && (
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                              {u.followers_count} подписчиков
                            </p>
                          )}
                        </div>
                      </Link>
                      <Button
                        variant={followed.has(u.id) ? "secondary" : "default"}
                        size="sm"
                        onClick={() => toggleFollow(u.id)}
                      >
                        {followed.has(u.id) ? "Вы подписаны" : "Подписаться"}
                      </Button>
                    </div>
                  );
                })}
              </AnimatedList>
            </div>
          )}
        </section>
      </div>
    </PageTransition>
  );
}
