"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Phone, Video, Paperclip, SendHorizontal,
  MessageSquare, Settings, Users, Loader2, X, Mic, Lock,
  Timer, ChevronDown, Search, Pin, PinOff, AtSign,
} from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { ForwardModal } from "./ForwardModal";
import { VoiceRecorder } from "./VoiceRecorder";
import { OnlineIndicator } from "@/components/shared/OnlineIndicator";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { haptic } from "@/lib/haptics";
import { compressImage } from "@/lib/compress";

function isCapacitorNative(): boolean {
  return typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
}

async function pickImageCapacitor(): Promise<File | null> {
  try {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const perms = await Camera.requestPermissions({ permissions: ["photos", "camera"] });
    if (perms.photos === "denied" && perms.camera === "denied") {
      alert("Для прикрепления фото необходимо разрешить доступ к камере или галерее в настройках приложения.");
      return null;
    }
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Prompt,
      promptLabelHeader: "Фото",
      promptLabelPhoto: "Галерея",
      promptLabelPicture: "Камера",
    });
    if (!photo.webPath) return null;
    const response = await fetch(photo.webPath);
    const blob = await response.blob();
    const ext = photo.format || "jpeg";
    return new File([blob], `photo_${Date.now()}.${ext}`, { type: `image/${ext}` });
  } catch (err: any) {
    if (err?.message?.includes("cancelled") || err?.message?.includes("User cancelled")) return null;
    console.error("Capacitor camera error:", err);
    alert("Не удалось получить фото. Проверьте разрешения в настройках.");
    return null;
  }
}

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

const DISAPPEAR_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Выключено", value: null },
  { label: "30 секунд", value: 30 },
  { label: "5 минут", value: 300 },
  { label: "1 час", value: 3600 },
  { label: "1 день", value: 86400 },
  { label: "1 неделя", value: 604800 },
];

interface ChatWindowProps {
  conversation: ConversationWithDetails | null;
  messages: Message[];
  loading: boolean;
  onSend: (content: string, imageUrl?: string, audioUrl?: string, replyToMsg?: Message | null) => Promise<void>;
  onUploadImage: (file: File) => Promise<string | null>;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onInitiateCall?: (type: "voice" | "video") => void;
  onOpenGroupSettings?: () => void;
  onBack?: () => void;
  onSetDisappearTimer?: (conversationId: string, seconds: number | null) => Promise<void>;
  onForwardMessage?: (message: Message, targetConversationIds: string[]) => Promise<void>;
  onPinMessage?: (messageId: string) => Promise<void>;
  onUnpinMessage?: () => Promise<void>;
  conversations?: ConversationWithDetails[];
}

function SkeletonMessages() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={cn("flex gap-2", i % 3 === 0 ? "flex-row-reverse" : "flex-row")}>
          <div className="w-7 h-7 rounded-full bg-[var(--bg-elevated)] animate-pulse shrink-0" />
          <div className={cn("h-10 rounded-2xl bg-[var(--bg-elevated)] animate-pulse", i % 2 === 0 ? "w-48" : "w-32")} />
        </div>
      ))}
    </div>
  );
}

