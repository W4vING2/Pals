"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CornerDownRight, Loader2, Send, Trash2, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Comment, Profile } from "@/lib/supabase";

type CommentWithProfile = Comment & { profiles?: Profile };

interface CommentsThreadProps {
  postId: string;
  currentUserId?: string | null;
  compact?: boolean;
  className?: string;
  emptyMessage?: string;
  onCountChange?: (count: number) => void;
}

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

function getAuthorName(comment: CommentWithProfile) {
  return comment.profiles?.display_name ?? comment.profiles?.username ?? "Пользователь";
}

function getReplyParentId(comment: CommentWithProfile | null) {
  if (!comment) return null;
  return comment.parent_comment_id ?? comment.id;
}

export function CommentsThread({
  postId,
  currentUserId,
  compact = false,
  className,
  emptyMessage = "Комментариев пока нет. Будьте первым!",
  onCountChange,
}: CommentsThreadProps) {
  const [comments, setComments] = useState<CommentWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<CommentWithProfile | null>(null);

  const loadComments = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("comments")
      .select(
        "id, content, created_at, updated_at, user_id, post_id, parent_comment_id, profiles:user_id (id, username, display_name, avatar_url)"
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    const next = (data ?? []) as CommentWithProfile[];
    setComments(next);
    onCountChange?.(next.length);
    setLoading(false);
  }, [onCountChange, postId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`comments-thread:${postId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `post_id=eq.${postId}`,
        },
        () => loadComments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadComments, postId]);

  const { topLevelComments, repliesByParent } = useMemo(() => {
    const topLevel: CommentWithProfile[] = [];
    const replies = new Map<string, CommentWithProfile[]>();
    const commentIds = new Set(comments.map((comment) => comment.id));

    for (const comment of comments) {
      if (!comment.parent_comment_id || !commentIds.has(comment.parent_comment_id)) {
        topLevel.push(comment);
        continue;
      }

      const existing = replies.get(comment.parent_comment_id) ?? [];
      existing.push(comment);
      replies.set(comment.parent_comment_id, existing);
    }

    return { topLevelComments: topLevel, repliesByParent: replies };
  }, [comments]);

  const submitComment = useCallback(async () => {
    if (!currentUserId || !commentText.trim()) return;
    setSubmitting(true);
    const supabase = getSupabaseBrowserClient();
    await supabase.from("comments").insert({
      post_id: postId,
      user_id: currentUserId,
      parent_comment_id: getReplyParentId(replyTarget),
      content: commentText.trim(),
    });
    setCommentText("");
    setReplyTarget(null);
    setSubmitting(false);
  }, [commentText, currentUserId, postId, replyTarget]);

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      if (!currentUserId) return;
      if (!window.confirm("Удалить комментарий?")) return;
      setDeletingId(commentId);
      const supabase = getSupabaseBrowserClient();
      await supabase.from("comments").delete().eq("id", commentId);
      setReplyTarget((current) => (current?.id === commentId ? null : current));
      setDeletingId(null);
      await loadComments();
    },
    [currentUserId, loadComments]
  );

  const renderComment = (
    comment: CommentWithProfile,
    level: 0 | 1,
    rootParent?: CommentWithProfile
  ) => {
    const authorName = getAuthorName(comment);
    const replies = repliesByParent.get(comment.id) ?? [];
    const isOwn = currentUserId === comment.user_id;
    const parentName = rootParent ? getAuthorName(rootParent) : null;

    return (
      <div
        key={comment.id}
        className={cn(
          "group/comment flex gap-3",
          level === 1 && "rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/45 p-3"
        )}
      >
        <Avatar className={cn(level === 0 ? "size-8" : "size-7", "shrink-0")}>
          {comment.profiles?.avatar_url ? (
            <AvatarImage src={comment.profiles.avatar_url} />
          ) : null}
          <AvatarFallback
            className={cn(
              "bg-[var(--bg-elevated)] text-[var(--text-primary)]",
              level === 0 ? "text-xs" : "text-[10px]"
            )}
          >
            {authorName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "font-semibold text-[var(--text-primary)]",
                compact ? "text-xs" : "text-sm"
              )}
            >
              {authorName}
            </span>
            <span className="text-[10px] text-[var(--text-secondary)]">
              {timeAgo(comment.created_at)}
            </span>
            {isOwn && (
              <button
                type="button"
                onClick={() => handleDeleteComment(comment.id)}
                disabled={deletingId === comment.id}
                className="ml-auto rounded-lg p-1 text-red-500 opacity-0 transition-all hover:bg-red-500/10 group-hover/comment:opacity-100 disabled:opacity-60"
                title="Удалить"
              >
                {deletingId === comment.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>

          {parentName && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--bg-surface)] px-2 py-1 text-[10px] text-[var(--text-secondary)]">
              <CornerDownRight className="h-3 w-3" />
              ответ {parentName}
            </div>
          )}

          <p
            className={cn(
              "mt-1 leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap",
              compact ? "text-xs" : "text-sm"
            )}
          >
            {comment.content}
          </p>

          <div className="mt-2 flex items-center gap-3">
            {currentUserId && (
              <button
                type="button"
                onClick={() => setReplyTarget(comment)}
                className="text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-blue)]"
              >
                Ответить
              </button>
            )}
            {level === 0 && replies.length > 0 && (
              <span className="text-[11px] text-[var(--text-secondary)]">
                {replies.length}{" "}
                {replies.length === 1
                  ? "ответ"
                  : replies.length < 5
                    ? "ответа"
                    : "ответов"}
              </span>
            )}
          </div>

          {level === 0 && replies.length > 0 && (
            <div className="mt-3 space-y-2 border-l border-[var(--border)] pl-4">
              {replies.map((reply) => renderComment(reply, 1, comment))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={cn("space-y-4", className)}>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: compact ? 2 : 3 }).map((_, index) => (
            <div key={index} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24 rounded" />
                <Skeleton className="h-3 w-full rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : topLevelComments.length === 0 ? (
        <p
          className={cn(
            "py-4 text-center text-[var(--text-secondary)]",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {emptyMessage}
        </p>
      ) : (
        <div className={cn("space-y-4", compact && "max-h-72 overflow-y-auto pr-1")}>
          {topLevelComments.map((comment) => renderComment(comment, 0))}
        </div>
      )}

      {currentUserId && (
        <div className="space-y-2">
          {replyTarget && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
              <div className="min-w-0">
                <p className="font-medium text-[var(--text-primary)]">
                  Ответ {getAuthorName(replyTarget)}
                </p>
                <p className="truncate">{replyTarget.content}</p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                className="rounded-lg p-1 transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
                aria-label="Отменить ответ"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void submitComment();
                }
              }}
              placeholder={
                replyTarget
                  ? `Ответить ${getAuthorName(replyTarget)}...`
                  : "Написать комментарий..."
              }
              className={cn(
                "flex-1 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none input-focus transition-colors",
                compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
              )}
            />
            <Button
              onClick={() => void submitComment()}
              disabled={!commentText.trim() || submitting}
              size={compact ? "icon-sm" : "icon"}
              className="rounded-full"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
