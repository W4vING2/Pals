"use client";

import React, { useState, useCallback, useEffect, memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Share2, Send, Loader2, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/Avatar";
import { LikeButton } from "@/components/shared/LikeButton";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ImageCarousel } from "@/components/shared/ImageCarousel";
import type { Post } from "@/lib/supabase";

interface PostCardProps {
  post: Post;
  initialLiked?: boolean;
  /** Mark as LCP candidate — loads image eagerly with priority */
  priority?: boolean;
  onDelete?: (postId: string) => void;
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

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export const PostCard = memo(function PostCard({ post, initialLiked, priority, onDelete }: PostCardProps) {
  const { user } = useAuthStore();
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked ?? false);
  const [likeCount, setLikeCount] = useState(post.likes_count ?? 0);
  const [deleting, setDeleting] = useState(false);

  // Load like status from DB when initialLiked isn't provided
  useEffect(() => {
    if (initialLiked !== undefined || !user) return;
    const supabase = getSupabaseBrowserClient();
    supabase
      .from("likes")
      .select("id")
      .eq("post_id", post.id)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setLiked(true); });
  }, [initialLiked, user, post.id]);

  // Sync when parent passes initialLiked later (after batch load)
  useEffect(() => {
    if (initialLiked !== undefined) setLiked(initialLiked);
  }, [initialLiked]);
  const [likePending, setLikePending] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Array<{id: string; content: string; created_at: string; user_id?: string; profiles?: {username: string; display_name: string | null; avatar_url: string | null}}>>([]);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comments_count ?? 0);
  const profile = post.profiles;
  const name = profile?.display_name ?? profile?.username ?? "Unknown";

  // Sync counts from parent (real-time updates)
  const displayLikeCount = post.likes_count !== likeCount && !likePending
    ? post.likes_count ?? likeCount
    : likeCount;
  const displayCommentCount = post.comments_count !== commentCount && !commentLoading
    ? post.comments_count ?? commentCount
    : commentCount;

  const toggleLike = useCallback(async () => {
    if (!user || likePending) return;
    setLikePending(true);
    const supabase = getSupabaseBrowserClient();

    if (liked) {
      // Optimistic
      setLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));
      await supabase
        .from("likes")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", user.id);
    } else {
      // Optimistic
      setLiked(true);
      setLikeCount((c) => c + 1);
      // Upsert to avoid duplicate key error on rapid toggle
      const { error } = await supabase.from("likes").upsert(
        { post_id: post.id, user_id: user.id },
        { onConflict: "user_id,post_id", ignoreDuplicates: true }
      );
      if (error) {
        // Revert on error
        setLiked(false);
        setLikeCount((c) => Math.max(0, c - 1));
      }
    }
    setLikePending(false);
  }, [user, liked, likePending, post.id]);

  const loadComments = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, profiles:user_id (username, display_name, avatar_url)")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });
    if (data) setComments(data as typeof comments);
  }, [post.id]);

  const handleToggleComments = useCallback(async () => {
    const opening = !showComments;
    setShowComments(opening);
    if (opening) await loadComments();
  }, [showComments, loadComments]);

  const submitComment = useCallback(async () => {
    if (!user || !commentText.trim()) return;
    setCommentLoading(true);
    const supabase = getSupabaseBrowserClient();
    await supabase.from("comments").insert({
      post_id: post.id,
      user_id: user.id,
      content: commentText.trim(),
    });
    setCommentText("");
    setCommentCount((c) => c + 1);
    await loadComments();
    setCommentLoading(false);
  }, [user, commentText, post.id, loadComments]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!user) return;
    if (!window.confirm("Удалить комментарий?")) return;
    const supabase = getSupabaseBrowserClient();
    await supabase.from("comments").delete().eq("id", commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    setCommentCount((c) => Math.max(0, c - 1));
  }, [user]);

  const handleShare = useCallback(async () => {
    const postUrl = `${window.location.origin}/post/${post.id}`;
    if (navigator.share) {
      await navigator.share({
        title: `Post by ${name}`,
        text: post.content,
        url: postUrl,
      });
    } else {
      await navigator.clipboard.writeText(postUrl);
    }
  }, [name, post.content, post.id]);

  const handleDelete = useCallback(async () => {
    if (!user || deleting) return;
    if (!window.confirm("Удалить пост?")) return;
    setDeleting(true);
    const supabase = getSupabaseBrowserClient();
    await supabase.from("posts").delete().eq("id", post.id);
    onDelete?.(post.id);
    setDeleting(false);
  }, [user, deleting, post.id, onDelete]);

  const navigateToPost = useCallback(() => {
    router.push(`/post/${post.id}`);
  }, [router, post.id]);

  return (
    <div className="animate-fade-in">
      <Card
        className="rounded-2xl bg-[var(--bg-surface)] border-[var(--border)] p-0 gap-0 cursor-pointer"
        onClick={navigateToPost}
      >
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Link href={`/profile/${profile?.username ?? ""}`} onClick={(e) => e.stopPropagation()}>
              <Avatar size="default">
                {profile?.avatar_url ? (
                  <AvatarImage src={profile.avatar_url} />
                ) : null}
                <AvatarFallback>{getInitials(name)}</AvatarFallback>
              </Avatar>
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  href={`/profile/${profile?.username ?? ""}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-semibold text-sm text-[var(--text-primary)] hover:underline truncate"
                >
                  {name}
                </Link>
                <span className="text-xs text-[var(--text-secondary)]">
                  {timeAgo(post.created_at)}
                </span>
                {user && post.user_id === user.id && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                    disabled={deleting}
                    className="ml-auto p-1 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors active:scale-95"
                    title="Удалить"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {profile?.username && (
                <p className="text-xs text-[var(--text-secondary)]">@{profile.username}</p>
              )}
            </div>
          </div>

          {/* Content */}
          {post.content && (
            <p className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
              {post.content.split(/(#[\wа-яА-ЯёЁ]+)/g).map((part, i) =>
                part.startsWith("#") ? (
                  <Link key={i} href={`/search?q=${encodeURIComponent(part)}`}
                    className="text-[var(--accent-blue)] hover:underline"
                    onClick={(e) => e.stopPropagation()}>
                    {part}
                  </Link>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </p>
          )}

          {/* Image carousel or single image */}
          {(post.image_urls?.length > 0 || post.image_url) && (
            <div onClick={(e) => e.stopPropagation()}>
              <ImageCarousel images={post.image_urls?.length > 0 ? post.image_urls : post.image_url ? [post.image_url] : []} priority={priority} />
            </div>
          )}

          {/* Actions */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div className="flex items-center gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
            {/* Like */}
            <LikeButton
              liked={liked}
              count={displayLikeCount}
              onToggle={toggleLike}
              className="px-3 py-1.5 rounded-xl hover:bg-[var(--bg-elevated)] transition-colors"
            />

            {/* Comment */}
            <button
              onClick={handleToggleComments}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium",
                "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)]",
                "transition-colors active:scale-95",
                showComments && "text-[var(--accent-blue)]"
              )}
            >
              <MessageCircle className="w-[18px] h-[18px]" />
              {displayCommentCount > 0 && (
                <span className="tabular-nums">{displayCommentCount}</span>
              )}
            </button>

            {/* Share */}
            <button
              onClick={handleShare}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium ml-auto",
                "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)]",
                "transition-colors active:scale-95"
              )}
            >
              <Share2 className="w-[18px] h-[18px]" />
            </button>
          </div>

          {/* Comments section */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div onClick={(e) => e.stopPropagation()}>
          <AnimatePresence>
            {showComments && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="border-t border-[var(--border)] pt-3 space-y-3">
                  {/* Existing comments */}
                  {comments.length > 0 && (
                    <div className="space-y-2.5 max-h-60 overflow-y-auto">
                      {comments.map((c) => (
                        <div key={c.id} className="flex gap-2 group/comment">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-emerald-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">
                            {(c.profiles?.display_name ?? c.profiles?.username ?? "?")[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-xs font-semibold text-[var(--text-primary)]">
                                {c.profiles?.display_name ?? c.profiles?.username}
                              </span>
                              <span className="text-[10px] text-[var(--text-secondary)]">
                                {timeAgo(c.created_at)}
                              </span>
                              {user && c.user_id === user.id && (
                                <button
                                  onClick={() => handleDeleteComment(c.id)}
                                  className="opacity-0 group-hover/comment:opacity-100 ml-auto p-0.5 rounded text-red-500 hover:bg-red-500/10 transition-all"
                                  title="Удалить"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-[var(--text-primary)] leading-relaxed">{c.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Comment input */}
                  {user && (
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") submitComment(); }}
                        placeholder="Написать комментарий..."
                        className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none input-focus transition-colors"
                      />
                      <button
                        onClick={submitComment}
                        disabled={!commentText.trim() || commentLoading}
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors active:scale-95",
                          commentText.trim()
                            ? "bg-[var(--accent-blue)] text-white"
                            : "text-[var(--text-secondary)]"
                        )}
                      >
                        {commentLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
