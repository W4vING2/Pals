"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { useCalls } from "@/hooks/useCalls";
import { ConversationList } from "@/components/messenger/ConversationList";
import { ChatWindow } from "@/components/messenger/ChatWindow";

function MessagesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const {
    conversations,
    messages,
    activeConversationId,
    loadingConversations,
    loadingMessages,
    loadMessages,
    loadConversations,
    sendMessage,
    uploadMessageImage,
  } = useMessages();
  const { initiateCall } = useCalls();

  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [user, authLoading, router]);

  // Auto-select conversation from URL
  useEffect(() => {
    const convId = searchParams.get("conversation");
    if (convId && convId !== activeConversationId) {
      loadMessages(convId);
      setMobileView("chat");
      // Reload conversation list so the new conversation appears in sidebar
      loadConversations();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSelectConversation = (id: string) => {
    loadMessages(id);
    setMobileView("chat");
    // Update URL without navigation
    const url = new URL(window.location.href);
    url.searchParams.set("conversation", id);
    window.history.replaceState({}, "", url.toString());
  };

  const activeConv = conversations.find((c) => c.id === activeConversationId) ?? null;

  const handleSend = async (content: string, imageUrl?: string) => {
    if (!activeConversationId) return;
    await sendMessage(activeConversationId, content, imageUrl);
  };

  const handleInitiateCall = async (type: "voice" | "video") => {
    if (!activeConv || !user) return;
    const other = activeConv.participants.find((p) => p.user_id !== user.id);
    if (!other) return;
    await initiateCall(activeConv.id, other.user_id, type);
  };

  if (authLoading) {
    return (
      <div className="h-dvh flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-[var(--accent-blue)] border-t-transparent animate-spin-slow" />
      </div>
    );
  }

  return (
    <div className="h-dvh flex overflow-hidden bg-[var(--bg-base)]">
      {/* Conversation list (left panel / mobile when list view) */}
      <div
        className={[
          "flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-surface)]",
          "w-full lg:w-80 xl:w-96",
          "lg:block",
          mobileView === "chat" ? "hidden" : "block",
        ].join(" ")}
      >
        {/* Mobile header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border)] lg:hidden">
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Messages</h1>
        </div>
        <div className="hidden lg:flex items-center px-4 py-4 border-b border-[var(--border)]">
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Messages</h1>
        </div>

        <div className="h-[calc(100%-64px)] overflow-hidden">
          <ConversationList
            conversations={conversations}
            activeId={activeConversationId}
            loading={loadingConversations}
            onSelect={handleSelectConversation}
          />
        </div>
      </div>

      {/* Chat window (right panel / mobile when chat view) */}
      <div
        className={[
          "flex-1 flex flex-col",
          "lg:flex",
          mobileView === "list" ? "hidden" : "flex",
        ].join(" ")}
      >
        {/* Mobile back button */}
        {mobileView === "chat" && (
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] lg:hidden bg-[var(--bg-surface)]">
            <button
              onClick={() => setMobileView("list")}
              className="w-8 h-8 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Back"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
            </button>
          </div>
        )}

        <ChatWindow
          conversation={activeConv}
          messages={messages}
          loading={loadingMessages}
          onSend={handleSend}
          onUploadImage={uploadMessageImage}
          onInitiateCall={handleInitiateCall}
        />
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={
      <div className="h-dvh flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-[var(--accent-blue)] border-t-transparent animate-spin-slow" />
      </div>
    }>
      <MessagesContent />
    </Suspense>
  );
}
