"use client";

import React from "react";
import Image from "next/image";
import type { Message } from "@/lib/supabase";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar?: boolean;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ message, isOwn, showAvatar }: MessageBubbleProps) {
  const profile = message.profiles;

  return (
    <div className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar placeholder for spacing */}
      <div className="w-7 shrink-0">
        {!isOwn && showAvatar && profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.username}
            className="w-7 h-7 rounded-full object-cover"
          />
        ) : !isOwn && showAvatar ? (
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-xs font-semibold">
            {(profile?.display_name ?? profile?.username ?? "?")[0]?.toUpperCase()}
          </div>
        ) : null}
      </div>

      {/* Bubble */}
      <div className={`flex flex-col gap-0.5 max-w-xs sm:max-w-sm ${isOwn ? "items-end" : "items-start"}`}>
        {message.image_url && (
          <div className="relative rounded-2xl overflow-hidden" style={{ width: 220, aspectRatio: "4/3" }}>
            <Image
              src={message.image_url}
              alt="Message image"
              fill
              className="object-cover"
              sizes="220px"
            />
          </div>
        )}

        {message.content && (
          <div
            className={[
              "px-4 py-2.5 rounded-3xl text-sm leading-relaxed",
              isOwn
                ? "bg-[var(--accent-blue)] text-white rounded-br-lg"
                : "bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-bl-lg border border-[var(--border)]",
            ].join(" ")}
          >
            {message.content}
          </div>
        )}

        {/* Timestamp + read status */}
        <div className="flex items-center gap-1 px-1">
          <span className="text-[10px] text-[var(--text-secondary)]">
            {formatTime(message.created_at)}
          </span>
          {isOwn && (
            <svg
              className={`w-3 h-3 ${message.is_read ? "text-[var(--accent-mint)]" : "text-[var(--text-secondary)]"}`}
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              {message.is_read ? (
                // Double check
                <path d="M1.5 8.5l3 3 4-6M5.5 11.5l3 3 6-9" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              ) : (
                // Single check
                <path d="M2 8l4 4 8-8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              )}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
