"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import {
  CACHE_TTL,
  useAppDataStore,
  useChromeStore,
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
    <div className="mx-auto max-w-2xl px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
      <div className="flex items-center justify-between">
        <Skeleton className="h-12 w-12 rounded-full bg-white/8" />
        <Skeleton className="h-12 w-24 rounded-full bg-white/8" />
      </div>
      <div className="mt-6 flex flex-col items-center">
        <Skeleton className="h-36 w-36 rounded-full bg-white/8" />
        <Skeleton className="mt-5 h-10 w-44 rounded-xl bg-white/8" />
        <Skeleton className="mt-2 h-6 w-28 rounded-xl bg-white/8" />
      </div>
      <div className="mt-8 rounded-[2rem] bg-[#1b1b1f] p-5">
        <Skeleton className="h-7 w-28 rounded bg-white/8" />
        <Skeleton className="mt-2 h-8 w-40 rounded bg-white/8" />
        <Skeleton className="mt-6 h-px w-full bg-white/8" />
        <Skeleton className="mt-6 h-7 w-16 rounded bg-white/8" />
        <Skeleton className="mt-2 h-16 w-full rounded bg-white/8" />
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
  const setMobileNavHidden = useChromeStore((s) => s.setMobileNavHidden);

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
    setMobileNavHidden(true);
    return () => setMobileNavHidden(false);
  }, [setMobileNavHidden]);

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
      <div className="min-h-dvh bg-[#030307] text-white">
        <ProfileSkeleton />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[#030307] px-4 text-center text-white">
        <p className="mb-2 text-2xl font-bold">
          Пользователь не найден
        </p>
        <p className="text-white/45">
          @{username} не существует
        </p>
      </div>
    );
  }

  const isOwn = user?.id === profile.id;

  return (
    <PageTransition className="min-h-dvh bg-[#030307] text-white">
      <div className="mx-auto max-w-2xl pb-10">
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

        <div id="profile-posts" className="px-4 pt-4">
          <div className="mx-auto mb-7 flex w-fit rounded-full border border-white/10 bg-[#1b1b1f] p-1 shadow-[0_20px_48px_rgba(0,0,0,0.34)]">
            <button className="inline-flex items-center gap-2 rounded-full bg-white/10 px-6 py-2.5 text-[18px] font-semibold text-white">
              Posts
            </button>
          </div>
          <PostGrid posts={posts} loading={loadingPosts} />
        </div>
      </div>
    </PageTransition>
  );
}
