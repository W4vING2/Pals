"use client";

import React, { useEffect, useRef, useState } from "react";
import { MessageBubble } from "./MessageBubble";
import { SkeletonMessage } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";
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
}

export function ChatWindow({
  conversation,
  messages,
  loading,
  onSend,
  onUploadImage,
  onInitiateCall,
}: ChatWindowProps) {
  const { user } = useAuthStore();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const otherParticipant = conversation?.participants.find(
    (p) => p.user_id !== user?.id
  );
  const otherProfile = otherParticipant?.profiles;
  const otherName = otherProfile?.display_name ?? otherProfile?.username ?? "Unknown";

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText("");
    await onSend(trimmed);
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
        <svg className="w-16 h-16 text-[var(--text-secondary)]/20" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M56 40a8 8 0 01-8 8H18L8 58V16a8 8 0 018-8h32a8 8 0 018 8v24z" />
        </svg>
        <div>
          <p className="font-semibold text-[var(--text-primary)]">Select a conversation</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Choose a chat from the left to start messaging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-surface)]">
        <Avatar src={otherProfile?.avatar_url} name={otherName} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{otherName}</p>
          {otherProfile?.username && (
            <p className="text-xs text-[var(--text-secondary)]">@{otherProfile.username}</p>
          )}
        </div>

        {/* Call buttons */}
        {onInitiateCall && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onInitiateCall("voice")}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)] transition-all duration-150"
              aria-label="Voice call"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
              </svg>
            </button>
            <button
              onClick={() => onInitiateCall("video")}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)] transition-all duration-150"
              aria-label="Video call"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 px-4 space-y-2">
        {loading ? (
          <SkeletonMessage />
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <p className="text-sm text-[var(--text-secondary)]">No messages yet. Say hello! 👋</p>
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
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="flex items-end gap-2 bg-[var(--bg-input)] border border-[var(--border)] rounded-3xl px-4 py-3 focus-within:border-[var(--accent-blue)] transition-colors">
          {/* Image upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-[var(--text-secondary)] hover:text-[var(--accent-blue)] transition-colors shrink-0 mb-0.5"
            aria-label="Upload image"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
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
            placeholder="Message…"
            rows={1}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] resize-none outline-none max-h-32 leading-relaxed"
            style={{ minHeight: "20px" }}
          />

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 mb-0.5 ${
              text.trim()
                ? "bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-hover)]"
                : "text-[var(--text-secondary)]"
            }`}
            aria-label="Send"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
