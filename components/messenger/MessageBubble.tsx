"use client";

import React, { memo, useState, useRef, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimation } from "framer-motion";
import {
  Check, CheckCheck, Pencil, Trash2, X, CornerDownLeft,
  AlertCircle, Loader2, Copy, Reply, Timer, Share2, Pin, PinOff
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "@/components/shared/ImageLightbox";
import { AudioPlayer } from "./AudioPlayer";
import { useAuthStore } from "@/lib/store";
import { haptic } from "@/lib/haptics";
import type { Message } from "@/lib/supabase";

const QUICK_EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "🔥"];
const SWIPE_THRESHOLD = 64; // px to trigger reply

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar?: boolean;
  animate?: boolean;
  isPinned?: boolean;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onRetry?: (messageId: string) => void;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onPin?: (messageId: string) => void;
  onUnpin?: () => void;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Countdown display for disappearing messages */
function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    if (remaining <= 0) return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(left);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, remaining]);

  if (remaining <= 0) return null;

  const label =
    remaining >= 3600
      ? `${Math.floor(remaining / 3600)}ч`
      : remaining >= 60
      ? `${Math.floor(remaining / 60)}м`
      : `${remaining}с`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[9px] font-medium",
        remaining <= 30 ? "text-red-400" : "text-[var(--text-secondary)]"
      )}
      title="Сообщение исчезнет"
    >
      <Timer className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

/** Preview of the message being replied to */
function ReplyPreviewBubble({ preview, isOwn }: { preview: Message["reply_preview"]; isOwn: boolean }) {
  if (!preview) return null;

  const contentText =
    preview.message_type === "voice"
      ? "🎤 Голосовое"
      : preview.image_url
      ? "📷 Фото"
      : preview.content
      ? preview.content.slice(0, 80)
      : "";

  return (
    <div
      className={cn(
        "flex flex-col text-[11px] leading-snug px-2.5 py-1.5 rounded-xl mb-0.5 border-l-2 max-w-full overflow-hidden",
        isOwn
          ? "bg-white/10 border-white/40 text-white/80"
          : "bg-[var(--bg-elevated)] border-[var(--accent-blue)] text-[var(--text-secondary)]"
      )}
      style={{ maxWidth: 220 }}
    >
      <span
        className="font-semibold truncate"
        style={{ color: isOwn ? "rgba(255,255,255,0.9)" : "var(--accent-blue)" }}
      >
        {preview.sender_name}
      </span>
      <span className="truncate opacity-80">{contentText || "..."}</span>
    </div>
  );
}

