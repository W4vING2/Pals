"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Hash, Users, MessageCircle, Clock } from "lucide-react";

interface TopicCardProps {
  topic: {
    id: string;
    title: string;
    description: string | null;
    participant_count: number;
    message_count: number;
    expires_at: string;
    tags: string[];
  };
}

function timeLeft(expiresAt: string): { label: string; isUrgent: boolean } {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { label: "Закрыт", isUrgent: true };
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const isUrgent = h < 2;
  if (h > 0) return { label: `${h}ч ${m}м`, isUrgent };
  return { label: `${m}м`, isUrgent: true };
}

export function TopicCard({ topic }: TopicCardProps) {
  const router = useRouter();
  const { label, isUrgent } = timeLeft(topic.expires_at);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/topics/${topic.id}`)}
      onKeyDown={(e) => e.key === "Enter" && router.push(`/topics/${topic.id}`)}
      className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] p-4 hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer relative overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
    >
      {/* Accent left border bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--accent-blue)] rounded-l-2xl" />

      <div className="pl-2">
        {/* Title row */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <Hash className="w-4 h-4 text-[var(--accent-blue)] flex-shrink-0" />
          <h3 className="font-bold text-[var(--text-primary)] text-sm leading-tight line-clamp-1">
            {topic.title}
          </h3>
        </div>

        {/* Description */}
        {topic.description && (
          <p className="text-xs text-[var(--text-secondary)] line-clamp-1 mb-3">
            {topic.description}
          </p>
        )}

        {/* Tags */}
        {topic.tags && topic.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {topic.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {topic.participant_count}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="w-3.5 h-3.5" />
            {topic.message_count}
          </span>
          <span className={`flex items-center gap-1 ml-auto ${isUrgent ? "text-amber-500" : ""}`}>
            <Clock className="w-3.5 h-3.5" />
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}
