"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import {
  CACHE_TTL,
  useAppDataStore,
  useMessagesStore,
  type ProfileCacheEntry,
} from "@/lib/store";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { PostGrid } from "@/components/profile/PostGrid";
import { PageTransition } from "@/components/layout/PageTransition";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Profile, Post } from "@/lib/supabase";
import { filterVisiblePosts } from "@/lib/postVisibility";
import { dedupeRequest, getCachedQuery, isCacheFresh, setCachedQuery } from "@/lib/cache";

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

function ProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto">
      {/* Cover skeleton */}
      <Skeleton className="h-40 sm:h-56 w-full rounded-3xl" />
      <div className="px-4 -mt-10 space-y-4">
        {/* Avatar skeleton */}
        <div className="flex items-end justify-between">
          <Skeleton className="size-20 rounded-full ring-4 ring-[var(--bg-base)]" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
        {/* Name lines */}
        <div className="space-y-2">
          <Skeleton className="h-6 w-40 rounded-lg" />
          <Skeleton className="h-4 w-24 rounded-lg" />
          <Skeleton className="h-4 w-full max-w-xs rounded-lg" />
        </div>
        {/* Stats row */}
        <div className="flex gap-6 py-3 border-t border-[var(--border)]">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-5 w-8 rounded" />
              <Skeleton className="h-3 w-14 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage({ params }: ProfilePageProps) {
  const { username } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { getOrCreateConversation } = useMessages();
  const profileCache = useAppDataStore((s) => s.profilesByUsername[username]);
  const setProfileCache = useAppDataStore((s) => s.setProfileCache);

  const [profile, setProfile] = useState<Profile | null>(profileCache?.profile ?? null);
  const [posts, setPosts] = useState<Post[]>(profileCache?.posts ?? []);
  const [loadingProfile, setLoadingProfile] = useState(!profileCache);
  const [loadingPosts, setLoadingPosts] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!username) return;
    const load = async () => {
      const cacheKey = `profile:${username}`;
      const memoryFresh =
        !!profileCache && Date.now() - profileCache.loadedAt < CACHE_TTL.profile;

      if (profileCache) {
        setProfile(profileCache.profile);
        setPosts(profileCache.posts);
        setLoadingProfile(false);
        setLoadingPosts(false);
        if (memoryFresh) return;
      } else if (user) {
        const cached = await getCachedQuery<ProfileCacheEntry>(user.id, cacheKey);
        if (cached?.value) {
          setProfileCache(username, cached.value);
          setProfile(cached.value.profile);
          setPosts(cached.value.posts);
          setLoadingProfile(false);
          setLoadingPosts(false);
          if (isCacheFresh(cached)) return;
        } else {
          setLoadingProfile(true);
        }
      }

      const supabase = getSupabaseBrowserClient();

      const next = await dedupeRequest(
        `${user?.id ?? "anon"}:${cacheKey}`,
        async (): Promise<ProfileCacheEntry> => {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("username", username)
            .single();

          if (!profileData) {
            return { profile: null, posts: [], loadedAt: Date.now() };
          }

          const { data: followData } = user
            ? await supabase
                .from("follows")
                .select("following_id")
                .eq("follower_id", user.id)
            : { data: [] };
          const followingIds = new Set(
            followData?.map((item) => item.following_id) ?? []
          );
          if (user?.id) followingIds.add(user.id);
          const { data: postsData } = await supabase
            .from("posts")
            .select("*, profiles:user_id (id, username, display_name, avatar_url)")
            .eq("user_id", profileData.id)
            .order("created_at", { ascending: false });

          return {
            profile: profileData as Profile,
            posts: postsData
              ? filterVisiblePosts(postsData as Post[], user?.id, followingIds)
              : [],
            loadedAt: Date.now(),
          };
        }
      );

      setProfile(next.profile);
      setPosts(next.posts);
      setProfileCache(username, next);
      if (user) void setCachedQuery(user.id, cacheKey, next, CACHE_TTL.profile);
      setLoadingProfile(false);
      setLoadingPosts(false);
    };

    load();
  }, [profileCache, setProfileCache, user, username]);

  const handleMessageClick = async () => {
    if (!profile || !user) return;
    const convId = await getOrCreateConversation(profile.id);
    if (convId) {
      useMessagesStore.getState().setPendingConversationId(convId);
      router.push("/messages");
    }
  };

  if (authLoading || loadingProfile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <ProfileSkeleton />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          Пользователь не найден
        </p>
        <p className="text-[var(--text-secondary)]">
          @{username} не существует
        </p>
      </div>
    );
  }

  const isOwn = user?.id === profile.id;

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto pb-6">
        <ProfileHeader
          profile={profile}
          isOwnProfile={isOwn}
          onMessageClick={handleMessageClick}
          onProfileUpdated={(nextProfile) => {
            setProfile(nextProfile);
            setProfileCache(username, {
              profile: nextProfile,
              posts,
              loadedAt: Date.now(),
            });
          }}
        />

        <div className="px-4 mt-4">
          <PostGrid posts={posts} loading={loadingPosts} />
        </div>
      </div>
    </PageTransition>
  );
}
