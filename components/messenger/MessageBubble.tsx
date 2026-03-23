"use client";

import React, { memo, useState, useRef, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Check, CheckCheck, Pencil, Trash2, X, CornerDownLeft, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "@/components/shared/ImageLightbox";
import { useAuthStore } from "@/lib/store";
import type { Message } from "@/lib/supabase";

const QUICK_EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "🔥"];

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar?: boolean;
  /** Only animate entrance for newly added messages, not historical ones */
  animate?: boolean;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onRetry?: (messageId: string) => void;
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
  onEdit,
  onDelete,
  onToggleReaction,
  onRetry,
}: MessageBubbleProps) {
  if (message.message_type === "system") {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-elevated)] px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  const profile = message.profiles;
  const { user } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content ?? "");
  const menuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [menuOpen]);

  // Focus edit input
  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.setSelectionRange(editText.length, editText.length);
    }
  }, [editing, editText.length]);

  const handleClick = () => {
    if (editing) return;
    setMenuOpen((prev) => !prev);
  };

  const handleEdit = () => {
    setMenuOpen(false);
    setEditText(message.content ?? "");
    setEditing(true);
  };

  const handleSaveEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== message.content) {
      onEdit?.(message.id, trimmed);
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditText(message.content ?? "");
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  const handleDelete = () => {
    setMenuOpen(false);
    onDelete?.(message.id);
  };

  const handleReaction = (emoji: string) => {
    setMenuOpen(false);
    onToggleReaction?.(message.id, emoji);
  };

  // Group reactions by emoji with count and whether current user reacted
  const reactionGroups = React.useMemo(() => {
    if (!message.reactions || message.reactions.length === 0) return [];
    const groups: Record<string, { emoji: string; count: number; hasOwn: boolean }> = {};
    for (const r of message.reactions) {
      if (!groups[r.emoji]) {
        groups[r.emoji] = { emoji: r.emoji, count: 0, hasOwn: false };
      }
      groups[r.emoji].count++;
      if (r.user_id === user?.id) {
        groups[r.emoji].hasOwn = true;
      }
    }
    return Object.values(groups);
  }, [message.reactions, user?.id]);

  return (
    <div
      className={cn(
        "flex items-end gap-2 group relative",
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
          "flex flex-col gap-0.5 max-w-[280px] sm:max-w-sm relative",
          isOwn ? "items-end" : "items-start"
        )}
      >
        {message.image_url && (
          <>
            <div
              className="relative rounded-xl overflow-hidden cursor-zoom-in group/img"
              onClick={(e) => { e.stopPropagation(); setLightboxOpen(true); }}
              style={{ maxWidth: 280 }}
            >
              <Image
                src={message.image_url}
                alt="Изображение"
                width={280}
                height={280}
                className="w-full h-auto object-cover rounded-xl"
                sizes="280px"
                style={{ width: "auto", height: "auto" }}
              />
            </div>
            <ImageLightbox
              src={lightboxOpen ? message.image_url : null}
              alt="Изображение"
              onClose={() => setLightboxOpen(false)}
            />
          </>
        )}

        {editing ? (
          /* Edit mode */
          <div className="w-full min-w-[200px]">
            <div className="bg-[var(--bg-surface)] border-2 border-[var(--accent-blue)] rounded-2xl px-3 py-2">
              <textarea
                ref={editInputRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleEditKeyDown}
                rows={1}
                className="w-full bg-transparent text-sm text-[var(--text-primary)] resize-none outline-none leading-relaxed"
                style={{ minHeight: "20px" }}
              />
              <div className="flex items-center justify-end gap-1 mt-1">
                <button
                  onClick={handleCancelEdit}
                  className="p-1 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                  aria-label="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editText.trim()}
                  className="p-1 rounded-lg text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 transition-colors disabled:opacity-40"
                  aria-label="Save"
                >
                  <CornerDownLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Normal mode */
          message.content && (
            <div
              onClick={handleClick}
              className={cn(
                "px-4 py-2.5 text-sm leading-relaxed transition-all cursor-pointer active:scale-[0.98]",
                isOwn
                  ? "bg-[var(--accent-blue)] text-white rounded-2xl rounded-br-md"
                  : "bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-2xl rounded-bl-md border border-[var(--border)]",
                message._status === "failed" && "opacity-60",
                message._status === "sending" && "opacity-80"
              )}
            >
              {message.content}
            </div>
          )
        )}

        {/* Reactions display */}
        {reactionGroups.length > 0 && (
          <div className={cn("flex flex-wrap gap-1 mt-0.5", isOwn ? "justify-end" : "justify-start")}>
            {reactionGroups.map((g) => (
              <button
                key={g.emoji}
                onClick={() => onToggleReaction?.(message.id, g.emoji)}
                className={cn(
                  "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-all",
                  g.hasOwn
                    ? "bg-[var(--accent-blue)]/20 border border-[var(--accent-blue)]/40"
                    : "bg-[var(--bg-elevated)] border border-[var(--border)] hover:bg-[var(--bg-surface)]"
                )}
              >
                <span>{g.emoji}</span>
                {g.count > 1 && (
                  <span className="text-[10px] text-[var(--text-secondary)]">{g.count}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp + delivery status */}
        {!editing && (
          <div className="flex items-center gap-1 px-1">
            <span className="text-[10px] text-[var(--text-secondary)]">
              {formatTime(message.created_at)}
              {message.is_edited && <span className="ml-1 italic">изм.</span>}
            </span>
            {isOwn && (
              message._status === "sending" ? (
                <Loader2 className="w-3 h-3 text-[var(--text-secondary)] animate-spin" />
              ) : message._status === "failed" ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onRetry?.(message.id); }}
                  className="flex items-center gap-0.5 text-red-500 hover:text-red-400 transition-colors"
                  aria-label="Retry sending"
                >
                  <AlertCircle className="w-3 h-3" />
                  <span className="text-[9px] font-medium">Повторить</span>
                </button>
              ) : message.is_read ? (
                <CheckCheck className="w-3 h-3 text-[var(--accent-mint)]" />
              ) : (
                <Check className="w-3 h-3 text-[var(--text-secondary)]" />
              )
            )}
          </div>
        )}

        {/* Context menu with reactions */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.85, y: 5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 5 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "absolute z-50 bg-[var(--bg-elevated)] backdrop-blur-xl rounded-xl shadow-lg border border-[var(--border)] overflow-hidden",
                "bottom-full mb-1",
                isOwn ? "right-0" : "left-0"
              )}
            >
              {/* Quick emoji row */}
              {onToggleReaction && (
                <div className="flex items-center gap-0.5 px-2 py-2 border-b border-[var(--border)]">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleReaction(emoji)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface)] transition-colors text-base"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Edit/Delete (own messages only) */}
              {isOwn && (
                <>
                  {message.content && (
                    <button
                      onClick={handleEdit}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors w-full text-left"
                    >
                      <Pencil className="w-4 h-4 text-[var(--text-secondary)]" />
                      Изменить
                    </button>
                  )}
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors w-full text-left"
                  >
                    <Trash2 className="w-4 h-4" />
                    Удалить
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});
