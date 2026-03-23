"use client";

import React from "react";
import { PostCard } from "@/components/feed/PostCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Post } from "@/lib/supabase";

interface PostGridProps {
  posts: Post[];
  loading?: boolean;
}

export function PostGrid({ posts, loading }: PostGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn(
              "rounded-xl",
              i % 3 === 0 ? "aspect-[4/5]" : "aspect-square"
            )}
          />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div className="size-20 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center">
          <ImageOff className="size-8 text-[var(--text-secondary)]/30" />
        </div>
        <div>
          <p className="font-semibold text-[var(--text-primary)]">
            Постов пока нет
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Посты появятся здесь
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
