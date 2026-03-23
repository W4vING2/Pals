"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Phone,
  Video,
  Paperclip,
  SendHorizontal,
  MessageSquare,
  Settings,
  Users,
  Loader2,
  X,
  Mic,
  Lock,
} from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { VoiceRecorder } from "./VoiceRecorder";
import { OnlineIndicator } from "@/components/shared/OnlineIndicator";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase";

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDate.getTime() === today.getTime()) return "Сегодня";
  if (msgDate.getTime() === yesterday.getTime()) return "Вчера";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: msgDate.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
import type { ConversationWithDetails } from "@/hooks/useMessages";
import type { Message } from "@/lib/supabase";

interface ChatWindowProps {
  conversation: ConversationWithDetails | null;
  messages: Message[];
  loading: boolean;
  onSend: (content: string, imageUrl?: string, audioUrl?: string) => Promise<void>;
  onUploadImage: (file: File) => Promise<string | null>;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onInitiateCall?: (type: "voice" | "video") => void;
  onOpenGroupSettings?: () => void;
  onBack?: () => void;
}

function SkeletonMessages() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex gap-2",
            i % 3 === 0 ? "flex-row-reverse" : "flex-row"
          )}
        >
          <div className="w-7 h-7 rounded-full bg-[var(--bg-elevated)] animate-pulse shrink-0" />
          <div
            className={cn(
              "h-10 rounded-2xl bg-[var(--bg-elevated)] animate-pulse",
              i % 2 === 0 ? "w-48" : "w-32"
            )}
          />
        </div>
      ))}
    </div>
  );
}

