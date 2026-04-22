"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Skeleton } from "@/components/ui/Skeleton";
import { ImageOff } from "lucide-react";
import type { Post } from "@/lib/supabase";

interface PostGridProps {
  posts: Post[];
  loading?: boolean;
}

function firstImage(post: Post) {
  return post.image_url || post.image_urls?.[0] || null;
}

export function PostGrid({ posts, loading }: PostGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-px bg-[#111]">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-none bg-white/8" />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-14 text-center text-white">
        <div className="flex h-36 w-36 items-center justify-center rounded-[2rem] bg-[#17171d] shadow-[0_24px_64px_rgba(0,0,0,0.34)]">
          <ImageOff className="h-14 w-14 text-[#ed78ff]/60" />
        </div>
        <p className="text-[27px] font-semibold tracking-wide text-white">No posts yet...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-px bg-black">
      {posts.map((post) => {
        const imageUrl = firstImage(post);
        return (
          <Link
            key={post.id}
            href={`/post/${post.id}`}
            className="group relative aspect-square overflow-hidden bg-[#15151b]"
          >
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={post.content || "Пост"}
                fill
                className="object-cover transition duration-300 group-hover:scale-105"
                sizes="(max-width: 768px) 33vw, 220px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#191922] to-[#0b0b10] p-3">
                <p className="line-clamp-5 text-center text-xs font-medium leading-snug text-white/72">
                  {post.content || "Пост"}
                </p>
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/12" />
          </Link>
        );
      })}
    </div>
  );
}
