"use client";

import React, { memo } from "react";
import Image from "next/image";
import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/supabase";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar?: boolean;
  /** Only animate entrance for newly added messages, not historical ones */
  animate?: boolean;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  showAvatar,
  animate: shouldAnimate = false,
}: MessageBubbleProps) {
  const profile = message.profiles;

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isOwn ? "flex-row-reverse" : "flex-row",
        shouldAnimate && "animate-fade-in"
      )}
    >
      {/* Avatar placeholder for spacing */}
      <div className="w-7 shrink-0">
        {!isOwn && showAvatar && profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.username ?? "User"}
            className="w-7 h-7 rounded-full object-cover"
          />
        ) : !isOwn && showAvatar ? (
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-emerald-500 flex items-center justify-center text-white text-xs font-semibold">
            {(
              profile?.display_name ??
              profile?.username ??
              "?"
            )[0]?.toUpperCase()}
          </div>
        ) : null}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "flex flex-col gap-0.5 max-w-[280px] sm:max-w-sm",
          isOwn ? "items-end" : "items-start"
        )}
      >
        {message.image_url && (
          <div
            className="relative rounded-xl overflow-hidden"
            style={{ width: 280, maxWidth: "100%", aspectRatio: "4/3" }}
          >
            <Image
              src={message.image_url}
              alt="Message image"
              fill
              className="object-cover"
              sizes="280px"
            />
          </div>
        )}

        {message.content && (
          <div
            className={cn(
              "px-4 py-2.5 text-sm leading-relaxed",
              isOwn
                ? "bg-[var(--accent-blue)] text-white rounded-2xl rounded-br-md"
                : "bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-2xl rounded-bl-md border border-[var(--border)]"
            )}
          >
            {message.content}
          </div>
        )}

        {/* Timestamp + read status */}
        <div className="flex items-center gap-1 px-1">
          <span className="text-[10px] text-[var(--text-secondary)]">
            {formatTime(message.created_at)}
          </span>
          {isOwn &&
            (message.is_read ? (
              <CheckCheck className="w-3 h-3 text-[var(--accent-mint)]" />
            ) : (
              <Check className="w-3 h-3 text-[var(--text-secondary)]" />
            ))}
        </div>
      </div>
    </div>
  );
});
