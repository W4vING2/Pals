"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { PostCard } from "./PostCard";
import { SkeletonCard } from "@/components/ui/Skeleton";
import type { Post } from "@/lib/supabase";

interface FeedListProps {
  posts: Post[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function FeedList({ posts, loading, hasMore, onLoadMore }: FeedListProps) {
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
        <svg className="w-16 h-16 text-[var(--text-secondary)]/30" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="32" cy="32" r="28" />
          <path d="M20 38s4-6 12-6 12 6 12 6" />
          <circle cx="24" cy="26" r="2" fill="currentColor" />
          <circle cx="40" cy="26" r="2" fill="currentColor" />
        </svg>
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
    <div className="space-y-4">
      {posts.map((post) => (
        <div key={post.id} className="animate-slide-up">
          <PostCard post={post} />
        </div>
      ))}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
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