/** Mentions autocomplete dropdown */
function MentionsDropdown({
  query,
  participants,
  onSelect,
}: {
  query: string;
  participants: Array<{ user_id: string; profiles: { username: string; display_name: string | null; avatar_url: string | null } | undefined }>;
  onSelect: (username: string) => void;
}) {
  const filtered = participants.filter((p) => {
    const u = p.profiles?.username ?? "";
    const d = p.profiles?.display_name ?? "";
    return u.toLowerCase().includes(query.toLowerCase()) || d.toLowerCase().includes(query.toLowerCase());
  });

  if (filtered.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      className="absolute bottom-full mb-1 left-0 right-0 mx-4 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden z-20 max-h-48 overflow-y-auto"
    >
      {filtered.map((p) => (
        <button
          key={p.user_id}
          onClick={() => onSelect(p.profiles?.username ?? "")}
          className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left hover:bg-[var(--bg-surface)] transition-colors"
        >
          {p.profiles?.avatar_url ? (
            <img src={p.profiles.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-emerald-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {(p.profiles?.username ?? "?")[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[var(--text-primary)] truncate">{p.profiles?.display_name ?? p.profiles?.username}</p>
            <p className="text-xs text-[var(--text-secondary)]">@{p.profiles?.username}</p>
          </div>
        </button>
      ))}
    </motion.div>
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
  onSetDisappearTimer,
  onForwardMessage,
  onPinMessage,
  onUnpinMessage,
  conversations = [],
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
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [timerMenuOpen, setTimerMenuOpen] = useState(false);
  const timerMenuRef = useRef<HTMLDivElement>(null);

  // Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Forward
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);

  // @mentions
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialMsgIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && messages.length > 0 && initialMsgIdsRef.current.size === 0) {
      initialMsgIdsRef.current = new Set(messages.map((m) => m.id));
    }
  }, [loading, messages]);

  useEffect(() => {
    initialMsgIdsRef.current = new Set();
    setReplyTo(null);
    setSearchQuery("");
    setSearchOpen(false);
  }, [conversation?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const isMobile = window.innerWidth < 1024;
    if (isMobile) {
      const el = document.activeElement as HTMLElement | null;
      if (el?.tagName === "TEXTAREA") el.blur();
    }
  }, [conversation]);

  useEffect(() => {
    if (!timerMenuOpen) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (timerMenuRef.current && !timerMenuRef.current.contains(e.target as Node)) setTimerMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("touchstart", handler); };
  }, [timerMenuOpen]);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);

  const isGroup = conversation?.is_group ?? false;
  const otherParticipant = isGroup ? null : conversation?.participants.find((p) => p.user_id !== user?.id);
  const otherProfile = otherParticipant?.profiles;
  const otherUserId = otherParticipant?.user_id;
  const chatName = isGroup
    ? conversation?.name ?? "Группа"
    : otherProfile?.display_name ?? otherProfile?.username ?? "Неизвестный";
  const chatAvatarUrl = isGroup ? conversation?.avatar_url : otherProfile?.avatar_url;
  const currentDisappearAfter = conversation?.disappear_after ?? null;
  const currentDisappearLabel = DISAPPEAR_OPTIONS.find((o) => o.value === currentDisappearAfter)?.label ?? "Выключено";

  const onlineUserIds = useMemo(() => (otherUserId ? [otherUserId] : []), [otherUserId]);
  const onlineMap = useOnlineStatus(onlineUserIds);
  const isOtherOnline = otherUserId ? onlineMap.get(otherUserId) ?? otherProfile?.is_online ?? false : false;

  // Pinned message
  const pinnedMessageId = conversation?.pinned_message_id ?? null;
  const pinnedMessage = useMemo(
    () => (pinnedMessageId ? messages.find((m) => m.id === pinnedMessageId) ?? null : null),
    [messages, pinnedMessageId]
  );

  // Filtered messages for search
  const displayMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter((m) => m.content?.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  // @mentions detection
  const handleTextChange = (val: string) => {
    setText(val);
    broadcastTyping();

    // Detect @mention at cursor
    const textarea = textareaRef.current;
    if (!textarea) { setMentionQuery(null); return; }
    const cursor = textarea.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (username: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const replaced = before.replace(/@\w*$/, `@${username} `);
    setText(replaced + after);
    setMentionQuery(null);
    // Restore focus
    setTimeout(() => {
      textarea.focus();
      const newPos = replaced.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText("");
    setMentionQuery(null);
    setJustSent(true);
    const reply = replyTo;
    setReplyTo(null);
    haptic("light");
    await onSend(trimmed, undefined, undefined, reply);
    setSending(false);
    setTimeout(() => setJustSent(false), 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === "Escape" && replyTo) setReplyTo(null);
    if (e.key === "Escape" && mentionQuery !== null) setMentionQuery(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const compressed = await compressImage(file);
    setPendingFile(compressed);
    setPendingPreview(URL.createObjectURL(compressed));
    setCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSendImage = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const url = await onUploadImage(pendingFile);
      if (url) {
        const reply = replyTo;
        setReplyTo(null);
        await onSend(caption.trim(), url, undefined, reply);
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
    if (!isGroup && otherProfile?.username) router.push(`/profile/${otherProfile.username}`);
  };

  const handleDisappearSelect = async (seconds: number | null) => {
    setTimerMenuOpen(false);
    if (conversation && onSetDisappearTimer) await onSetDisappearTimer(conversation.id, seconds);
  };

  const handleForwardTo = async (targetIds: string[]) => {
    if (!forwardMessage) return;
    await onForwardMessage?.(forwardMessage, targetIds);
    setForwardMessage(null);
  };

  const handleReply = (msg: Message) => {
    setReplyTo(msg);
  };

  if (!conversation && messages.length === 0 && !loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <MessageSquare className="w-16 h-16 text-[var(--text-secondary)] opacity-20" />
        </motion.div>
        <div>
          <p className="font-semibold text-[var(--text-primary)]">Выберите чат</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Выберите чат слева, чтобы начать общение</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      {conversation && (
        <div className="flex flex-col border-b border-[var(--border)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-3 px-4 py-3">
            {onBack && (
              <button onClick={() => { haptic("light"); onBack(); }} className="w-8 h-8 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors lg:hidden shrink-0">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div
              className={cn("flex items-center gap-3 flex-1 min-w-0", !isGroup && otherProfile?.username && "cursor-pointer hover:opacity-80 transition-opacity")}
              onClick={handleHeaderClick}
            >
              <div className="relative shrink-0">
                {chatAvatarUrl ? (
                  <img src={chatAvatarUrl} alt={chatName} className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold", isGroup ? "bg-gradient-to-br from-purple-600 to-indigo-500" : "bg-gradient-to-br from-purple-500 to-emerald-500")}>
                    {isGroup ? <Users className="size-4" /> : chatName[0]?.toUpperCase()}
                  </div>
                )}
                {!isGroup && <OnlineIndicator isOnline={isOtherOnline} size="sm" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-[var(--text-primary)] truncate flex items-center gap-1">
                  {chatName}
                  {!isGroup && <Lock className="size-3 text-emerald-500 shrink-0" />}
                </p>
                {isGroup ? (
                  <p className="text-xs text-[var(--text-secondary)]">{conversation.participants.length} участников</p>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)]">
                    {isOtherOnline ? <span className="text-emerald-500">В сети</span> : otherProfile?.username ? <>@{otherProfile.username}</> : null}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Search toggle */}
              <button
                onClick={() => { setSearchOpen((p) => !p); if (!searchOpen) setSearchQuery(""); }}
                className={cn("w-9 h-9 rounded-xl flex items-center justify-center transition-all", searchOpen ? "text-[var(--accent-blue)] bg-[var(--accent-blue)]/10" : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]")}
                aria-label="Поиск по сообщениям"
              >
                <Search className="w-5 h-5" />
              </button>

              {/* Disappear timer */}
              {onSetDisappearTimer && (
                <div className="relative" ref={timerMenuRef}>
                  <button
                    onClick={() => setTimerMenuOpen((p) => !p)}
                    className={cn("w-9 h-9 rounded-xl flex items-center justify-center transition-all", currentDisappearAfter ? "text-amber-400 hover:bg-amber-400/10" : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)]")}
                    title={`Исчезающие сообщения: ${currentDisappearLabel}`}
                  >
                    <Timer className="w-5 h-5" />
                  </button>
                  <AnimatePresence>
                    {timerMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 top-full mt-1 z-50 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden min-w-[160px]"
                      >
                        <div className="px-3 py-2 text-[11px] font-semibold text-[var(--text-secondary)] border-b border-[var(--border)]">Исчезают через</div>
                        {DISAPPEAR_OPTIONS.map((opt) => (
                          <button
                            key={String(opt.value)}
                            onClick={() => handleDisappearSelect(opt.value)}
                            className={cn("flex items-center justify-between w-full px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-surface)]", opt.value === currentDisappearAfter ? "text-[var(--accent-blue)] font-medium" : "text-[var(--text-primary)]")}
                          >
                            {opt.label}
                            {opt.value === currentDisappearAfter && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-blue)]" />}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Group settings */}
              {isGroup && onOpenGroupSettings && (
                <button onClick={onOpenGroupSettings} className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)] transition-all">
                  <Settings className="w-5 h-5" />
                </button>
              )}

              {/* Call buttons (DMs only) */}
              {!isGroup && onInitiateCall && (
                <>
                  <button onClick={() => onInitiateCall("voice")} className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)] transition-all">
                    <Phone className="w-5 h-5" />
                  </button>
                  <button onClick={() => onInitiateCall("video")} className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)] transition-all">
                    <Video className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Search bar */}
          <AnimatePresence>
            {searchOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="px-4 pb-3 overflow-hidden"
              >
                <div className="flex items-center gap-2 bg-[var(--bg-elevated)] rounded-xl px-3 py-2">
                  <Search className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Поиск по сообщениям..."
                    className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="text-[var(--text-secondary)]">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <p className="text-xs text-[var(--text-secondary)] mt-1.5 pl-1">
                    Найдено: {displayMessages.length}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Pinned message banner */}
      <AnimatePresence>
        {pinnedMessage && !searchOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20"
          >
            <Pin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-amber-400">Закреплено</p>
              <p className="text-xs text-[var(--text-secondary)] truncate">
                {pinnedMessage.message_type === "voice"
                  ? "🎤 Голосовое"
                  : pinnedMessage.image_url
                  ? "📷 Фото"
                  : pinnedMessage.content ?? ""}
              </p>
            </div>
            {onUnpinMessage && (
              <button
                onClick={() => { haptic("light"); onUnpinMessage(); }}
                className="shrink-0 p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 px-4 space-y-2">
        {loading ? (
          <SkeletonMessages />
        ) : displayMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            {searchQuery ? (
              <>
                <Search className="w-10 h-10 text-[var(--text-secondary)] opacity-20" />
                <p className="text-sm text-[var(--text-secondary)]">Ничего не найдено по запросу «{searchQuery}»</p>
              </>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">Сообщений пока нет. Напишите первым!</p>
            )}
          </div>
        ) : (
          displayMessages.map((msg, idx) => {
            const isOwn = msg.sender_id === user?.id;
            const prev = displayMessages[idx - 1];
            const showAvatar = !isOwn && (idx === 0 || prev.sender_id !== msg.sender_id);
            const showDateSep = idx === 0 || getDateKey(msg.created_at) !== getDateKey(prev.created_at);

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
                  isPinned={msg.id === pinnedMessageId}
                  onEdit={onEditMessage}
                  onDelete={onDeleteMessage}
                  onToggleReaction={onToggleReaction}
                  onRetry={onRetryMessage}
                  onReply={handleReply}
                  onForward={onForwardMessage ? (m) => setForwardMessage(m) : undefined}
                  onPin={onPinMessage}
                  onUnpin={onUnpinMessage}
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
              {typingUsers.length === 1 ? `${typingUsers[0].displayName} печатает` : "Печатают..."}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {uploadError && (
        <div className="px-4 py-2 bg-red-500/10 text-red-400 text-xs text-center">{uploadError}</div>
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
                  <button onClick={cancelPendingImage} className="px-3 py-1.5 rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">Отмена</button>
                </div>
              </div>
              <button onClick={cancelPendingImage} className="shrink-0 p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reply indicator */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-surface)]/90 backdrop-blur-xl"
          >
            <div className="flex items-center gap-2">
              <div className="flex-1 pl-2 border-l-2 border-[var(--accent-blue)] min-w-0">
                <p className="text-[11px] font-semibold text-[var(--accent-blue)] truncate">
                  {replyTo.profiles?.display_name ?? replyTo.profiles?.username ?? "Пользователь"}
                </p>
                <p className="text-xs text-[var(--text-secondary)] truncate">
                  {replyTo.message_type === "voice" ? "🎤 Голосовое" : replyTo.image_url ? "📷 Фото" : replyTo.content ?? ""}
                </p>
              </div>
              <button onClick={() => setReplyTo(null)} className="shrink-0 p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="relative px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-surface)]/80 backdrop-blur-xl">
        {/* Mentions dropdown */}
        <AnimatePresence>
          {mentionQuery !== null && conversation && (
            <MentionsDropdown
              query={mentionQuery}
              participants={(conversation.participants as any[]).filter((p) => p.user_id !== user?.id)}
              onSelect={insertMention}
            />
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2 bg-[var(--bg-input)] border border-[var(--border)] rounded-full px-4 py-2">
          {voiceMode ? (
            <VoiceRecorder
              onRecorded={async (blob) => {
                if (!user) { setVoiceMode(false); return; }
                try {
                  const supabase = getSupabaseBrowserClient();
                  const ext = blob.type.includes("webm") ? "webm" : blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
                  const filePath = `voice/${user.id}/${Date.now()}.${ext}`;
                  const { error } = await supabase.storage.from("media").upload(filePath, blob, { upsert: false, contentType: blob.type || "audio/webm" });
                  if (error) { console.error("Voice upload error:", error); setUploadError("Не удалось отправить голосовое сообщение"); setVoiceMode(false); return; }
                  const { data } = supabase.storage.from("media").getPublicUrl(filePath);
                  if (data?.publicUrl) {
                    const reply = replyTo;
                    setReplyTo(null);
                    haptic("light");
                    await onSend("", undefined, data.publicUrl, reply);
                  } else {
                    setUploadError("Не удалось получить ссылку на аудио");
                  }
                } catch (err) {
                  console.error("Voice send failed:", err);
                  setUploadError("Ошибка отправки голосового сообщения");
                } finally {
                  setVoiceMode(false);
                }
              }}
              onCancel={() => setVoiceMode(false)}
            />
          ) : (
            <>
              {/* Image upload */}
              <button
                onClick={async () => {
                  if (isCapacitorNative()) {
                    const file = await pickImageCapacitor();
                    if (file) { setUploadError(null); const compressed = await compressImage(file); setPendingFile(compressed); setPendingPreview(URL.createObjectURL(compressed)); setCaption(""); }
                  } else {
                    fileInputRef.current?.click();
                  }
                }}
                disabled={uploading}
                className="text-[var(--text-secondary)] hover:text-[var(--accent-blue)] transition-colors shrink-0 flex items-center justify-center w-8 h-8"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" capture={false as any} className="hidden" onChange={handleImageUpload} />

              {/* Text input */}
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Сообщение..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] resize-none outline-none max-h-32 leading-normal self-center"
                style={{ minHeight: "24px", paddingTop: "2px", paddingBottom: "2px" }}
              />

              {/* Mic */}
              <button
                onClick={() => setVoiceMode(true)}
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent-blue)] transition-colors"
              >
                <Mic className="w-5 h-5" />
              </button>

              {/* Send */}
              <motion.button
                onClick={handleSend}
                disabled={!text.trim() || sending}
                animate={justSent ? { rotate: [0, -15, 15, 0], scale: [1, 1.15, 1] } : { rotate: 0, scale: 1 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  "shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150",
                  text.trim() ? "bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-hover)]" : "text-[var(--text-secondary)]"
                )}
              >
                <SendHorizontal className="w-4 h-4" />
              </motion.button>
            </>
          )}
        </div>
      </div>

      {/* Forward modal */}
      <ForwardModal
        open={forwardMessage !== null}
        message={forwardMessage}
        conversations={conversations}
        currentUserId={user?.id ?? ""}
        onClose={() => setForwardMessage(null)}
        onForward={handleForwardTo}
      />
    </div>
  );
}
