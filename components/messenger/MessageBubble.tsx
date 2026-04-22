"use client";

import React, { memo, useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimation } from "framer-motion";
import {
  Check, CheckCheck, Pencil, Trash2, X, CornerDownLeft,
  AlertCircle, Loader2, Copy, Reply, Timer, Share2, Pin, PinOff, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "@/components/shared/ImageLightbox";
import { AudioPlayer } from "./AudioPlayer";
import { useAuthStore } from "@/lib/store";
import { haptic } from "@/lib/haptics";
import type { Message } from "@/lib/supabase";

const LinkPreview = dynamic(
  () => import("./LinkPreview").then((m) => ({ default: m.LinkPreview })),
  { ssr: false }
);

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

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
        remaining <= 30 ? "text-red-300" : "text-white/42"
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
          ? "bg-white/12 border-white/45 text-white/80"
          : "border-[#8c8cff] bg-black/22 text-white/58"
      )}
      style={{ maxWidth: 220 }}
    >
      <span
        className="font-semibold truncate"
        style={{ color: isOwn ? "rgba(255,255,255,0.9)" : "#aeb7ff" }}
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
        isOwn ? "text-white/60" : "text-white/50"
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
  const isSystemMessage = message.message_type === "system";
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

  if (isSystemMessage) {
    return (
      <div className="flex justify-center my-2">
        <span className="rounded-full border border-white/10 bg-black/28 px-3 py-1 text-xs font-medium text-white/62 backdrop-blur-xl">
          {message.content}
        </span>
      </div>
    );
  }

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
          <img src={profile.avatar_url} alt={profile.username ?? "User"} className="w-7 h-7 rounded-full object-cover" loading="lazy" />
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
          "relative flex max-w-[78%] flex-col gap-0.5 sm:max-w-md",
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
              className="relative cursor-zoom-in overflow-hidden rounded-[1.25rem] shadow-[0_12px_28px_rgba(0,0,0,0.32)]"
              onClick={(e) => { e.stopPropagation(); setLightboxOpen(true); }}
              style={{ maxWidth: 280 }}
            >
              <Image
                src={message.image_url}
                alt="Изображение"
                width={280}
                height={280}
                className="h-auto w-full rounded-[1.25rem] object-cover"
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
              "cursor-pointer rounded-[1.35rem] px-3 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.22)] transition-all active:scale-[0.98]",
              isOwn
                ? "rounded-br-md bg-gradient-to-br from-[#c95cff] via-[#8d7dff] to-[#6d96ff] text-white"
                : "rounded-bl-md border border-white/8 bg-[#1b1b22]/92 text-white backdrop-blur-xl"
            )}
          >
            <AudioPlayer src={message.audio_url} isOwn={isOwn} />
          </div>
        )}

        {editing ? (
          <div className="w-full min-w-[200px]">
            <div className="rounded-[1.35rem] border-2 border-[#b279ff] bg-[#17171d]/92 px-3 py-2 backdrop-blur-xl">
              <textarea
                ref={editInputRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleEditKeyDown}
                rows={1}
                className="w-full resize-none bg-transparent text-sm leading-relaxed text-white outline-none"
                style={{ minHeight: "20px" }}
              />
              <div className="flex items-center justify-end gap-1 mt-1">
                <button onClick={handleCancelEdit} className="rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10">
                  <X className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editText.trim()}
                  className="rounded-lg p-1 text-[#d783ff] transition-colors hover:bg-white/10 disabled:opacity-40"
                >
                  <CornerDownLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          message.content && (() => {
            const urlMatches = message.content.match(URL_REGEX);
            const firstUrl = urlMatches?.[0] ?? null;
            return (
              <>
                <div
                  onClick={handleClick}
                  className={cn(
                    "cursor-pointer overflow-hidden whitespace-pre-wrap break-words px-4 py-2.5 text-[16px] leading-snug shadow-[0_10px_24px_rgba(0,0,0,0.24)] transition-all [overflow-wrap:anywhere] active:scale-[0.98]",
                    isOwn
                      ? "rounded-[1.35rem] rounded-br-md bg-gradient-to-br from-[#c95cff] via-[#8d7dff] to-[#6d96ff] text-white"
                      : "rounded-[1.35rem] rounded-bl-md border border-white/8 bg-[#1b1b22]/94 text-white backdrop-blur-xl",
                    message._status === "failed" && "opacity-60",
                    message._status === "sending" && "opacity-80"
                  )}
                >
                  {/* Render @mentions and URLs highlighted */}
                  <MentionText content={message.content} isOwn={isOwn} />
                </div>
                {firstUrl && (
                  <LinkPreview url={firstUrl} isMine={isOwn} />
                )}
              </>
            );
          })()
        )}

        {/* Reactions */}
        {reactionGroups.length > 0 && (
          <div className={cn("mt-0.5 flex flex-wrap gap-1", isOwn ? "justify-end" : "justify-start")}>
            {reactionGroups.map((g) => (
              <button
                key={g.emoji}
                onClick={() => { haptic("light"); onToggleReaction?.(message.id, g.emoji); }}
                className={cn(
                  "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs transition-all active:scale-90",
                  g.hasOwn
                    ? "border border-[#d87aff]/40 bg-[#d87aff]/20"
                    : "border border-white/10 bg-black/24 hover:bg-white/10"
                )}
              >
                <span>{g.emoji}</span>
                {g.count > 1 && <span className="text-[10px] text-white/55">{g.count}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp + status */}
        {!editing && (
          <div className="flex items-center gap-1 px-1">
            <span className="text-[10px] text-white/42">
              {formatTime(message.created_at)}
              {message.is_edited && <span className="ml-1 italic">изм.</span>}
            </span>
            {message.expires_at && <ExpiryCountdown expiresAt={message.expires_at} />}
            {isPinned && <Pin className="w-2.5 h-2.5 text-amber-400" />}
            {isOwn && (
              message._status === "sending" ? (
                <span className="ml-1 flex items-center">
                  <Clock className="w-3 h-3 text-white/40" />
                </span>
              ) : message._status === "failed" ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onRetry?.(message.id); }}
                  className="flex items-center gap-0.5 text-red-500 hover:text-red-400 transition-colors"
                >
                  <AlertCircle className="w-3 h-3" />
                  <span className="text-[9px] font-medium">Повторить</span>
                </button>
              ) : (
                <span className="ml-1 flex items-center">
                  {message.is_read ? (
                    <svg width="16" height="10" viewBox="0 0 16 10" className="text-blue-400">
                      <path d="M1 5l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M6 5l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 10 10" className="text-white/40">
                      <path d="M1 5l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
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
                "absolute z-50 min-w-[180px] overflow-hidden rounded-2xl border border-white/10 bg-[#18181f]/94 shadow-2xl backdrop-blur-2xl",
                "bottom-full mb-1",
                isOwn ? "right-0" : "left-0"
              )}
            >
              {/* Quick emoji row */}
              {onToggleReaction && (
                <div className="flex items-center gap-0.5 border-b border-white/10 px-2 py-2">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleReaction(emoji)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors hover:bg-white/10 active:scale-90"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Reply */}
              {onReply && (
                <button onClick={handleReply} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10">
                  <Reply className="h-4 w-4 text-white/50" />
                  Ответить
                </button>
              )}

              {/* Forward */}
              {onForward && (
                <button onClick={handleForward} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10">
                  <Share2 className="h-4 w-4 text-white/50" />
                  Переслать
                </button>
              )}

              {/* Pin / Unpin */}
              {(onPin || onUnpin) && (
                <button onClick={handlePin} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10">
                  {isPinned
                    ? <><PinOff className="h-4 w-4 text-white/50" />Открепить</>
                    : <><Pin className="h-4 w-4 text-white/50" />Закрепить</>
                  }
                </button>
              )}

              {/* Copy */}
              {message.content && (
                <button onClick={handleCopy} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10">
                  <Copy className="h-4 w-4 text-white/50" />
                  Копировать
                </button>
              )}

              {/* Edit / Delete (own) */}
              {isOwn && (
                <>
                  {message.content && (
                    <button onClick={handleEdit} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10">
                      <Pencil className="h-4 w-4 text-white/50" />
                      Изменить
                    </button>
                  )}
                  <button onClick={handleDelete} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10">
                    <Trash2 className="h-4 w-4" />
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

/** Renders message content with @mentions highlighted and URLs clickable */
function MentionText({ content, isOwn }: { content: string; isOwn: boolean }) {
  // Split on both @mentions and URLs
  const parts = content.split(/(@\w+|https?:\/\/[^\s]+)/g);
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
                isOwn ? "bg-white/20 text-white" : "bg-[#8f9cff]/18 text-[#b9c1ff]"
              )}
            >
              {part}
            </span>
          );
        }
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="underline opacity-80"
            >
              {part}
            </a>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}