export function ChatWindow({
  conversation,
  messages,
  loading,
  onSend,
  onUploadImage,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  onRetryMessage,
  onInitiateCall,
  onOpenGroupSettings,
  onBack,
}: ChatWindowProps) {
  const { user } = useAuthStore();
  const router = useRouter();
  const { typingUsers, broadcastTyping } = useTypingIndicator(conversation?.id ?? null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [voiceMode, setVoiceMode] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Track message IDs that were loaded initially (no animation needed)
  const initialMsgIdsRef = useRef<Set<string>>(new Set());

  // When loading finishes, snapshot current message IDs as "initial" (no animation)
  useEffect(() => {
    if (!loading && messages.length > 0 && initialMsgIdsRef.current.size === 0) {
      initialMsgIdsRef.current = new Set(messages.map((m) => m.id));
    }
  }, [loading, messages]);

  // Reset initial IDs when conversation changes
  useEffect(() => {
    initialMsgIdsRef.current = new Set();
  }, [conversation?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Prevent textarea from auto-focusing on mobile (opens keyboard)
  useEffect(() => {
    const isMobile = window.innerWidth < 1024;
    if (isMobile) {
      const el = document.activeElement as HTMLElement | null;
      if (el?.tagName === "TEXTAREA") el.blur();
    }
  }, [conversation]);

  const isGroup = conversation?.is_group ?? false;
  const otherParticipant = isGroup
    ? null
    : conversation?.participants.find((p) => p.user_id !== user?.id);
  const otherProfile = otherParticipant?.profiles;
  const otherUserId = otherParticipant?.user_id;
  const chatName = isGroup
    ? conversation?.name ?? "Группа"
    : otherProfile?.display_name ?? otherProfile?.username ?? "Неизвестный";
  const chatAvatarUrl = isGroup
    ? conversation?.avatar_url
    : otherProfile?.avatar_url;

  // Realtime online status for the other user
  const onlineUserIds = React.useMemo(
    () => (otherUserId ? [otherUserId] : []),
    [otherUserId]
  );
  const onlineMap = useOnlineStatus(onlineUserIds);
  const isOtherOnline = otherUserId
    ? onlineMap.get(otherUserId) ?? otherProfile?.is_online ?? false
    : false;

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText("");
    setJustSent(true);
    await onSend(trimmed);
    setSending(false);
    setTimeout(() => setJustSent(false), 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
    setCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSendImage = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const url = await onUploadImage(pendingFile);
      if (url) {
        await onSend(caption.trim(), url);
      } else {
        setUploadError("Не удалось загрузить файл");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError("Ошибка загрузки файла");
    }
    setUploading(false);
    cancelPendingImage();
  };

  const cancelPendingImage = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setCaption("");
  };

  const handleHeaderClick = () => {
    if (!isGroup && otherProfile?.username) {
      router.push(`/profile/${otherProfile.username}`);
    }
  };

  // Show placeholder only when no conversation is selected AND no messages are loaded
  if (!conversation && messages.length === 0 && !loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
        <MessageSquare className="w-16 h-16 text-[var(--text-secondary)] opacity-20" />
        <div>
          <p className="font-semibold text-[var(--text-primary)]">
            Выберите чат
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Выберите чат слева, чтобы начать общение
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      {conversation && <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-surface)]">
        {onBack && (
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors lg:hidden shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div
          className={cn(
            "flex items-center gap-3 flex-1 min-w-0",
            !isGroup && otherProfile?.username && "cursor-pointer hover:opacity-80 transition-opacity"
          )}
          onClick={handleHeaderClick}
        >
          <div className="relative shrink-0">
            {chatAvatarUrl ? (
              <img
                src={chatAvatarUrl}
                alt={chatName}
                className="w-9 h-9 rounded-full object-cover"
              />
            ) : (
              <div className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold",
                isGroup
                  ? "bg-gradient-to-br from-purple-600 to-indigo-500"
                  : "bg-gradient-to-br from-purple-500 to-emerald-500"
              )}>
                {isGroup ? <Users className="size-4" /> : chatName[0]?.toUpperCase()}
              </div>
            )}
            {!isGroup && (
              <OnlineIndicator
                isOnline={isOtherOnline}
                size="sm"
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-[var(--text-primary)] truncate flex items-center gap-1">
              {chatName}
              {!isGroup && <Lock className="size-3 text-emerald-500 shrink-0" />}
            </p>
            {isGroup ? (
              <p className="text-xs text-[var(--text-secondary)]">
                {conversation.participants.length} участников
              </p>
            ) : (
              <p className="text-xs text-[var(--text-secondary)]">
                {isOtherOnline ? (
                  <span className="text-emerald-500">В сети</span>
                ) : otherProfile?.username ? (
                  <>@{otherProfile.username}</>
                ) : null}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Group settings */}
          {isGroup && onOpenGroupSettings && (
            <button
              onClick={onOpenGroupSettings}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)] transition-all duration-150"
              aria-label="Group settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
          {/* Call buttons (only for DMs) */}
          {!isGroup && onInitiateCall && (
            <>
              <button
                onClick={() => onInitiateCall("voice")}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)] transition-all duration-150"
                aria-label="Voice call"
              >
                <Phone className="w-5 h-5" />
              </button>
              <button
                onClick={() => onInitiateCall("video")}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)] transition-all duration-150"
                aria-label="Video call"
              >
                <Video className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 px-4 space-y-2">
        {loading ? (
          <SkeletonMessages />
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <p className="text-sm text-[var(--text-secondary)]">
              Сообщений пока нет. Напишите первым!
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isOwn = msg.sender_id === user?.id;
            const showAvatar =
              !isOwn &&
              (idx === 0 || messages[idx - 1].sender_id !== msg.sender_id);

            // Show date separator if first message or different day from previous
            const showDateSep =
              idx === 0 ||
              getDateKey(msg.created_at) !== getDateKey(messages[idx - 1].created_at);

            return (
              <React.Fragment key={msg.id}>
                {showDateSep && (
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 h-px bg-[var(--border)]" />
                    <span className="text-[11px] font-medium text-[var(--text-secondary)] bg-[var(--bg-base)] px-3 py-1 rounded-full border border-[var(--border)]">
                      {formatDateSeparator(msg.created_at)}
                    </span>
                    <div className="flex-1 h-px bg-[var(--border)]" />
                  </div>
                )}
                <MessageBubble
                  message={msg}
                  isOwn={isOwn}
                  showAvatar={showAvatar}
                  animate={!initialMsgIdsRef.current.has(msg.id)}
                  onEdit={onEditMessage}
                  onDelete={onDeleteMessage}
                  onToggleReaction={onToggleReaction}
                  onRetry={onRetryMessage}
                />
              </React.Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      <AnimatePresence>
        {typingUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="px-4 py-1"
          >
            <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
              <span className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1 h-1 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1 h-1 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
              {typingUsers.length === 1
                ? `${typingUsers[0].displayName} печатает`
                : "Печатают..."}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {uploadError && (
        <div className="px-4 py-2 bg-red-500/10 text-red-400 text-xs text-center">
          {uploadError}
        </div>
      )}

      {/* Pending image preview */}
      <AnimatePresence>
        {pendingPreview && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-surface)]/90 backdrop-blur-xl"
          >
            <div className="flex items-start gap-3">
              <div className="relative rounded-xl overflow-hidden shrink-0" style={{ maxWidth: 120, maxHeight: 120 }}>
                <img src={pendingPreview} alt="Preview" className="w-full h-full object-cover rounded-xl" style={{ maxHeight: 120 }} />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendImage(); } }}
                  placeholder="Подпись (необязательно)..."
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSendImage}
                    disabled={uploading}
                    className="px-4 py-1.5 rounded-xl bg-[var(--accent-blue)] text-white text-sm font-medium hover:bg-[var(--accent-blue)]/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SendHorizontal className="w-3.5 h-3.5" />}
                    Отправить
                  </button>
                  <button
                    onClick={cancelPendingImage}
                    className="px-3 py-1.5 rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    Отмена
                  </button>
                </div>
              </div>
              <button
                onClick={cancelPendingImage}
                className="shrink-0 p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-surface)]/80 backdrop-blur-xl">
        <div className="flex items-center gap-2 bg-[var(--bg-input)] border border-[var(--border)] rounded-full px-4 py-2">
          {voiceMode ? (
            <VoiceRecorder
              onRecorded={async (blob) => {
                setVoiceMode(false);
                if (!user) return;
                const supabase = getSupabaseBrowserClient();
                const ext = blob.type.includes("webm") ? "webm" : "mp4";
                const path = `voice/${user.id}/${Date.now()}.${ext}`;
                const { error } = await supabase.storage.from("media").upload(path, blob, { upsert: false });
                if (error) {
                  console.error("Voice upload error:", error);
                  return;
                }
                const { data } = supabase.storage.from("media").getPublicUrl(path);
                await onSend("", undefined, data.publicUrl);
              }}
              onCancel={() => setVoiceMode(false)}
            />
          ) : (
            <>
              {/* Image upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-[var(--text-secondary)] hover:text-[var(--accent-blue)] transition-colors shrink-0 flex items-center justify-center w-8 h-8"
                aria-label="Загрузить изображение"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />

              {/* Text input */}
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); broadcastTyping(); }}
                onKeyDown={handleKeyDown}
                placeholder="Сообщение..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] resize-none outline-none max-h-32 leading-normal self-center"
                style={{ minHeight: "24px", paddingTop: "2px", paddingBottom: "2px" }}
              />

              {/* Mic button */}
              <button
                onClick={() => setVoiceMode(true)}
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent-blue)] transition-colors"
                aria-label="Голосовое сообщение"
              >
                <Mic className="w-5 h-5" />
              </button>

              {/* Send */}
              <motion.button
                onClick={handleSend}
                disabled={!text.trim() || sending}
                animate={
                  justSent
                    ? { rotate: [0, -15, 15, 0], scale: [1, 1.15, 1] }
                    : { rotate: 0, scale: 1 }
                }
                transition={{ duration: 0.3 }}
                className={cn(
                  "shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150",
                  text.trim()
                    ? "bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-hover)]"
                    : "text-[var(--text-secondary)]"
                )}
                aria-label="Отправить"
              >
                <SendHorizontal className="w-4 h-4" />
              </motion.button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
