"use client";

import React, { useState, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  BellOff,
  MessageSquare,
  Search,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OnlineIndicator } from "@/components/shared/OnlineIndicator";
import { cn } from "@/lib/utils";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type { ConversationWithDetails } from "@/hooks/useMessages";
import { useAuthStore } from "@/lib/store";
import type { ProfileSummary } from "@/lib/supabase";

export type ChatSuggestion = {
  profile: ProfileSummary;
  reason: string;
  score: number;
};

interface ConversationListProps {
  conversations: ConversationWithDetails[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onCreateGroup?: () => void;
  onDeleteConversation?: (convId: string) => void;
  onMuteConversation?: (convId: string, muted: boolean) => void;
  suggestions?: ChatSuggestion[];
  loadingSuggestions?: boolean;
  onStartSuggestion?: (profileId: string) => void;
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
  onDeleteConversation,
  onMuteConversation,
  suggestions = [],
  loadingSuggestions = false,
  onStartSuggestion,
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

  // Long-press state for mobile delete
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressConvRef = useRef<string | null>(null);

  const handleTouchStart = useCallback((convId: string) => {
    longPressConvRef.current = convId;
    longPressTimerRef.current = setTimeout(() => {
      if (longPressConvRef.current === convId && onDeleteConversation) {
        // Trigger haptic feedback if available
        if (navigator.vibrate) navigator.vibrate(50);
        if (window.confirm("Удалить чат?")) {
          onDeleteConversation(convId);
        }
      }
      longPressConvRef.current = null;
    }, 600);
  }, [onDeleteConversation]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressConvRef.current = null;
  }, []);

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
    <div className="flex h-full flex-col bg-[#030307] pb-28 lg:bg-transparent lg:pb-0">
      {/* Search + new group */}
      <div className="space-y-2 border-b border-white/8 p-3 lg:border-[var(--border)]">
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
        ) : (
          <>
            {filtered.length === 0 ? (
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
            const myParticipant = conv.participants.find((p) => p.user_id === user?.id);
            const isMuted = (myParticipant as any)?.is_muted ?? false;

            return (
              <motion.div
                key={conv.id}
                whileTap={{ scale: 0.98 }}
                onTouchStart={() => onDeleteConversation && handleTouchStart(conv.id)}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                className={cn(
                  "w-full flex items-center gap-3 p-4 transition-all duration-150 text-left group/conv relative",
                  "hover:bg-[var(--bg-elevated)]",
                  isActive &&
                    "bg-[var(--bg-elevated)] border-l-2 border-l-[var(--accent-blue)]"
                )}
              >
              <button
                onClick={() => onSelect(conv.id)}
                className="absolute inset-0 z-0"
                aria-label={name}
              />
                <div className="relative shrink-0 z-10 pointer-events-none">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={name}
                      className="w-10 h-10 rounded-full object-cover"
                      loading="lazy"
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
                <div className="flex-1 min-w-0 relative z-10 pointer-events-none">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        "text-sm font-semibold truncate flex items-center gap-1",
                        isActive
                          ? "text-[var(--accent-blue)]"
                          : "text-[var(--text-primary)]"
                      )}
                    >
                      {name}
                      {isMuted && <BellOff className="w-3 h-3 text-[var(--text-secondary)] shrink-0" />}
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
                <div className="relative z-10 flex items-center gap-0.5 opacity-0 group-hover/conv:opacity-100 transition-all shrink-0">
                  {onMuteConversation && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onMuteConversation(conv.id, !isMuted);
                      }}
                      className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition-colors"
                      title={isMuted ? "Включить звук" : "Отключить звук"}
                    >
                      {isMuted ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                    </button>
                  )}
                  {onDeleteConversation && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm("Удалить чат?")) {
                          onDeleteConversation(conv.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                      title="Удалить"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
              })
            )}

            {!search && onStartSuggestion && (
              <div className="border-t border-[var(--border)] px-3 py-4">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      Кому написать
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Подсказки по вашим связям и активности
                    </p>
                  </div>
                </div>

                {loadingSuggestions ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={index}
                        className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-[var(--bg-surface)] animate-pulse" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 w-24 rounded bg-[var(--bg-surface)] animate-pulse" />
                            <div className="h-2.5 w-36 rounded bg-[var(--bg-surface)] animate-pulse" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-center">
                    <p className="text-xs text-[var(--text-secondary)]">
                      Рекомендации появятся, когда у вас станет больше связей и активности.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {suggestions.map((suggestion) => {
                      const name =
                        suggestion.profile.display_name ??
                        suggestion.profile.username;
                      return (
                        <button
                          key={suggestion.profile.id}
                          type="button"
                          onClick={() => onStartSuggestion(suggestion.profile.id)}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3 text-left transition-colors hover:bg-[var(--bg-elevated)]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                              {suggestion.profile.avatar_url ? (
                                <img
                                  src={suggestion.profile.avatar_url}
                                  alt={name}
                                  className="h-9 w-9 rounded-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 text-sm font-semibold text-white">
                                  {name[0]?.toUpperCase()}
                                </div>
                              )}
                              <OnlineIndicator
                                isOnline={
                                  onlineMap.get(suggestion.profile.id) ??
                                  suggestion.profile.is_online ??
                                  false
                                }
                                size="sm"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                                {name}
                              </p>
                              <p className="truncate text-xs text-[var(--text-secondary)]">
                                {suggestion.reason}
                              </p>
                            </div>
                            <span className="rounded-full bg-[var(--accent-blue)]/10 px-2 py-1 text-[10px] font-semibold text-[var(--accent-blue)]">
                              Написать
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </ScrollArea>
    </div>
  );
}