/** Forwarded from banner */
function ForwardedBanner({ sender, isOwn }: { sender: string; isOwn: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 text-[10px] font-medium mb-0.5",
        isOwn ? "text-white/60" : "text-[var(--text-secondary)]"
      )}
    >
      <Share2 className="w-2.5 h-2.5" />
      Переслано от {sender}
    </div>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  showAvatar,
  animate: shouldAnimate = false,
  isPinned = false,
  onEdit,
  onDelete,
  onToggleReaction,
  onRetry,
  onReply,
  onForward,
  onPin,
  onUnpin,
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

  // Swipe-to-reply state
  const dragX = useMotionValue(0);
  const swipeIndicatorOpacity = useTransform(
    dragX,
    [0, SWIPE_THRESHOLD * 0.5, SWIPE_THRESHOLD],
    [0, 0.5, 1]
  );
  const swipeIndicatorScale = useTransform(
    dragX,
    [0, SWIPE_THRESHOLD],
    [0.5, 1]
  );
  const dragControls = useAnimation();
  const hasTriggeredReplyRef = useRef(false);

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
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
    if (e.key === "Escape") handleCancelEdit();
  };

  const handleDelete = () => { setMenuOpen(false); onDelete?.(message.id); };

  const handleReply = () => {
    setMenuOpen(false);
    haptic("light");
    onReply?.(message);
  };

  const handleForward = () => {
    setMenuOpen(false);
    haptic("light");
    onForward?.(message);
  };

  const handlePin = () => {
    setMenuOpen(false);
    haptic("medium");
    if (isPinned) onUnpin?.();
    else onPin?.(message.id);
  };

  const handleCopy = async () => {
    setMenuOpen(false);
    if (message.content) {
      try {
        await navigator.clipboard.writeText(message.content);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = message.content;
        ta.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
    }
  };

  const handleReaction = (emoji: string) => {
    setMenuOpen(false);
    haptic("light");
    onToggleReaction?.(message.id, emoji);
  };

  // Group reactions by emoji
  const reactionGroups = React.useMemo(() => {
    if (!message.reactions || message.reactions.length === 0) return [];
    const groups: Record<string, { emoji: string; count: number; hasOwn: boolean }> = {};
    for (const r of message.reactions) {
      if (!groups[r.emoji]) groups[r.emoji] = { emoji: r.emoji, count: 0, hasOwn: false };
      groups[r.emoji].count++;
      if (r.user_id === user?.id) groups[r.emoji].hasOwn = true;
    }
    return Object.values(groups);
  }, [message.reactions, user?.id]);

  // Swipe drag handlers
  const handleDragEnd = () => {
    const x = dragX.get();
    if (!hasTriggeredReplyRef.current && x >= SWIPE_THRESHOLD) {
      hasTriggeredReplyRef.current = true;
      haptic("medium");
      onReply?.(message);
    }
    hasTriggeredReplyRef.current = false;
    dragControls.start({ x: 0, transition: { type: "spring", stiffness: 500, damping: 35 } });
    dragX.set(0);
  };

  return (
    <div
      className={cn(
        "flex items-end gap-2 group relative",
        isOwn ? "flex-row-reverse" : "flex-row",
        shouldAnimate && "animate-fade-in"
      )}
    >
      {/* Swipe reply indicator (left side for own, right side for other) */}
      {onReply && (
        <motion.div
          className={cn(
            "absolute flex items-center justify-center w-8 h-8 rounded-full bg-[var(--accent-blue)]/20",
            "border border-[var(--accent-blue)]/30",
            isOwn ? "right-full mr-2" : "left-full ml-2"
          )}
          style={{ opacity: swipeIndicatorOpacity, scale: swipeIndicatorScale }}
        >
          <Reply className="w-4 h-4 text-[var(--accent-blue)]" />
        </motion.div>
      )}

      {/* Avatar */}
      <div className="w-7 shrink-0">
        {!isOwn && showAvatar && profile?.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.username ?? "User"} className="w-7 h-7 rounded-full object-cover" />
        ) : !isOwn && showAvatar ? (
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-emerald-500 flex items-center justify-center text-white text-xs font-semibold">
            {(profile?.display_name ?? profile?.username ?? "?")[0]?.toUpperCase()}
          </div>
        ) : null}
      </div>

      {/* Bubble — draggable for swipe-to-reply */}
      <motion.div
        drag={onReply ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: SWIPE_THRESHOLD + 10 }}
        dragElastic={{ left: 0, right: 0.3 }}
        animate={dragControls}
        style={{ x: dragX }}
        onDragEnd={handleDragEnd}
        onDrag={(_, info) => {
          // Trigger at threshold even before release
          if (info.offset.x >= SWIPE_THRESHOLD && !hasTriggeredReplyRef.current) {
            hasTriggeredReplyRef.current = true;
            haptic("medium");
          }
        }}
        className={cn(
          "flex flex-col gap-0.5 max-w-[75%] sm:max-w-md relative",
          isOwn ? "items-end" : "items-start"
        )}
      >
        {/* Forwarded banner */}
        {message.forward_from_sender && (
          <ForwardedBanner sender={message.forward_from_sender} isOwn={isOwn} />
        )}

        {/* Reply preview */}
        {message.reply_preview && (
          <ReplyPreviewBubble preview={message.reply_preview} isOwn={isOwn} />
        )}

        {message.image_url && (
          <>
            <div
              className="relative rounded-xl overflow-hidden cursor-zoom-in"
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

        {message.audio_url && (
          <div
            onClick={handleClick}
            className={cn(
              "px-3 py-2 rounded-2xl cursor-pointer active:scale-[0.98] transition-all",
              isOwn
                ? "bg-[var(--accent-blue)] text-white rounded-br-md"
                : "bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-bl-md border border-[var(--border)]"
            )}
          >
            <AudioPlayer src={message.audio_url} isOwn={isOwn} />
          </div>
        )}

        {editing ? (
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
                <button onClick={handleCancelEdit} className="p-1 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editText.trim()}
                  className="p-1 rounded-lg text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 transition-colors disabled:opacity-40"
                >
                  <CornerDownLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          message.content && (
            <div
              onClick={handleClick}
              className={cn(
                "px-4 py-2.5 text-sm leading-relaxed transition-all cursor-pointer active:scale-[0.98] break-words whitespace-pre-wrap overflow-hidden [overflow-wrap:anywhere]",
                isOwn
                  ? "bg-[var(--accent-blue)] text-white rounded-2xl rounded-br-md"
                  : "bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-2xl rounded-bl-md border border-[var(--border)]",
                message._status === "failed" && "opacity-60",
                message._status === "sending" && "opacity-80"
              )}
            >
              {/* Render @mentions highlighted */}
              <MentionText content={message.content} isOwn={isOwn} />
            </div>
          )
        )}

        {/* Reactions */}
        {reactionGroups.length > 0 && (
          <div className={cn("flex flex-wrap gap-1 mt-0.5", isOwn ? "justify-end" : "justify-start")}>
            {reactionGroups.map((g) => (
              <button
                key={g.emoji}
                onClick={() => { haptic("light"); onToggleReaction?.(message.id, g.emoji); }}
                className={cn(
                  "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-all active:scale-90",
                  g.hasOwn
                    ? "bg-[var(--accent-blue)]/20 border border-[var(--accent-blue)]/40"
                    : "bg-[var(--bg-elevated)] border border-[var(--border)] hover:bg-[var(--bg-surface)]"
                )}
              >
                <span>{g.emoji}</span>
                {g.count > 1 && <span className="text-[10px] text-[var(--text-secondary)]">{g.count}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp + status */}
        {!editing && (
          <div className="flex items-center gap-1 px-1">
            <span className="text-[10px] text-[var(--text-secondary)]">
              {formatTime(message.created_at)}
              {message.is_edited && <span className="ml-1 italic">изм.</span>}
            </span>
            {message.expires_at && <ExpiryCountdown expiresAt={message.expires_at} />}
            {isPinned && <Pin className="w-2.5 h-2.5 text-amber-400" />}
            {isOwn && (
              message._status === "sending" ? (
                <Loader2 className="w-3 h-3 text-[var(--text-secondary)] animate-spin" />
              ) : message._status === "failed" ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onRetry?.(message.id); }}
                  className="flex items-center gap-0.5 text-red-500 hover:text-red-400 transition-colors"
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

        {/* Context menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.85, y: 5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 5 }}
              transition={{ duration: 0.13 }}
              className={cn(
                "absolute z-50 bg-[var(--bg-elevated)] backdrop-blur-xl rounded-xl shadow-xl border border-[var(--border)] overflow-hidden min-w-[180px]",
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
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface)] transition-colors text-base active:scale-90"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Reply */}
              {onReply && (
                <button onClick={handleReply} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors w-full text-left">
                  <Reply className="w-4 h-4 text-[var(--text-secondary)]" />
                  Ответить
                </button>
              )}

              {/* Forward */}
              {onForward && (
                <button onClick={handleForward} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors w-full text-left">
                  <Share2 className="w-4 h-4 text-[var(--text-secondary)]" />
                  Переслать
                </button>
              )}

              {/* Pin / Unpin */}
              {(onPin || onUnpin) && (
                <button onClick={handlePin} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors w-full text-left">
                  {isPinned
                    ? <><PinOff className="w-4 h-4 text-[var(--text-secondary)]" />Открепить</>
                    : <><Pin className="w-4 h-4 text-[var(--text-secondary)]" />Закрепить</>
                  }
                </button>
              )}

              {/* Copy */}
              {message.content && (
                <button onClick={handleCopy} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors w-full text-left">
                  <Copy className="w-4 h-4 text-[var(--text-secondary)]" />
                  Копировать
                </button>
              )}

              {/* Edit / Delete (own) */}
              {isOwn && (
                <>
                  {message.content && (
                    <button onClick={handleEdit} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors w-full text-left">
                      <Pencil className="w-4 h-4 text-[var(--text-secondary)]" />
                      Изменить
                    </button>
                  )}
                  <button onClick={handleDelete} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors w-full text-left">
                    <Trash2 className="w-4 h-4" />
                    Удалить
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
});

/** Renders message content with @mentions highlighted */
function MentionText({ content, isOwn }: { content: string; isOwn: boolean }) {
  const parts = content.split(/(@\w+)/g);
  if (parts.length === 1) return <>{content}</>;

  return (
    <>
      {parts.map((part, i) => {
        if (/^@\w+$/.test(part)) {
          return (
            <span
              key={i}
              className={cn(
                "font-semibold rounded px-0.5",
                isOwn ? "bg-white/20 text-white" : "bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]"
              )}
            >
              {part}
            </span>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}
