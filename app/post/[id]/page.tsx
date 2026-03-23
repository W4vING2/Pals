"use client";

import React, { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { PostCard } from "@/components/feed/PostCard";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/Avatar";
import { PageTransition } from "@/components/layout/PageTransition";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import type { Post } from "@/lib/supabase";

type CommentWithProfile = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles?: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "сейчас";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

interface PostPageProps {
  params: Promise<{ id: string }>;
}

export default function PostPage({ params }: PostPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<CommentWithProfile[]>([]);
  const [liked, setLiked] = useState(false);
  const [loadingPost, setLoadingPost] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);

  const handleDeletePost = useCallback(async () => {
    if (!user || deletingPost || !id) return;
    if (!window.confirm("Удалить пост?")) return;
    setDeletingPost(true);
    const supabase = getSupabaseBrowserClient();
    await supabase.from("posts").delete().eq("id", id);
    router.back();
  }, [user, deletingPost, id, router]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!user) return;
    if (!window.confirm("Удалить комментарий?")) return;
    const supabase = getSupabaseBrowserClient();
    await supabase.from("comments").delete().eq("id", commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }, [user]);

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

      if (data) setPost(data as Post);
      setLoadingPost(false);
    };
    load();
  }, [id]);

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

  // Load comments
  const loadComments = useCallback(async () => {
    if (!id) return;
    setLoadingComments(true);
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("comments")
      .select(
        "id, content, created_at, user_id, profiles:user_id (username, display_name, avatar_url)"
      )
      .eq("post_id", id)
      .order("created_at", { ascending: true });
    if (data) setComments(data as CommentWithProfile[]);
    setLoadingComments(false);
  }, [id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Real-time comments
  useEffect(() => {
    if (!id) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`post-comments:${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `post_id=eq.${id}`,
        },
        () => loadComments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, loadComments]);

  const submitComment = async () => {
    if (!user || !commentText.trim() || !id) return;
    setSubmitting(true);
    const supabase = getSupabaseBrowserClient();
    await supabase.from("comments").insert({
      post_id: id,
      user_id: user.id,
      content: commentText.trim(),
    });
    setCommentText("");
    setSubmitting(false);
  };

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
              Комментарии ({post.comments_count ?? 0})
            </h2>
          </div>

          {/* Comment list */}
          <div className="divide-y divide-[var(--border)] max-h-[60vh] overflow-y-auto">
            {loadingComments ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3 w-24 rounded" />
                      <Skeleton className="h-3 w-full rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : comments.length === 0 ? (
              <p className="text-center text-sm text-[var(--text-secondary)] py-8">
                Комментариев пока нет. Будьте первым!
              </p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="flex gap-3 p-4 group/comment">
                  <Avatar className="size-8 shrink-0">
                    {c.profiles?.avatar_url ? (
                      <AvatarImage src={c.profiles.avatar_url} />
                    ) : null}
                    <AvatarFallback className="text-xs bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                      {(
                        c.profiles?.display_name ??
                        c.profiles?.username ??
                        "?"
                      )[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {c.profiles?.display_name ?? c.profiles?.username}
                      </span>
                      <span className="text-[10px] text-[var(--text-secondary)]">
                        {timeAgo(c.created_at)}
                      </span>
                      {user && c.user_id === user.id && (
                        <button
                          onClick={() => handleDeleteComment(c.id)}
                          className="opacity-0 group-hover/comment:opacity-100 ml-auto p-1 rounded-lg text-red-500 hover:bg-red-500/10 transition-all"
                          title="Удалить"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-primary)] leading-relaxed mt-0.5">
                      {c.content}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Comment input */}
          {user && (
            <div className="flex gap-2 items-center p-4 border-t border-[var(--border)]">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitComment();
                }}
                placeholder="Написать комментарий..."
                className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none input-focus transition-colors"
              />
              <button
                onClick={submitComment}
                disabled={!commentText.trim() || submitting}
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors active:scale-95",
                  commentText.trim()
                    ? "bg-[var(--accent-blue)] text-white"
                    : "text-[var(--text-secondary)]"
                )}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
