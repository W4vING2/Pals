"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { PostCard } from "@/components/feed/PostCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Grid2X2, List, Heart, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "@/components/shared/ImageLightbox";
import type { Post } from "@/lib/supabase";

interface PostGridProps {
  posts: Post[];
  loading?: boolean;
}

export function PostGrid({ posts, loading }: PostGridProps) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

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
      {/* View toggle */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] pb-3">
        <button
          onClick={() => setView("grid")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-150",
            view === "grid"
              ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
          )}
        >
          <Grid2X2 className="size-4" />
          Сетка
        </button>
        <button
          onClick={() => setView("list")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-150",
            view === "list"
              ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
          )}
        >
          <List className="size-4" />
          Список
        </button>
      </div>

      {view === "grid" ? (
        <div className="columns-2 gap-2 space-y-2">
          {posts.map((post, i) => (
            <Link key={post.id} href={`/post/${post.id}`}>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="relative break-inside-avoid bg-[var(--bg-elevated)] rounded-xl overflow-hidden group cursor-pointer"
            >
              {post.image_url ? (
                <div
                  className="relative aspect-auto cursor-zoom-in"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setLightboxSrc(post.image_url!);
                  }}
                >
                  <Image
                    src={post.image_url}
                    alt="Post"
                    width={400}
                    height={400}
                    className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-300"
                    sizes="(max-width: 640px) 50vw, 300px"
                  />
                </div>
              ) : (
                <div className="p-4 min-h-[8rem] flex items-center justify-center">
                  <p className="text-sm text-[var(--text-secondary)] line-clamp-6 text-center leading-relaxed">
                    {post.content}
                  </p>
                </div>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center gap-3">
                <span className="flex items-center gap-1.5 text-white text-sm font-semibold">
                  <Heart className="size-4 fill-white" />
                  {post.likes_count}
                </span>
              </div>
            </motion.div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
      <ImageLightbox src={lightboxSrc} alt="Post image" onClose={() => setLightboxSrc(null)} />
    </div>
  );
}
