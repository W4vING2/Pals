"use client";

import React, { useState } from "react";
import Image from "next/image";
import { PostCard } from "@/components/feed/PostCard";
import type { Post } from "@/lib/supabase";

interface PostGridProps {
  posts: Post[];
  loading?: boolean;
}

export function PostGrid({ posts, loading }: PostGridProps) {
  const [view, setView] = useState<"grid" | "list">("grid");

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="skeleton aspect-square rounded-xl" />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <svg className="w-14 h-14 text-[var(--text-secondary)]/30" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="8" y="8" width="48" height="48" rx="8" />
          <circle cx="22" cy="24" r="4" />
          <path d="M8 44l14-12 10 10 8-8 16 10" />
        </svg>
        <p className="font-semibold text-[var(--text-primary)]">No posts yet</p>
        <p className="text-sm text-[var(--text-secondary)]">Posts will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] pb-3">
        <button
          onClick={() => setView("grid")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-150 ${
            view === "grid"
              ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 2.5A1.5 1.5 0 012.5 1h3A1.5 1.5 0 017 2.5v3A1.5 1.5 0 015.5 7h-3A1.5 1.5 0 011 5.5v-3zm8 0A1.5 1.5 0 0110.5 1h3A1.5 1.5 0 0115 2.5v3A1.5 1.5 0 0113.5 7h-3A1.5 1.5 0 019 5.5v-3zm-8 8A1.5 1.5 0 012.5 9h3A1.5 1.5 0 017 10.5v3A1.5 1.5 0 015.5 15h-3A1.5 1.5 0 011 13.5v-3zm8 0A1.5 1.5 0 0110.5 9h3a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 019 13.5v-3z" />
          </svg>
          Grid
        </button>
        <button
          onClick={() => setView("list")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-150 ${
            view === "list"
              ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M2 4a.5.5 0 01.5-.5h11a.5.5 0 010 1h-11A.5.5 0 012 4zm0 4a.5.5 0 01.5-.5h11a.5.5 0 010 1h-11A.5.5 0 012 8zm0 4a.5.5 0 01.5-.5h11a.5.5 0 010 1h-11A.5.5 0 012 12z" />
          </svg>
          List
        </button>
      </div>

      {view === "grid" ? (
        <div className="grid grid-cols-3 gap-1">
          {posts.map((post) => (
            <div key={post.id} className="relative aspect-square bg-[var(--bg-elevated)] rounded-xl overflow-hidden group cursor-pointer">
              {post.image_url ? (
                <Image
                  src={post.image_url}
                  alt="Post"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  sizes="(max-width: 640px) 33vw, 200px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-2">
                  <p className="text-xs text-[var(--text-secondary)] line-clamp-4 text-center">
                    {post.content}
                  </p>
                </div>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center gap-3">
                <span className="flex items-center gap-1 text-white text-sm font-semibold">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                  {post.likes_count}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
