"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { useCalls } from "@/hooks/useCalls";
import { useMessagesStore } from "@/lib/store";
import { ConversationList } from "@/components/messenger/ConversationList";
import { ChatWindow } from "@/components/messenger/ChatWindow";
import { PageTransition } from "@/components/layout/PageTransition";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MessagesPage() {
  const router = useRouter();
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

  // Read conversation ID from Zustand store (set before navigation) or URL
  const { pendingConversationId, setPendingConversationId } = useMessagesStore();
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const processedRef = useRef<string | null>(null);

  // On mount: check URL for conversation param, or use pending from store
  // Must wait for user to be available so Supabase RLS queries work
  useEffect(() => {
    if (!user) return;

    const url = new URL(window.location.href);
    const convIdFromUrl = url.searchParams.get("conversation");
    const targetConvId = convIdFromUrl || pendingConversationId;

    if (targetConvId && targetConvId !== processedRef.current) {
      processedRef.current = targetConvId;
      setMobileView("chat");
      // Load conversations first so activeConv resolves, then load messages
      loadConversations().then(() => loadMessages(targetConvId));

      // Clean up: remove from URL and store
      if (convIdFromUrl) {
        url.searchParams.delete("conversation");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
      if (pendingConversationId) {
        setPendingConversationId(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingConversationId, user]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth");
    }
  }, [user, authLoading, router]);

  const handleSelectConversation = useCallback((id: string) => {
    processedRef.current = id;
    loadMessages(id);
    setMobileView("chat");
  }, [loadMessages]);

  const handleBack = useCallback(() => {
    processedRef.current = null;
    setMobileView("list");
  }, []);

  const activeConv =
    conversations.find((c) => c.id === activeConversationId) ?? null;

  const handleSend = async (content: string, imageUrl?: string) => {
    if (!activeConversationId) return;
    await sendMessage(activeConversationId, content, imageUrl);
  };

  const handleInitiateCall = async (type: "voice" | "video") => {
    if (!activeConv || !user) return;
    const other = activeConv.participants.find(
      (p) => p.user_id !== user.id
    );
    if (!other) return;
    await initiateCall(activeConv.id, other.user_id, type);
  };

  if (authLoading) {
    return (
      <div className="h-[calc(100dvh-5rem)] lg:h-dvh flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-[var(--accent-blue)] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <PageTransition className="h-[calc(100dvh-5rem)] lg:h-dvh">
      <div className="h-full flex overflow-hidden bg-[var(--bg-base)]">
        {/* Conversation list */}
        <div
          className={cn(
            "flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-surface)]",
            "w-full lg:w-80 xl:w-96",
            "lg:block",
            mobileView === "chat" ? "hidden" : "block"
          )}
        >
          <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border)] lg:hidden">
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              Messages
            </h1>
          </div>
          <div className="hidden lg:flex items-center px-4 py-4 border-b border-[var(--border)]">
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              Messages
            </h1>
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

        {/* Chat window */}
        <div
          className={cn(
            "flex-1 flex flex-col",
            "lg:flex",
            mobileView === "list" ? "hidden" : "flex"
          )}
        >
          {mobileView === "chat" && (
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] lg:hidden bg-[var(--bg-surface)]">
              <button
                onClick={handleBack}
                className="w-8 h-8 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>
          )}

          <ChatWindow
            conversation={activeConv}
            messages={messages}
            loading={loadingMessages || loadingConversations}
            onSend={handleSend}
            onUploadImage={uploadMessageImage}
            onInitiateCall={handleInitiateCall}
          />
        </div>
      </div>
    </PageTransition>
  );
}
