"use client";

import React, { useState, useCallback, useEffect, memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Lock,
  MessageCircle,
  Share2,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/Avatar";
import { LikeButton } from "@/components/shared/LikeButton";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ImageCarousel } from "@/components/shared/ImageCarousel";
import type { Post } from "@/lib/supabase";
import type { FeedDensity } from "@/lib/store";
import { CommentsThread } from "./CommentsThread";

interface PostCardProps {
  post: Post;
  initialLiked?: boolean;
  /** Mark as LCP candidate — loads image eagerly with priority */
  priority?: boolean;
  onDelete?: (postId: string) => void;
  density?: FeedDensity;
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

export const PostCard = memo(function PostCard({
  post,
  initialLiked,
  priority,
  onDelete,
  density = "cozy",
}: PostCardProps) {
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
  const [commentCount, setCommentCount] = useState(post.comments_count ?? 0);
  const profile = post.profiles;
  const name = profile?.display_name ?? profile?.username ?? "Unknown";

  // Sync counts from parent (real-time updates)
  const displayLikeCount = post.likes_count !== likeCount && !likePending
    ? post.likes_count ?? likeCount
    : likeCount;
  const displayCommentCount = post.comments_count !== commentCount
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

  const handleToggleComments = useCallback(async () => {
    const opening = !showComments;
    setShowComments(opening);
  }, [showComments]);

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
        className={cn(
          "rounded-2xl bg-[var(--bg-surface)] border-[var(--border)] p-0 gap-0 cursor-pointer",
          density === "compact" && "rounded-xl"
        )}
        onClick={navigateToPost}
      >
        <CardContent
          className={cn("p-4 space-y-3", density === "compact" && "p-3 space-y-2.5")}
        >
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
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    post.visibility === "followers"
                      ? "bg-amber-500/10 text-amber-300"
                      : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
                  )}
                >
                  {post.visibility === "followers" ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <Globe className="h-3 w-3" />
                  )}
                  {post.visibility === "followers" ? "Подписчики" : "Публично"}
                </span>
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
            <p
              className={cn(
                "text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap",
                density === "compact" && "text-[13px]"
              )}
            >
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
                  <CommentsThread
                    postId={post.id}
                    currentUserId={user?.id}
                    compact
                    onCountChange={setCommentCount}
                  />
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
