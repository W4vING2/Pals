"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Phone,
  Video,
  Paperclip,
  SendHorizontal,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store";
import type { ConversationWithDetails } from "@/hooks/useMessages";
import type { Message } from "@/lib/supabase";

interface ChatWindowProps {
  conversation: ConversationWithDetails | null;
  messages: Message[];
  loading: boolean;
  onSend: (content: string, imageUrl?: string) => Promise<void>;
  onUploadImage: (file: File) => Promise<string | null>;
  onInitiateCall?: (type: "voice" | "video") => void;
  onOpenGroupSettings?: () => void;
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
  onInitiateCall,
  onOpenGroupSettings,
}: ChatWindowProps) {
  const { user } = useAuthStore();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [justSent, setJustSent] = useState(false);
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
  const chatName = isGroup
    ? conversation?.name ?? "Group"
    : otherProfile?.display_name ?? otherProfile?.username ?? "Unknown";
  const chatAvatarUrl = isGroup
    ? conversation?.avatar_url
    : otherProfile?.avatar_url;

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

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await onUploadImage(file);
    if (url) {
      await onSend("", url);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Show placeholder only when no conversation is selected AND no messages are loaded
  if (!conversation && messages.length === 0 && !loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
        <MessageSquare className="w-16 h-16 text-[var(--text-secondary)] opacity-20" />
        <div>
          <p className="font-semibold text-[var(--text-primary)]">
            Select a conversation
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Choose a chat from the left to start messaging
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      {conversation && <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-surface)]">
        {chatAvatarUrl ? (
          <img
            src={chatAvatarUrl}
            alt={chatName}
            className="w-9 h-9 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0",
            isGroup
              ? "bg-gradient-to-br from-purple-600 to-indigo-500"
              : "bg-gradient-to-br from-purple-500 to-emerald-500"
          )}>
            {isGroup ? <Users className="size-4" /> : chatName[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-[var(--text-primary)] truncate">
            {chatName}
          </p>
          {isGroup ? (
            <p className="text-xs text-[var(--text-secondary)]">
              {conversation.participants.length} members
            </p>
          ) : otherProfile?.username ? (
            <p className="text-xs text-[var(--text-secondary)]">
              @{otherProfile.username}
            </p>
          ) : null}
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
              No messages yet. Say hello!
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isOwn = msg.sender_id === user?.id;
            const showAvatar =
              !isOwn &&
              (idx === 0 || messages[idx - 1].sender_id !== msg.sender_id);
            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={isOwn}
                showAvatar={showAvatar}
                animate={!initialMsgIdsRef.current.has(msg.id)}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-surface)]/80 backdrop-blur-xl">
        <div className="flex items-end gap-2 bg-[var(--bg-input)] border border-[var(--border)] rounded-full px-4 py-2.5">
          {/* Image upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-[var(--text-secondary)] hover:text-[var(--accent-blue)] transition-colors shrink-0 mb-0.5"
            aria-label="Upload image"
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
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] resize-none outline-none max-h-32 leading-relaxed"
            style={{ minHeight: "20px" }}
          />

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
              "shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 mb-0.5",
              text.trim()
                ? "bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-hover)]"
                : "text-[var(--text-secondary)]"
            )}
            aria-label="Send"
          >
            <SendHorizontal className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
