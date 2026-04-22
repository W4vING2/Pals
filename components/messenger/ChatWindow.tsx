"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Phone, Video, Paperclip, SendHorizontal,
  MessageSquare, Settings, Users, Loader2, X, Mic,
  Timer, Search, Pin,
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
  const chatInitial = isGroup ? "G" : chatName[0]?.toUpperCase() ?? "?";
  const wallpaperStyle: React.CSSProperties = {
    backgroundColor: "#030307",
    backgroundImage:
      "radial-gradient(circle at 18% 22%, rgba(162, 92, 255, 0.18) 0 1px, transparent 1.5px), radial-gradient(circle at 82% 14%, rgba(77, 144, 255, 0.16) 0 1px, transparent 1.5px), radial-gradient(circle at 38% 78%, rgba(218, 79, 255, 0.14) 0 1px, transparent 1.5px), linear-gradient(135deg, rgba(130, 75, 255, 0.13) 0 1px, transparent 1px), linear-gradient(45deg, rgba(83, 148, 255, 0.09) 0 1px, transparent 1px)",
    backgroundSize: "68px 68px, 92px 92px, 110px 110px, 36px 36px, 44px 44px",
  };

  const onlineUserIds = useMemo(() => (otherUserId ? [otherUserId] : []), [otherUserId]);
  const onlineMap = useOnlineStatus(onlineUserIds);
  const isOtherOnline = otherUserId ? onlineMap.get(otherUserId) ?? otherProfile?.is_online ?? false : false;
  const chatSubtitle = isGroup
    ? `${conversation?.participants.length ?? 0} участников`
    : isOtherOnline
      ? "online"
      : otherProfile?.username
        ? `@${otherProfile.username}`
        : "last seen recently";

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
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#030307] text-white" style={wallpaperStyle}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(95,95,255,0.16),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.36),rgba(0,0,0,0.08)_36%,rgba(0,0,0,0.62))]" />

      {/* Header */}
      {conversation && (
        <div className="relative z-20 px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.65rem)]">
          <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3 lg:grid-cols-[3rem_minmax(16rem,30rem)_auto]">
            {onBack ? (
              <button
                onClick={() => { haptic("light"); onBack(); }}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.09] text-white shadow-[0_16px_34px_rgba(0,0,0,0.34)] backdrop-blur-2xl transition active:scale-95 lg:hidden"
                aria-label="Назад"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={handleHeaderClick}
              className={cn(
                "mx-auto flex h-14 min-w-0 max-w-full items-center justify-center rounded-[1.65rem] border border-white/10 bg-[#17171d]/78 px-5 text-center shadow-[0_18px_42px_rgba(0,0,0,0.38)] backdrop-blur-2xl transition",
                !isGroup && otherProfile?.username && "hover:bg-white/[0.12] active:scale-[0.985]"
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-[17px] font-semibold leading-tight tracking-[0.01em] text-white">{chatName}</p>
                <p className={cn("truncate text-[13px] leading-tight", isOtherOnline ? "text-[#8affc1]" : "text-white/54")}>
                  {chatSubtitle}
                </p>
              </div>
            </button>

            <div className="flex items-center justify-end gap-2">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-[#8aa3ff] via-[#6b67ff] to-[#d64cff] text-lg font-bold text-white shadow-[0_12px_30px_rgba(101,86,255,0.35)]">
                {chatAvatarUrl ? (
                  <img src={chatAvatarUrl} alt={chatName} className="h-full w-full object-cover" />
                ) : isGroup ? (
                  <Users className="h-5 w-5" />
                ) : (
                  chatInitial
                )}
                {!isGroup && <OnlineIndicator isOnline={isOtherOnline} size="sm" />}
              </div>

              <div className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.07] p-1.5 backdrop-blur-2xl sm:flex">
                <button
                  onClick={() => { setSearchOpen((p) => !p); if (!searchOpen) setSearchQuery(""); }}
                  className={cn("flex h-9 w-9 items-center justify-center rounded-full transition", searchOpen ? "bg-white/18 text-[#ef7cff]" : "text-white/72 hover:bg-white/12 hover:text-white")}
                  aria-label="Поиск по сообщениям"
                >
                  <Search className="h-[18px] w-[18px]" />
                </button>

                {onSetDisappearTimer && (
                  <div className="relative" ref={timerMenuRef}>
                    <button
                      onClick={() => setTimerMenuOpen((p) => !p)}
                      className={cn("flex h-9 w-9 items-center justify-center rounded-full transition", currentDisappearAfter ? "bg-amber-400/16 text-amber-300" : "text-white/72 hover:bg-white/12 hover:text-white")}
                      title={`Исчезающие сообщения: ${currentDisappearLabel}`}
                    >
                      <Timer className="h-[18px] w-[18px]" />
                    </button>
                    <AnimatePresence>
                      {timerMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -4 }}
                          transition={{ duration: 0.12 }}
                          className="absolute right-0 top-full z-50 mt-2 min-w-[172px] overflow-hidden rounded-2xl border border-white/10 bg-[#18181f]/92 shadow-2xl backdrop-blur-2xl"
                        >
                          <div className="border-b border-white/10 px-3 py-2 text-[11px] font-semibold text-white/48">Исчезают через</div>
                          {DISAPPEAR_OPTIONS.map((opt) => (
                            <button
                              key={String(opt.value)}
                              onClick={() => handleDisappearSelect(opt.value)}
                              className={cn("flex w-full items-center justify-between px-3 py-2 text-sm text-white transition hover:bg-white/10", opt.value === currentDisappearAfter && "text-[#ef7cff]")}
                            >
                              {opt.label}
                              {opt.value === currentDisappearAfter && <span className="h-1.5 w-1.5 rounded-full bg-[#ef7cff]" />}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {isGroup && onOpenGroupSettings && (
                  <button onClick={onOpenGroupSettings} className="flex h-9 w-9 items-center justify-center rounded-full text-white/72 transition hover:bg-white/12 hover:text-white" aria-label="Настройки группы">
                    <Settings className="h-[18px] w-[18px]" />
                  </button>
                )}

                {!isGroup && onInitiateCall && (
                  <>
                    <button onClick={() => onInitiateCall("voice")} className="flex h-9 w-9 items-center justify-center rounded-full text-white/72 transition hover:bg-white/12 hover:text-white" aria-label="Аудиозвонок">
                      <Phone className="h-[18px] w-[18px]" />
                    </button>
                    <button onClick={() => onInitiateCall("video")} className="flex h-9 w-9 items-center justify-center rounded-full text-white/72 transition hover:bg-white/12 hover:text-white" aria-label="Видеозвонок">
                      <Video className="h-[18px] w-[18px]" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Search bar */}
          <AnimatePresence>
            {searchOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0, y: -8 }}
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden px-1 pt-3"
              >
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#15151b]/82 px-4 py-2.5 shadow-2xl backdrop-blur-2xl">
                  <Search className="h-4 w-4 shrink-0 text-white/45" />
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Поиск по сообщениям..."
                    className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/38"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="text-white/50">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <p className="mt-1.5 pl-4 text-xs text-white/45">
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
            className="relative z-10 mx-4 mb-2 flex items-center gap-2 rounded-2xl border border-amber-300/15 bg-amber-400/10 px-4 py-2 shadow-lg backdrop-blur-2xl"
          >
            <Pin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-amber-400">Закреплено</p>
              <p className="truncate text-xs text-white/55">
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
                className="shrink-0 p-1 text-white/55 transition-colors hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="relative z-10 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-4 pt-2 sm:px-5">
        {loading ? (
          <SkeletonMessages />
        ) : displayMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            {searchQuery ? (
              <>
                <Search className="h-10 w-10 text-white/20" />
                <p className="text-sm text-white/52">Ничего не найдено по запросу «{searchQuery}»</p>
              </>
            ) : (
              <p className="text-sm text-white/52">Сообщений пока нет. Напишите первым!</p>
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
                  <div className="flex items-center justify-center py-3">
                    <span className="rounded-full border border-white/10 bg-black/28 px-3 py-1 text-[12px] font-semibold text-white/82 shadow-lg backdrop-blur-xl">
                      {formatDateSeparator(msg.created_at)}
                    </span>
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
            className="relative z-10 px-4 py-1"
          >
            <span className="flex items-center gap-1.5 text-xs text-white/55">
              <span className="flex gap-0.5">
                <span className="h-1 w-1 animate-bounce rounded-full bg-white/45" style={{ animationDelay: "0ms" }} />
                <span className="h-1 w-1 animate-bounce rounded-full bg-white/45" style={{ animationDelay: "150ms" }} />
                <span className="h-1 w-1 animate-bounce rounded-full bg-white/45" style={{ animationDelay: "300ms" }} />
              </span>
              {typingUsers.length === 1 ? `${typingUsers[0].displayName} печатает` : "Печатают..."}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {uploadError && (
        <div className="relative z-10 mx-4 rounded-2xl bg-red-500/12 px-4 py-2 text-center text-xs text-red-300 backdrop-blur-xl">{uploadError}</div>
      )}

      {/* Pending image preview */}
      <AnimatePresence>
        {pendingPreview && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="relative z-20 mx-3 mb-2 rounded-[1.5rem] border border-white/10 bg-[#17171d]/86 px-4 py-3 shadow-2xl backdrop-blur-2xl"
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
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 text-sm text-white outline-none placeholder:text-white/40"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSendImage}
                    disabled={uploading}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#738cff] to-[#ed62ff] px-4 py-1.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SendHorizontal className="w-3.5 h-3.5" />}
                    Отправить
                  </button>
                  <button onClick={cancelPendingImage} className="rounded-xl px-3 py-1.5 text-sm text-white/55 transition-colors hover:bg-white/10">Отмена</button>
                </div>
              </div>
              <button onClick={cancelPendingImage} className="shrink-0 p-1 text-white/55 transition-colors hover:text-white">
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
            className="relative z-20 mx-3 mb-2 rounded-[1.25rem] border border-white/10 bg-[#17171d]/86 px-4 py-2 shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 border-l-2 border-[#ef7cff] pl-2">
                <p className="truncate text-[11px] font-semibold text-[#f58dff]">
                  {replyTo.profiles?.display_name ?? replyTo.profiles?.username ?? "Пользователь"}
                </p>
                <p className="truncate text-xs text-white/55">
                  {replyTo.message_type === "voice" ? "🎤 Голосовое" : replyTo.image_url ? "📷 Фото" : replyTo.content ?? ""}
                </p>
              </div>
              <button onClick={() => setReplyTo(null)} className="shrink-0 p-1 text-white/55 transition-colors hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="relative z-20 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-2">
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

        <div className="flex items-center gap-2">
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
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#17171d]/88 text-white/80 shadow-[0_12px_24px_rgba(0,0,0,0.3)] backdrop-blur-2xl transition hover:text-white active:scale-95"
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
                className="max-h-32 flex-1 resize-none self-center rounded-full border border-white/10 bg-[#17171d]/88 px-4 py-3 text-[16px] leading-normal text-white shadow-[0_12px_24px_rgba(0,0,0,0.28)] outline-none placeholder:text-white/38 backdrop-blur-2xl"
                style={{ minHeight: "48px", paddingTop: "12px", paddingBottom: "12px" }}
              />

              {/* Mic */}
              <button
                onClick={() => setVoiceMode(true)}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#17171d]/88 text-white/80 shadow-[0_12px_24px_rgba(0,0,0,0.3)] backdrop-blur-2xl transition hover:text-white active:scale-95"
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
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-[0_12px_28px_rgba(0,0,0,0.34)] transition-all duration-150",
                  text.trim() ? "bg-gradient-to-br from-[#f05dff] to-[#747dff] text-white" : "border border-white/10 bg-[#17171d]/88 text-white/50 backdrop-blur-2xl"
                )}
              >
                <SendHorizontal className="h-5 w-5" />
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
