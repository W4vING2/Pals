"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { LinkPreviewData } from "@/app/api/link-preview/route";

// Module-level cache to avoid re-fetching the same URL
const previewCache = new Map<string, LinkPreviewData | null>();

interface LinkPreviewProps {
  url: string;
  isMine: boolean;
}

export function LinkPreview({ url, isMine }: LinkPreviewProps) {
  const [data, setData] = useState<LinkPreviewData | null | undefined>(
    previewCache.has(url) ? previewCache.get(url) : undefined
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (previewCache.has(url)) {
      setData(previewCache.get(url) ?? null);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: LinkPreviewData | null) => {
        const result = json?.title ? json : null;
        previewCache.set(url, result);
        setData(result);
      })
      .catch(() => {
        // aborted or network error — do nothing
      });

    return () => {
      controller.abort();
    };
  }, [url]);

  // Loading skeleton
  if (data === undefined) {
    return (
      <div
        className={cn(
          "rounded-xl p-2.5 mt-1.5 border border-white/10 animate-pulse",
          isMine ? "bg-black/10" : "bg-white/5"
        )}
      >
        <div className="h-3 w-2/3 rounded bg-white/10 mb-1.5" />
        <div className="h-2.5 w-full rounded bg-white/10" />
      </div>
    );
  }

  // No metadata found
  if (!data) return null;

  let origin: string | null = null;
  try {
    origin = new URL(url).origin;
  } catch {
    // ignore
  }

  const faviconUrl = origin ? `${origin}/favicon.ico` : null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "flex items-start gap-2 rounded-xl p-2.5 mt-1.5 border border-white/10 text-xs no-underline transition-opacity hover:opacity-80",
        isMine ? "bg-black/10" : "bg-white/5"
      )}
    >
      {/* Text content */}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        {/* Site name + favicon */}
        <div className="flex items-center gap-1 text-[10px] opacity-60">
          {faviconUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={faviconUrl}
              alt=""
              width={12}
              height={12}
              className="w-3 h-3 rounded-sm object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          )}
          {data.siteName && <span className="truncate">{data.siteName}</span>}
        </div>

        {/* Title */}
        <span className="font-medium leading-snug truncate opacity-90">
          {data.title}
        </span>

        {/* Description */}
        {data.description && (
          <span
            className="opacity-60 leading-snug"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {data.description}
          </span>
        )}
      </div>

      {/* Thumbnail */}
      {data.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.image}
          alt=""
          className="w-16 h-16 rounded-lg object-cover shrink-0"
          style={{ maxWidth: 80 }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      )}
    </a>
  );
}
