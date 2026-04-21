"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TrendingUp, Users, Hash } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { PostCard } from "@/components/feed/PostCard";
import { PageTransition } from "@/components/layout/PageTransition";
import { AnimatedList } from "@/components/shared/AnimatedList";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store";
import { TopicCard } from "@/components/topics/TopicCard";
import { CreateTopicModal } from "@/components/topics/CreateTopicModal";
import type { Post, Profile } from "@/lib/supabase";
import { filterVisiblePosts } from "@/lib/postVisibility";

type Topic = {
  id: string;
  title: string;
  description: string | null;
  participant_count: number;
  message_count: number;
  expires_at: string;
  tags: string[];
};

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
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [showCreateTopic, setShowCreateTopic] = useState(false);
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
    setTopicsLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    // Load topics
    const { data: topicsData } = await (supabase as any)
      .from("topics")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("participant_count", { ascending: false })
      .limit(10);
    if (topicsData) setTopics(topicsData as Topic[]);
    setTopicsLoading(false);

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

    const followingIds = new Set(followingResult.data?.map((f) => f.following_id) ?? []);
    followingIds.add(storeUser.id); // exclude self
    setFollowed(new Set(followingResult.data?.map((f) => f.following_id) ?? []));

    if (postsResult.data) {
      setTrendingPosts(
        filterVisiblePosts(postsResult.data as Post[], storeUser.id, followingIds)
      );
    }

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
        {/* Topics */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Hash className="w-5 h-5 text-[var(--accent-blue)]" />
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Топики</h2>
            </div>
            <button
              onClick={() => setShowCreateTopic(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-[var(--accent-blue)] hover:opacity-70 transition-opacity"
            >
              + Создать
            </button>
          </div>

          {topicsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] p-4 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-[var(--bg-elevated)] animate-pulse" />
                    <div className="h-3.5 w-28 rounded bg-[var(--bg-elevated)] animate-pulse" />
                  </div>
                  <div className="h-3 w-full rounded bg-[var(--bg-elevated)] animate-pulse" />
                  <div className="flex gap-3">
                    <div className="h-3 w-10 rounded bg-[var(--bg-elevated)] animate-pulse" />
                    <div className="h-3 w-10 rounded bg-[var(--bg-elevated)] animate-pulse" />
                    <div className="h-3 w-12 rounded bg-[var(--bg-elevated)] animate-pulse ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : topics.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-3 text-center bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]">
              <Hash className="w-10 h-10 text-[var(--text-secondary)] opacity-20" />
              <p className="text-sm text-[var(--text-secondary)]">Нет активных топиков</p>
              <button
                onClick={() => setShowCreateTopic(true)}
                className="text-sm text-[var(--accent-blue)] font-medium"
              >
                Создать первый →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {topics.map((topic) => (
                <TopicCard key={topic.id} topic={topic} />
              ))}
            </div>
          )}

          <CreateTopicModal
            open={showCreateTopic}
            onClose={() => setShowCreateTopic(false)}
            onCreated={(topic) => setTopics((prev) => [topic, ...prev])}
          />
        </section>

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
