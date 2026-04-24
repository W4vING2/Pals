"use client";

import React, { useEffect, useRef, useState, use } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { useCalls } from "@/hooks/useCalls";
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
  const { initiateCall } = useCalls();
  const profileCache = useAppDataStore((s) => s.profilesByUsername[username]);
  const setProfileCache = useAppDataStore((s) => s.setProfileCache);
  const setMobileNavHidden = useChromeStore((s) => s.setMobileNavHidden);

  const [profile, setProfile] = useState<Profile | null>(profileCache?.profile ?? null);
  const [posts, setPosts] = useState<Post[]>(profileCache?.posts ?? []);
  const [loadingProfile, setLoadingProfile] = useState(!profileCache);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyLeft = body.style.left;
    const previousBodyRight = body.style.right;
    const previousBodyWidth = body.style.width;
    const previousHtmlHeight = html.style.height;
    const previousBodyHeight = body.style.height;
    const previousHtmlOverscroll = html.style.overscrollBehaviorY;
    const previousBodyOverscroll = body.style.overscrollBehaviorY;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    html.style.height = "100%";
    body.style.height = "100dvh";
    html.style.overscrollBehaviorY = "none";
    body.style.overscrollBehaviorY = "none";

    const stopOuterTouchScroll = (event: TouchEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("[data-profile-scrollable='true']")) return;
      event.preventDefault();
    };

    document.addEventListener("touchmove", stopOuterTouchScroll, { passive: false });

    return () => {
      document.removeEventListener("touchmove", stopOuterTouchScroll);
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.left = previousBodyLeft;
      body.style.right = previousBodyRight;
      body.style.width = previousBodyWidth;
      html.style.height = previousHtmlHeight;
      body.style.height = previousBodyHeight;
      html.style.overscrollBehaviorY = previousHtmlOverscroll;
      body.style.overscrollBehaviorY = previousBodyOverscroll;
      window.scrollTo(0, scrollY);
    };
  }, []);

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

  const handleCallClick = async (type: "voice" | "video") => {
    if (!profile || !user) return;
    const convId = await getOrCreateConversation(profile.id);
    if (convId) {
      await initiateCall(convId, profile.id, type);
    }
  };

  if (authLoading || loadingProfile) {
    return (
      <div className="fixed inset-0 overflow-hidden bg-[#030307] text-white">
        <div data-profile-scrollable="true" className="route-scroll-shell h-full overflow-y-auto">
          <ProfileSkeleton />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="fixed inset-0 overflow-hidden bg-[#030307] px-4 text-center text-white">
        <div data-profile-scrollable="true" className="route-scroll-shell flex h-full flex-col items-center justify-center overflow-y-auto">
          <p className="mb-2 text-2xl font-bold">
            Пользователь не найден
          </p>
          <p className="text-white/45">
            @{username} не существует
          </p>
        </div>
      </div>
    );
  }

  const isOwn = user?.id === profile.id;
  const showCompactHeader = scrollTop > 88;
  const profileName = profile.display_name ?? profile.username;
  const profileStatus = profile.is_online || isOwn ? "online" : "last seen recently";

  return (
    <PageTransition className="fixed inset-0 overflow-hidden bg-[#030307] text-white">
      <motion.div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-28"
        initial={false}
        animate={{
          opacity: showCompactHeader ? 1 : 0,
        }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        style={{
          background:
            "linear-gradient(180deg, rgba(3,3,7,0.9) 0%, rgba(3,3,7,0.68) 48%, rgba(3,3,7,0) 100%)",
          backdropFilter: showCompactHeader ? "blur(18px) saturate(165%)" : "blur(0px)",
          WebkitBackdropFilter: showCompactHeader ? "blur(18px) saturate(165%)" : "blur(0px)",
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.35rem)]">
        <motion.div
          initial={false}
          animate={{
            opacity: showCompactHeader ? 1 : 0,
            y: showCompactHeader ? 0 : -18,
            scale: showCompactHeader ? 1 : 0.94,
            filter: showCompactHeader ? "blur(0px)" : "blur(8px)",
          }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto mx-auto max-w-fit"
        >
          <div className="glass-panel flex items-center gap-3 rounded-full border border-white/10 px-3 py-2 shadow-[0_20px_48px_rgba(0,0,0,0.42)]">
            <div className="relative h-10 w-10 overflow-hidden rounded-full bg-gradient-to-br from-[#8aa3ff] via-[#6b67ff] to-[#d64cff]">
              {profile.avatar_url ? (
                <Image src={profile.avatar_url} alt={profileName} fill className="object-cover" sizes="40px" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-white">
                  {profileName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{profileName}</p>
              <p className="truncate text-xs text-white/52">{profileStatus}</p>
            </div>
          </div>
        </motion.div>
      </div>

      <div
        ref={scrollRef}
        data-profile-scrollable="true"
        className="route-scroll-shell h-full overflow-y-auto overscroll-y-none"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="mx-auto max-w-2xl pb-10">
          <ProfileHeader
            profile={profile}
            isOwnProfile={isOwn}
            scrollY={scrollTop}
            onMessageClick={handleMessageClick}
            onCallClick={handleCallClick}
            onProfileUpdated={(nextProfile) => {
              setProfile(nextProfile);
              setProfileCache(username, {
                profile: nextProfile,
                posts,
                loadedAt: Date.now(),
              });
            }}
          />

          <motion.div
            id="profile-posts"
            className="px-4 pt-4"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.12 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="glass-panel mx-auto mb-7 flex w-fit rounded-full p-1 shadow-[0_20px_48px_rgba(0,0,0,0.34)]"
              whileHover={{ y: -1, scale: 1.01 }}
              whileTap={{ scale: 0.985 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
            >
              <button className="glass-button inline-flex items-center gap-2 rounded-full bg-white/10 px-6 py-2.5 text-[18px] font-semibold text-white">
                Posts
              </button>
            </motion.div>
            <PostGrid posts={posts} loading={loadingPosts} />
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
