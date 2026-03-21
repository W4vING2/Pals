"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { PostGrid } from "@/components/profile/PostGrid";
import { SkeletonProfile } from "@/components/ui/Skeleton";
import type { Profile, Post } from "@/lib/supabase";

interface ProfilePageProps {
  params: Promise<{ username: string }>;
}

export default function ProfilePage({ params }: ProfilePageProps) {
  const { username } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { getOrCreateConversation } = useMessages();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!username) return;
    const load = async () => {
      setLoadingProfile(true);
      const supabase = getSupabaseBrowserClient();

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .single();

      if (!profileData) {
        setLoadingProfile(false);
        return;
      }

      setProfile(profileData as Profile);
      setLoadingProfile(false);

      // Load posts
      setLoadingPosts(true);
      const { data: postsData } = await supabase
        .from("posts")
        .select("*, profiles:user_id (id, username, display_name, avatar_url)")
        .eq("user_id", profileData.id)
        .order("created_at", { ascending: false });

      if (postsData) {
        setPosts(postsData as Post[]);
      }
      setLoadingPosts(false);
    };

    load();
  }, [username]);

  const handleMessageClick = async () => {
    if (!profile || !user) return;
    const convId = await getOrCreateConversation(profile.id);
    if (convId) {
      router.push(`/messages?conversation=${convId}`);
    }
  };

  if (authLoading || loadingProfile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <SkeletonProfile />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-2xl font-bold text-[var(--text-primary)] mb-2">User not found</p>
        <p className="text-[var(--text-secondary)]">@{username} doesn&apos;t exist</p>
      </div>
    );
  }

  const isOwn = user?.id === profile.id;

  return (
    <div className="max-w-2xl mx-auto pb-6">
      <ProfileHeader
        profile={profile}
        isOwnProfile={isOwn}
        onMessageClick={handleMessageClick}
        onProfileUpdated={setProfile}
      />

      <div className="px-4 mt-4">
        <PostGrid posts={posts} loading={loadingPosts} />
      </div>
    </div>
  );
}
