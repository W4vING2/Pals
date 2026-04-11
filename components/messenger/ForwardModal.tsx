"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, SendHorizontal, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/supabase";
import type { ConversationWithDetails } from "@/hooks/useMessages";

interface ForwardModalProps {
  open: boolean;
  message: Message | null;
  conversations: ConversationWithDetails[];
  currentUserId: string;
  onClose: () => void;
  onForward: (targetConversationIds: string[]) => void;
}

export function ForwardModal({
  open,
  message,
  conversations,
  currentUserId,
  onClose,
  onForward,
}: ForwardModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const filteredConvs = conversations.filter((conv) => {
    const name = conv.is_group
      ? (conv.name ?? "Группа")
      : conv.participants.find((p) => p.user_id !== currentUserId)?.profiles?.display_name
        ?? conv.participants.find((p) => p.user_id !== currentUserId)?.profiles?.username
        ?? "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = () => {
    if (selected.size === 0) return;
    onForward(Array.from(selected));
    setSelected(new Set());
    setSearch("");
    onClose();
  };

  const handleClose = () => {
    setSelected(new Set());
    setSearch("");
    onClose();
  };

  if (!open || !message) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-surface)] rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: "70dvh" }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
              <h3 className="font-semibold text-[var(--text-primary)]">Переслать сообщение</h3>
              <button onClick={handleClose} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Message preview */}
            <div className="px-5 py-3 border-b border-[var(--border)]">
              <div className="text-xs text-[var(--text-secondary)] truncate max-w-full">
                {message.message_type === "voice"
                  ? "🎤 Голосовое сообщение"
                  : message.image_url
                  ? "📷 Фото"
                  : message.content?.slice(0, 100) ?? ""}
              </div>
            </div>

            {/* Search */}
            <div className="px-5 py-2">
              <div className="flex items-center gap-2 bg-[var(--bg-elevated)] rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск чатов..."
                  className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none"
                />
              </div>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto px-4 pb-2">
              {filteredConvs.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2">
                  <p className="text-sm text-[var(--text-secondary)]">Чаты не найдены</p>
                </div>
              ) : (
                filteredConvs.map((conv) => {
                  const other = conv.participants.find((p) => p.user_id !== currentUserId);
                  const name = conv.is_group
                    ? (conv.name ?? "Группа")
                    : (other?.profiles?.display_name ?? other?.profiles?.username ?? "Неизвестный");
                  const avatarUrl = conv.is_group ? conv.avatar_url : other?.profiles?.avatar_url;
                  const isSelected = selected.has(conv.id);

                  return (
                    <button
                      key={conv.id}
                      onClick={() => toggle(conv.id)}
                      className={cn(
                        "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-colors text-left",
                        isSelected ? "bg-[var(--accent-blue)]/10" : "hover:bg-[var(--bg-elevated)]"
                      )}
                    >
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt={name} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-emerald-500 flex items-center justify-center text-white text-sm font-semibold">
                            {name[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>

                      <span className="flex-1 text-sm font-medium text-[var(--text-primary)] truncate">{name}</span>

                      {/* Checkbox */}
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0",
                        isSelected
                          ? "bg-[var(--accent-blue)] border-[var(--accent-blue)]"
                          : "border-[var(--border)]"
                      )}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Send button */}
            <div className="px-5 py-4 border-t border-[var(--border)]" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
              <button
                onClick={handleSend}
                disabled={selected.size === 0}
                className={cn(
                  "w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all",
                  selected.size > 0
                    ? "bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90 active:scale-[0.98]"
                    : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] cursor-not-allowed"
                )}
              >
                <SendHorizontal className="w-4 h-4" />
                Переслать {selected.size > 0 ? `(${selected.size})` : ""}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
