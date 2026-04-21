"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { FileText } from "lucide-react";
import { PostCard } from "./PostCard";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Post } from "@/lib/supabase";
import type { FeedDensity } from "@/lib/store";
import { cn } from "@/lib/utils";

interface FeedListProps {
  posts: Post[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  likedPostIds?: Set<string>;
  onDeletePost?: (postId: string) => void;
  density?: FeedDensity;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}

function PostSkeleton() {
  return (
    <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] p-4 space-y-3">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-28 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
        </div>
      </div>
      {/* Content skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-full rounded" />
        <Skeleton className="h-3.5 w-3/4 rounded" />
      </div>
      {/* Image skeleton */}
      <Skeleton className="h-44 w-full rounded-xl" />
      {/* Actions skeleton */}
      <div className="flex items-center gap-3 pt-1">
        <Skeleton className="h-7 w-16 rounded-xl" />
        <Skeleton className="h-7 w-16 rounded-xl" />
        <Skeleton className="h-7 w-10 rounded-xl ml-auto" />
      </div>
    </div>
  );
}

export function FeedList({
  posts,
  loading,
  hasMore,
  onLoadMore,
  likedPostIds,
  onDeletePost,
  density = "cozy",
  emptyTitle = "Пока ничего нет",
  emptyDescription = "Подпишитесь на людей или создайте первый пост!",
  emptyAction,
}: FeedListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore && !loading) {
        onLoadMore();
      }
    },
    [hasMore, loading, onLoadMore]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver]);

  if (!loading && posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] flex items-center justify-center">
          <FileText className="w-8 h-8 text-[var(--text-secondary)] opacity-40" />
        </div>
        <div>
          <p className="font-semibold text-[var(--text-primary)]">{emptyTitle}</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {emptyDescription}
          </p>
        </div>
        {emptyAction}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", density === "compact" && "space-y-2")}>
      {posts.map((post, idx) => (
        <PostCard
          key={post.id}
          post={post}
          initialLiked={likedPostIds?.has(post.id)}
          priority={idx === 0 && !!post.image_url}
          onDelete={onDeletePost}
          density={density}
        />
      ))}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" aria-hidden="true" />

      {!hasMore && posts.length > 0 && (
        <p className="text-center text-xs text-[var(--text-secondary)] py-4">
          Вы долистали до конца
        </p>
      )}
    </div>
  );
}
