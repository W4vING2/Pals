"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useMessages } from "@/hooks/useMessages";
import { useCalls } from "@/hooks/useCalls";
import { useChromeStore, useMessagesStore } from "@/lib/store";
import {
  ConversationList,
  type ChatSuggestion,
} from "@/components/messenger/ConversationList";
import { ChatWindow } from "@/components/messenger/ChatWindow";
import { CreateGroup } from "@/components/messenger/CreateGroup";
import { GroupSettings } from "@/components/messenger/GroupSettings";
import { PageTransition } from "@/components/layout/PageTransition";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/supabase";

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
    getOrCreateConversation,
    deleteConversation,
    setDisappearTimer,
    pinMessage,
    unpinMessage,
    forwardMessage,
    muteConversation,
  } = useMessages();
  const { initiateCall } = useCalls();

  // Read conversation ID from Zustand store (set before navigation) or URL
  const { pendingConversationId, setPendingConversationId } = useMessagesStore();
  const setMobileNavHidden = useChromeStore((state) => state.setMobileNavHidden);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<ChatSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
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
      loadConversations(true).then(() => loadMessages(targetConvId));

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

  const loadChatSuggestions = useCallback(async () => {
    if (!user || loadingConversations) return;

    setLoadingSuggestions(true);
    const supabase = getSupabaseBrowserClient();
    const existingDirectUserIds = new Set(
      conversations
        .filter((conversation) => !conversation.is_group)
        .flatMap((conversation) =>
          conversation.participants
            .filter((participant) => participant.user_id !== user.id)
            .map((participant) => participant.user_id)
        )
    );

    try {
      const [followingResult, followersResult, activityResult] =
        await Promise.all([
          supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", user.id),
          supabase
            .from("follows")
            .select("follower_id")
            .eq("following_id", user.id),
          supabase
            .from("notifications")
            .select("actor_id, type, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(30),
        ]);

      const scores = new Map<string, { score: number; reasons: Set<string> }>();
      const addCandidate = (id: string | null | undefined, score: number, reason: string) => {
        if (!id || id === user.id || existingDirectUserIds.has(id)) return;
        const current = scores.get(id) ?? { score: 0, reasons: new Set<string>() };
        current.score += score;
        current.reasons.add(reason);
        scores.set(id, current);
      };

      const followingIds = new Set(
        followingResult.data?.map((item) => item.following_id) ?? []
      );
      const followerIds = new Set(
        followersResult.data?.map((item) => item.follower_id) ?? []
      );

      followingIds.forEach((id) =>
        addCandidate(id, followerIds.has(id) ? 42 : 24, followerIds.has(id) ? "взаимная подписка" : "вы подписаны")
      );
      followerIds.forEach((id) =>
        addCandidate(id, followingIds.has(id) ? 42 : 22, followingIds.has(id) ? "взаимная подписка" : "подписан(а) на вас")
      );
      activityResult.data?.forEach((item) => {
        const reason =
          item.type === "comment"
            ? "недавно комментировал(а) вас"
            : item.type === "like"
              ? "недавно реагировал(а)"
              : item.type === "mention"
                ? "недавно упоминал(а) вас"
                : "недавняя активность";
        addCandidate(item.actor_id, 12, reason);
      });

      let candidateIds = [...scores.entries()]
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 8)
        .map(([id]) => id);

      if (candidateIds.length < 4) {
        const { data: popularProfiles } = await supabase
          .from("profiles")
          .select("id")
          .neq("id", user.id)
          .order("followers_count", { ascending: false })
          .limit(12);

        for (const profile of popularProfiles ?? []) {
          if (candidateIds.length >= 8) break;
          if (existingDirectUserIds.has(profile.id) || scores.has(profile.id)) continue;
          addCandidate(profile.id, 4, "популярный профиль");
          candidateIds.push(profile.id);
        }
      }

      candidateIds = [...new Set(candidateIds)];
      if (candidateIds.length === 0) {
        setSuggestions([]);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_online")
        .in("id", candidateIds);

      const profilesById = new Map(
        (profiles ?? []).map((profile) => [profile.id, profile])
      );
      const nextSuggestions: ChatSuggestion[] = [];

      for (const id of candidateIds) {
        const profile = profilesById.get(id);
        const candidate = scores.get(id);
        if (!profile || !candidate) continue;
        const [firstReason] = candidate.reasons;
        nextSuggestions.push({
          profile,
          reason: firstReason
            ? `Почему: ${firstReason}`
            : "Почему: есть общие сигналы",
          score: candidate.score,
        });
      }

      nextSuggestions.sort((a, b) => b.score - a.score);

      setSuggestions(nextSuggestions.slice(0, 5));
    } catch (error) {
      console.warn("loadChatSuggestions failed:", error);
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [conversations, loadingConversations, user]);

  useEffect(() => {
    loadChatSuggestions();
  }, [loadChatSuggestions]);

  const handleStartSuggestion = useCallback(
    async (profileId: string) => {
      const conversationId = await getOrCreateConversation(profileId);
      if (!conversationId) return;
      processedRef.current = conversationId;
      await loadConversations(true);
      await loadMessages(conversationId);
      setMobileView("chat");
      setSuggestions((prev) =>
        prev.filter((suggestion) => suggestion.profile.id !== profileId)
      );
    },
    [getOrCreateConversation, loadConversations, loadMessages]
  );

  const handleBack = useCallback(() => {
    processedRef.current = null;
    setMobileView("list");
  }, []);

  const activeConv = conversations.find((c) => c.id === activeConversationId) ?? null;
  const pageHeightClass = "h-dvh";

  useEffect(() => {
    setMobileNavHidden(mobileView === "chat");
    return () => setMobileNavHidden(false);
  }, [mobileView, setMobileNavHidden]);

  const handlePinMessage = async (messageId: string) => {
    if (!activeConversationId) return;
    await pinMessage(activeConversationId, messageId);
  };

  const handleUnpinMessage = async () => {
    if (!activeConversationId) return;
    await unpinMessage(activeConversationId);
  };

  const handleSend = async (content: string, imageUrl?: string, audioUrl?: string, replyToMsg?: Message | null) => {
    if (!activeConversationId) return;
    await sendMessage(activeConversationId, content, imageUrl, audioUrl, replyToMsg);
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
    loadConversations(true).then(() => {
      loadMessages(conversationId);
      setMobileView("chat");
    });
  };

  if (authLoading) {
    return (
      <div className="h-[calc(100dvh-6.25rem-env(safe-area-inset-bottom,0px))] lg:h-dvh flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-[var(--accent-blue)] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <PageTransition className={`${pageHeightClass} lg:h-dvh`}>
      <div className="h-full flex overflow-hidden bg-[#030307] lg:bg-[var(--bg-base)]">
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
              onMuteConversation={muteConversation}
              suggestions={suggestions}
              loadingSuggestions={loadingSuggestions}
              onStartSuggestion={handleStartSuggestion}
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
            onSetDisappearTimer={setDisappearTimer}
            onForwardMessage={forwardMessage}
            onPinMessage={handlePinMessage}
            onUnpinMessage={handleUnpinMessage}
            conversations={conversations}
          />
        </div>

        {/* Mobile: animated slide between list and chat */}
        <div className="lg:hidden w-full h-full relative overflow-hidden bg-[#030307]">
          <AnimatePresence initial={false} mode="popLayout">
            {mobileView === "list" ? (
              <motion.div
                key="conv-list"
                className="absolute inset-0 bg-[#030307]"
                initial={{ x: "-12%", opacity: 0.86, scale: 0.985 }}
                animate={{ x: 0, opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ x: "-18%", opacity: 0.55, scale: 0.965, filter: "blur(2px)" }}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                style={{ willChange: "transform, opacity, filter" }}
              >
                <div className="h-full overflow-hidden">
                  <ConversationList
                    conversations={conversations}
                    activeId={activeConversationId}
                    loading={loadingConversations}
                    onSelect={handleSelectConversation}
                    onCreateGroup={() => setCreateGroupOpen(true)}
                    onMuteConversation={muteConversation}
                    suggestions={suggestions}
                    loadingSuggestions={loadingSuggestions}
                    onStartSuggestion={handleStartSuggestion}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="chat-window"
                className="absolute inset-0 flex flex-col bg-[#030307] shadow-[-28px_0_70px_rgba(0,0,0,0.42)]"
                initial={{ x: "100%", opacity: 1, scale: 0.995 }}
                animate={{ x: 0, opacity: 1, scale: 1 }}
                exit={{ x: "100%", opacity: 1, scale: 0.995 }}
                transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                style={{ willChange: "transform" }}
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
                  onSetDisappearTimer={setDisappearTimer}
                  onForwardMessage={forwardMessage}
                  onPinMessage={handlePinMessage}
                  onUnpinMessage={handleUnpinMessage}
                  conversations={conversations}
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
            loadConversations(true).then(() => {
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
