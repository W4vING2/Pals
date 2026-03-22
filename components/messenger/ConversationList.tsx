"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, MessageSquare, Users } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OnlineIndicator } from "@/components/shared/OnlineIndicator";
import { cn } from "@/lib/utils";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type { ConversationWithDetails } from "@/hooks/useMessages";
import { useAuthStore } from "@/lib/store";

interface ConversationListProps {
  conversations: ConversationWithDetails[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onCreateGroup?: () => void;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "сейчас";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function SkeletonItem() {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="w-10 h-10 rounded-full bg-[var(--bg-elevated)] animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-28 rounded bg-[var(--bg-elevated)] animate-pulse" />
        <div className="h-3 w-40 rounded bg-[var(--bg-elevated)] animate-pulse" />
      </div>
    </div>
  );
}

export function ConversationList({
  conversations,
  activeId,
  loading,
  onSelect,
  onCreateGroup,
}: ConversationListProps) {
  const { user } = useAuthStore();
  const [search, setSearch] = useState("");

  // Collect all other user IDs for realtime online polling
  const otherUserIds = useMemo(() => {
    const ids: string[] = [];
    for (const conv of conversations) {
      if (!conv.is_group) {
        const other = conv.participants.find((p) => p.user_id !== user?.id);
        if (other) ids.push(other.user_id);
      }
    }
    return [...new Set(ids)];
  }, [conversations, user?.id]);

  const onlineMap = useOnlineStatus(otherUserIds);

  const filtered = conversations.filter((conv) => {
    if (!search) return true;
    if (conv.is_group) {
      return (conv.name ?? "").toLowerCase().includes(search.toLowerCase());
    }
    const other = conv.participants.find((p) => p.user_id !== user?.id);
    const name =
      other?.profiles?.display_name ?? other?.profiles?.username ?? "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full">
      {/* Search + new group */}
      <div className="p-3 border-b border-[var(--border)] space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск чатов..."
            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-full pl-9 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none input-focus transition-colors"
          />
        </div>
        {onCreateGroup && (
          <button
            onClick={onCreateGroup}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 transition-colors"
          >
            <Users className="size-4" />
            Новая группа
          </button>
        )}
      </div>

      {/* List */}
      <ScrollArea className="flex-1 overflow-hidden">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonItem key={i} />)
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-4">
            <MessageSquare className="w-10 h-10 text-[var(--text-secondary)] opacity-30" />
            <p className="text-sm text-[var(--text-secondary)]">
              {search ? "Чаты не найдены" : "Пока нет чатов"}
            </p>
          </div>
        ) : (
          filtered.map((conv) => {
            const isGroup = conv.is_group;
            const other = isGroup
              ? null
              : conv.participants.find((p) => p.user_id !== user?.id);
            const otherProfile = other?.profiles;
            const name = isGroup
              ? conv.name ?? "Группа"
              : otherProfile?.display_name ??
                otherProfile?.username ??
                "Неизвестный";
            const avatarUrl = isGroup
              ? conv.avatar_url
              : otherProfile?.avatar_url;
            const isActive = conv.id === activeId;
            // Use realtime online status
            const isOnline = other
              ? onlineMap.get(other.user_id) ?? otherProfile?.is_online ?? false
              : false;

            return (
              <motion.button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "w-full flex items-center gap-3 p-4 transition-all duration-150 text-left",
                  "hover:bg-[var(--bg-elevated)]",
                  isActive &&
                    "bg-[var(--bg-elevated)] border-l-2 border-l-[var(--accent-blue)]"
                )}
              >
                <div className="relative shrink-0">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold",
                      isGroup
                        ? "bg-gradient-to-br from-purple-600 to-indigo-500"
                        : "bg-gradient-to-br from-purple-500 to-emerald-500"
                    )}>
                      {isGroup ? (
                        <Users className="size-5" />
                      ) : (
                        name[0]?.toUpperCase()
                      )}
                    </div>
                  )}
                  {!isGroup && (
                    <OnlineIndicator
                      isOnline={isOnline}
                      size="sm"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        "text-sm font-semibold truncate",
                        isActive
                          ? "text-[var(--accent-blue)]"
                          : "text-[var(--text-primary)]"
                      )}
                    >
                      {name}
                    </p>
                    <span className="text-[10px] text-[var(--text-secondary)] shrink-0">
                      {timeAgo(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-[var(--text-secondary)] truncate">
                      {conv.last_message ?? "Нет сообщений"}
                    </p>
                    <AnimatePresence>
                      {conv.unread_count > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 25,
                          }}
                          className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--accent-blue)] text-white text-[10px] font-bold flex items-center justify-center"
                        >
                          {conv.unread_count > 99
                            ? "99+"
                            : conv.unread_count}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.button>
            );
          })
        )}
      </ScrollArea>
    </div>
  );
}
