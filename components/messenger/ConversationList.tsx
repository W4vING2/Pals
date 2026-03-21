"use client";

import React, { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { SkeletonConversation } from "@/components/ui/Skeleton";
import type { ConversationWithDetails } from "@/hooks/useMessages";
import { useAuthStore } from "@/lib/store";

interface ConversationListProps {
  conversations: ConversationWithDetails[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function ConversationList({
  conversations,
  activeId,
  loading,
  onSelect,
}: ConversationListProps) {
  const { user } = useAuthStore();
  const [search, setSearch] = useState("");

  const filtered = conversations.filter((conv) => {
    if (!search) return true;
    const other = conv.participants.find((p) => p.user_id !== user?.id);
    const name =
      other?.profiles?.display_name ?? other?.profiles?.username ?? "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-[var(--border)]">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-2xl pl-9 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-blue)] transition-colors"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonConversation key={i} />)
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-4">
            <svg className="w-10 h-10 text-[var(--text-secondary)]/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
            </svg>
            <p className="text-sm text-[var(--text-secondary)]">
              {search ? "No conversations found" : "No conversations yet"}
            </p>
          </div>
        ) : (
          filtered.map((conv) => {
            const other = conv.participants.find((p) => p.user_id !== user?.id);
            const otherProfile = other?.profiles;
            const name =
              otherProfile?.display_name ?? otherProfile?.username ?? "Unknown";
            const isActive = conv.id === activeId;

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`w-full flex items-center gap-3 p-4 hover:bg-[var(--bg-elevated)] transition-all duration-150 text-left ${
                  isActive ? "bg-[var(--accent-blue)]/10 border-r-2 border-[var(--accent-blue)]" : ""
                }`}
              >
                <div className="shrink-0">
                  <Avatar
                    src={otherProfile?.avatar_url}
                    name={name}
                    size="md"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-semibold truncate ${isActive ? "text-[var(--accent-blue)]" : "text-[var(--text-primary)]"}`}>
                      {name}
                    </p>
                    <span className="text-[10px] text-[var(--text-secondary)] shrink-0">
                      {timeAgo(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-[var(--text-secondary)] truncate">
                      {conv.last_message ?? "No messages yet"}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--accent-blue)] text-white text-[10px] font-bold flex items-center justify-center">
                        {conv.unread_count > 99 ? "99+" : conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
