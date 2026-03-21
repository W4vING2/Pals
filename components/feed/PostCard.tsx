"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import type { Post } from "@/lib/supabase";

interface PostCardProps {
  post: Post;
  onUpdate?: (post: Post) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

export function PostCard({ post, onUpdate }: PostCardProps) {
  const { user } = useAuthStore();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes_count ?? 0);
  const [likePending, setLikePending] = useState(false);

  const profile = post.profiles;
  const name = profile?.display_name ?? profile?.username ?? "Unknown";

  const toggleLike = async () => {
    if (!user || likePending) return;
    setLikePending(true);
    const supabase = getSupabaseBrowserClient();

    if (liked) {
      await supabase
        .from("likes")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", user.id);
      setLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from("likes").insert({ post_id: post.id, user_id: user.id });
      setLiked(true);
      setLikeCount((c) => c + 1);
    }
    setLikePending(false);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `Post by ${name}`,
        text: post.content,
        url: window.location.href,
      });
    } else {
      await navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <article className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] p-4 space-y-3 transition-all duration-150 hover:border-[var(--border-strong)]">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href={`/profile/${profile?.username ?? ""}`}>
          <Avatar
            src={profile?.avatar_url}
            name={name}
            size="md"
          />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/profile/${profile?.username ?? ""}`}
              className="font-semibold text-sm text-[var(--text-primary)] hover:underline truncate"
            >
              {name}
            </Link>
            {profile?.username && (
              <span className="text-xs text-[var(--text-secondary)]">@{profile.username}</span>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">{timeAgo(post.created_at)}</p>
        </div>
      </div>

      {/* Content */}
      {post.content && (
        <p className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
          {post.content}
        </p>
      )}

      {/* Image */}
      {post.image_url && (
        <div className="relative rounded-2xl overflow-hidden bg-[var(--bg-elevated)]" style={{ aspectRatio: "16/9" }}>
          <Image
            src={post.image_url}
            alt="Post image"
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 600px"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 pt-1">
        {/* Like */}
        <button
          onClick={toggleLike}
          disabled={likePending}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-150 active:scale-95 ${
            liked
              ? "text-red-400 bg-red-400/10 hover:bg-red-400/20"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-red-400"
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
          <span>{likeCount > 0 ? likeCount : ""}</span>
        </button>

        {/* Comment */}
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)] transition-all duration-150 active:scale-95">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
          </svg>
          <span>{post.comments_count > 0 ? post.comments_count : ""}</span>
        </button>

        {/* Share */}
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-mint)] transition-all duration-150 active:scale-95 ml-auto"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </button>
      </div>
    </article>
  );
}
