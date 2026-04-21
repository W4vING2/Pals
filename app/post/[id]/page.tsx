"use client";

import React, { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { PostCard } from "@/components/feed/PostCard";
import { PageTransition } from "@/components/layout/PageTransition";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Post } from "@/lib/supabase";
import { canViewPost } from "@/lib/postVisibility";
import { CommentsThread } from "@/components/feed/CommentsThread";

interface PostPageProps {
  params: Promise<{ id: string }>;
}

export default function PostPage({ params }: PostPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [liked, setLiked] = useState(false);
  const [loadingPost, setLoadingPost] = useState(true);
  const [deletingPost, setDeletingPost] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  const handleDeletePost = useCallback(async () => {
    if (!user || deletingPost || !id) return;
    if (!window.confirm("Удалить пост?")) return;
    setDeletingPost(true);
    const supabase = getSupabaseBrowserClient();
    await supabase.from("posts").delete().eq("id", id);
    router.back();
  }, [user, deletingPost, id, router]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [user, authLoading, router]);

  // Load post
  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoadingPost(true);
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase
        .from("posts")
        .select("*, profiles:user_id (id, username, display_name, avatar_url)")
        .eq("id", id)
        .single();

      if (data) {
        const postData = data as Post;
        const { data: followingData } = user
          ? await supabase
              .from("follows")
              .select("following_id")
              .eq("follower_id", user.id)
          : { data: [] };
        const followingIds = new Set(
          followingData?.map((item) => item.following_id) ?? []
        );
        if (user?.id) followingIds.add(user.id);

        if (canViewPost(postData, user?.id, followingIds)) {
          setPost(postData);
          setCommentCount(postData.comments_count ?? 0);
        } else {
          setPost(null);
        }
      }
      setLoadingPost(false);
    };
    load();
  }, [id, user]);

  // Load like status
  useEffect(() => {
    if (!user || !id) return;
    const supabase = getSupabaseBrowserClient();
    supabase
      .from("likes")
      .select("id")
      .eq("post_id", id)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setLiked(!!data));
  }, [user, id]);

  if (authLoading || loadingPost) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-20 rounded-xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          Пост не найден
        </p>
        <button
          onClick={() => router.back()}
          className="text-[var(--accent-blue)] text-sm hover:underline"
        >
          Назад
        </button>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад
        </button>

        {/* Post */}
        <PostCard post={post} initialLiked={liked} onDelete={() => handleDeletePost()} />

        {/* Comments section */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Комментарии ({commentCount})
            </h2>
          </div>

          <div className="p-4">
            <CommentsThread
              postId={id}
              currentUserId={user?.id}
              onCountChange={setCommentCount}
            />
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
