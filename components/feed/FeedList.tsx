"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { FileText } from "lucide-react";
import { PostCard } from "./PostCard";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Post } from "@/lib/supabase";

interface FeedListProps {
  posts: Post[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  likedPostIds?: Set<string>;
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

export function FeedList({ posts, loading, hasMore, onLoadMore, likedPostIds }: FeedListProps) {
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
          <p className="font-semibold text-[var(--text-primary)]">Nothing here yet</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Follow people or create your first post!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((post, idx) => (
        <PostCard
          key={post.id}
          post={post}
          initialLiked={likedPostIds?.has(post.id)}
          priority={idx === 0 && !!post.image_url}
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
          You&apos;ve reached the end
        </p>
      )}
    </div>
  );
}
