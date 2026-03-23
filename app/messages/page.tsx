"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { useCalls } from "@/hooks/useCalls";
import { useMessagesStore } from "@/lib/store";
import { ConversationList } from "@/components/messenger/ConversationList";
import { ChatWindow } from "@/components/messenger/ChatWindow";
import { CreateGroup } from "@/components/messenger/CreateGroup";
import { GroupSettings } from "@/components/messenger/GroupSettings";
import { PageTransition } from "@/components/layout/PageTransition";
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
    editMessage,
    deleteMessage,
    toggleReaction,
    retryMessage,
    uploadMessageImage,
    deleteConversation,
  } = useMessages();
  const { initiateCall } = useCalls();

  // Read conversation ID from Zustand store (set before navigation) or URL
  const { pendingConversationId, setPendingConversationId } = useMessagesStore();
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
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

  const handleGroupCreated = (conversationId: string) => {
    loadConversations().then(() => {
      loadMessages(conversationId);
      setMobileView("chat");
    });
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
        {/* Desktop: both panels always visible */}
        <div className="hidden lg:block flex-shrink-0 w-80 xl:w-96 border-r border-[var(--border)] bg-[var(--bg-surface)]">
          <div className="h-full overflow-hidden">
            <ConversationList
              conversations={conversations}
              activeId={activeConversationId}
              loading={loadingConversations}
              onSelect={handleSelectConversation}
              onCreateGroup={() => setCreateGroupOpen(true)}
              onDeleteConversation={deleteConversation}
            />
          </div>
        </div>
        <div className="hidden lg:flex flex-1 flex-col">
          <ChatWindow
            conversation={activeConv}
            messages={messages}
            loading={loadingMessages || loadingConversations}
            onSend={handleSend}
            onUploadImage={uploadMessageImage}
            onEditMessage={editMessage}
            onDeleteMessage={deleteMessage}
            onToggleReaction={toggleReaction}
            onRetryMessage={retryMessage}
            onInitiateCall={handleInitiateCall}
            onOpenGroupSettings={() => setGroupSettingsOpen(true)}
            onBack={handleBack}
          />
        </div>

        {/* Mobile: animated slide between list and chat */}
        <div className="lg:hidden w-full h-full relative overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            {mobileView === "list" ? (
              <motion.div
                key="conv-list"
                className="absolute inset-0 bg-[var(--bg-surface)]"
                initial={{ x: "-100%", opacity: 0.5 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: "-100%", opacity: 0.5 }}
                transition={{ type: "spring", stiffness: 400, damping: 35, mass: 0.8 }}
              >
                <div className="h-full overflow-hidden">
                  <ConversationList
                    conversations={conversations}
                    activeId={activeConversationId}
                    loading={loadingConversations}
                    onSelect={handleSelectConversation}
                    onCreateGroup={() => setCreateGroupOpen(true)}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="chat-window"
                className="absolute inset-0 flex flex-col"
                initial={{ x: "100%", opacity: 0.5 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: "100%", opacity: 0.5 }}
                transition={{ type: "spring", stiffness: 400, damping: 35, mass: 0.8 }}
              >
                <ChatWindow
                  conversation={activeConv}
                  messages={messages}
                  loading={loadingMessages || loadingConversations}
                  onSend={handleSend}
                  onUploadImage={uploadMessageImage}
                  onEditMessage={editMessage}
                  onDeleteMessage={deleteMessage}
                  onToggleReaction={toggleReaction}
                  onRetryMessage={retryMessage}
                  onInitiateCall={handleInitiateCall}
                  onOpenGroupSettings={() => setGroupSettingsOpen(true)}
                  onBack={handleBack}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <CreateGroup
        open={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        onCreated={handleGroupCreated}
      />

      {activeConv?.is_group && (
        <GroupSettings
          open={groupSettingsOpen}
          onClose={() => setGroupSettingsOpen(false)}
          conversation={activeConv}
          onUpdated={() => {
            loadConversations().then(() => {
              // If user left the group, activeConv will be gone — go back to list
              const still = conversations.find((c) => c.id === activeConversationId);
              if (!still) {
                setMobileView("list");
              }
            });
          }}
        />
      )}
    </PageTransition>
  );
}
