"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Conversation, Message, MessageReaction, ConversationParticipant, ProfileSummary, Profile } from "@/lib/supabase";
import { useAuthStore, useUnreadMessagesStore } from "@/lib/store";
import { sendPushNotification } from "@/lib/sendPushNotification";
import {
  getOrCreateKeyPair,
  getConversationKey,
  encryptMessage,
  decryptMessage,
  isEncrypted,
} from "@/lib/crypto";

export type ParticipantWithProfile = ConversationParticipant & { profiles: ProfileSummary };

export type ConversationWithDetails = Conversation & {
  participants: ParticipantWithProfile[];
  unread_count: number;
};

export function useMessages() {
  const { user, profile: storeProfile } = useAuthStore();
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null>(null);
  const reactionsChannelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null>(null);
  const convDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const activeConvIdRef = useRef(activeConversationId);
  activeConvIdRef.current = activeConversationId;
  const hasLoadedConvsRef = useRef(false);

  // ── E2E encryption setup ─────────────────────────────────
  const encKeyRef = useRef<CryptoKey | null>(null);
  const keysInitRef = useRef(false);

  // Initialize user's ECDH keys on first load
  useEffect(() => {
    if (!user || keysInitRef.current) return;
    keysInitRef.current = true;
    (async () => {
      try {
        const { publicKeyJwk, isNew } = await getOrCreateKeyPair(user.id);
        if (isNew) {
          // Upload public key to profiles
          const supabase = getSupabaseBrowserClient();
          await supabase.from("profiles").update({ public_key: publicKeyJwk }).eq("id", user.id);
        }
      } catch (err) {
        console.warn("E2E key init failed:", err);
      }
    })();
  }, [user]);

  // Get encryption key for a conversation (DM only for now)
  const getEncKey = useCallback(async (conversationId: string): Promise<CryptoKey | null> => {
    if (!user) return null;
    try {
      // Find the conversation to get the other participant's public key
      const conv = conversations.find((c) => c.id === conversationId);
      if (!conv || conv.is_group) return null; // Groups not encrypted for now

      const otherParticipant = conv.participants?.find((p) => p.user_id !== user.id);
      if (!otherParticipant) return null;

      // Get other user's public key
      const supabase = getSupabaseBrowserClient();
      const { data: otherProfile } = await supabase
        .from("profiles")
        .select("public_key")
        .eq("id", otherParticipant.user_id)
        .single();

      if (!otherProfile?.public_key) return null;

      return await getConversationKey(user.id, otherProfile.public_key, conversationId);
    } catch {
      return null;
    }
  }, [user, conversations]);

  // Decrypt a batch of messages
  const decryptMessages = useCallback(async (msgs: Message[], conversationId: string): Promise<Message[]> => {
    // Check if any messages are encrypted
    const hasEncrypted = msgs.some((m) => isEncrypted(m.content));
    if (!hasEncrypted) return msgs;

    const key = await getEncKey(conversationId);
    if (!key) return msgs; // Can't decrypt, return as-is

    return Promise.all(
      msgs.map(async (m) => {
        if (!isEncrypted(m.content)) return m;
        const decrypted = await decryptMessage(m.content!, key);
        return { ...m, content: decrypted ?? "🔒 Не удалось расшифровать" };
      })
    );
  }, [getEncKey]);

  const refreshBadgeCount = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("conversation_participants")
      .select("unread_count")
      .eq("user_id", user.id);
    if (data) {
      const total = data.reduce((sum, row) => sum + (row.unread_count ?? 0), 0);
      useUnreadMessagesStore.getState().setUnreadMessagesCount(total);
    }
  }, [user]);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    // Only show loading spinner on first load, not background refreshes
    const isFirstLoad = !hasLoadedConvsRef.current;
    if (isFirstLoad) setLoadingConversations(true);
    const supabase = getSupabaseBrowserClient();

    try {
      const { data: rawData, error } = await supabase
        .from("conversation_participants")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && rawData) {
        const participantsData = rawData as ConversationParticipant[];
        if (participantsData.length === 0) {
          setConversations([]);
        } else {
          const conversationIds = participantsData.map((p) => p.conversation_id);

          const [convResult, allPartResult] = await Promise.all([
            supabase.from("conversations").select("*").in("id", conversationIds),
            supabase.from("conversation_participants").select("*").in("conversation_id", conversationIds),
          ]);

          const convData = convResult.data;
          const allParticipantsList = (allPartResult.data ?? []) as ConversationParticipant[];
          const userIds = [...new Set(allParticipantsList.map((p) => p.user_id))];

          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url, is_online")
            .in("id", userIds);

          const profilesMap = new Map(
            (profilesData ?? []).map((p) => [p.id, p as { id: string; username: string; display_name: string | null; avatar_url: string | null; is_online: boolean }])
          );

          const myParticipationMap = new Map(
            participantsData.map((p) => [p.conversation_id, p])
          );

          const result: ConversationWithDetails[] = (convData ?? []).map((conv) => {
            const participants = allParticipantsList
              .filter((p) => p.conversation_id === conv.id)
              .map((p) => ({
                ...p,
                profiles: profilesMap.get(p.user_id) ?? { id: p.user_id, username: "unknown", display_name: null, avatar_url: null },
              }));
            const myParticipation = myParticipationMap.get(conv.id);
            return {
              ...(conv as Conversation),
              participants,
              unread_count: myParticipation?.unread_count ?? 0,
            };
          });

          result.sort((a, b) => {
            const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : new Date(a.created_at).getTime();
            const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : new Date(b.created_at).getTime();
            return bTime - aTime;
          });

          setConversations(result);
        }
      }
    } catch (err) {
      console.warn("loadConversations failed:", err);
    }
    // ALWAYS cleanup — never leave skeleton stuck
    hasLoadedConvsRef.current = true;
    setLoadingConversations(false);
  }, [user]);

  // Helper: load reactions for a set of message IDs
  const loadReactionsForMessages = useCallback(async (messageIds: string[]): Promise<Map<string, MessageReaction[]>> => {
    if (messageIds.length === 0) return new Map();
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("message_reactions")
      .select("*")
      .in("message_id", messageIds);

    const map = new Map<string, MessageReaction[]>();
    for (const r of (data ?? []) as MessageReaction[]) {
      if (!map.has(r.message_id)) map.set(r.message_id, []);
      map.get(r.message_id)!.push(r);
    }
    return map;
  }, []);

  const loadMessages = useCallback(async (conversationId: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setLoadingMessages(true);
    setActiveConversationId(conversationId);
    const supabase = getSupabaseBrowserClient();

    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        const msgs = data as Message[];
        if (msgs.length === 0) {
          setMessages([]);
        } else {
          const senderIds = [...new Set(msgs.map((m) => m.sender_id))];
          const msgIds = msgs.map((m) => m.id);

          const [profilesResult, reactionsMap] = await Promise.all([
            supabase
              .from("profiles")
              .select("id, username, display_name, avatar_url, is_online")
              .in("id", senderIds),
            loadReactionsForMessages(msgIds),
          ]);

          const profilesMap = new Map((profilesResult.data ?? []).map((p) => [p.id, p]));
          let enriched: Message[] = msgs.map((m) => ({
            ...m,
            profiles: profilesMap.get(m.sender_id) as Message["profiles"],
            reactions: reactionsMap.get(m.id) ?? [],
          }));

          // Decrypt E2E encrypted messages
          enriched = await decryptMessages(enriched, conversationId);

          setMessages(enriched);
        }
      }
    } catch (err) {
      console.warn("loadMessages failed:", err);
    }
    setLoadingMessages(false);

    // Mark as read (fire-and-forget, don't block UI)
    if (user) {
      Promise.all([
        supabase
          .from("conversation_participants")
          .update({ unread_count: 0, last_read_at: new Date().toISOString() })
          .eq("conversation_id", conversationId)
          .eq("user_id", user.id),
        supabase.rpc("mark_messages_read", { p_conversation_id: conversationId }),
      ]).then(() => refreshBadgeCount()).catch(() => { /* ignore */ });
    }
  }, [user, loadReactionsForMessages, refreshBadgeCount]);

  const sendMessage = useCallback(
    async (conversationId: string, content: string, imageUrl?: string, audioUrl?: string) => {
      if (!user) return;
      const supabase = getSupabaseBrowserClient();

      // Encrypt text content if possible (DMs only)
      let encryptedContent = content;
      const encKey = await getEncKey(conversationId);
      if (encKey && content) {
        try {
          encryptedContent = await encryptMessage(content, encKey);
        } catch {
          // Fallback to unencrypted
          encryptedContent = content;
        }
      }

      // Optimistic: add message locally with "sending" status (show original text)
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: content || null,
        image_url: imageUrl ?? null,
        audio_url: audioUrl ?? null,
        message_type: audioUrl ? "voice" : "text",
        is_read: false,
        is_edited: false,
        created_at: new Date().toISOString(),
        reactions: [],
        _status: "sending",
      };

      setMessages((prev) => [...prev, optimisticMsg]);

      const { data: inserted, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: encryptedContent || null,
          image_url: imageUrl ?? null,
          ...(audioUrl ? { audio_url: audioUrl, message_type: "voice" as const } : {}),
        })
        .select()
        .single();

      if (error || !inserted) {
        console.error("Error sending message:", error);
        // Mark as failed
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, _status: "failed" as const } : m))
        );
        return;
      }

      // Replace temp message with real one (status = "sent")
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, ...(inserted as Message), id: (inserted as Message).id, _status: "sent" as const, reactions: [] }
            : m
        )
      );

      // Update conversation last_message
      await supabase
        .from("conversations")
        .update({
          last_message: audioUrl ? "\uD83C\uDFA4 Голосовое сообщение" : content || "\ud83d\udcf7 Image",
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);

      // Increment unread for other participants
      await supabase.rpc("increment_unread_counts", {
        p_conversation_id: conversationId,
        p_sender_id: user.id,
      });

      // Send push notifications to other participants
      const { data: participants } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", user.id);
      if (participants) {
        const senderName = storeProfile?.display_name ?? storeProfile?.username ?? "Pals";
        const pushBody = audioUrl
          ? "🎤 Голосовое сообщение"
          : content || "📷 Фото";
        for (const p of participants) {
          sendPushNotification({
            userId: p.user_id,
            title: senderName,
            message: pushBody,
            url: "/messages",
            tag: `msg-${conversationId}`,
          });
        }
      }
    },
    [user]
  );

  const retryMessage = useCallback(
    async (tempId: string) => {
      const msg = messages.find((m) => m.id === tempId && m._status === "failed");
      if (!msg || !user) return;
      const supabase = getSupabaseBrowserClient();

      // Mark as sending again
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, _status: "sending" as const } : m))
      );

      const { data: inserted, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: msg.conversation_id,
          sender_id: user.id,
          content: msg.content || null,
          image_url: msg.image_url ?? null,
        })
        .select()
        .single();

      if (error || !inserted) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, _status: "failed" as const } : m))
        );
        return;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, ...(inserted as Message), id: (inserted as Message).id, _status: "sent" as const, reactions: [] }
            : m
        )
      );

      await supabase
        .from("conversations")
        .update({
          last_message: msg.content || "\ud83d\udcf7 Image",
          last_message_at: new Date().toISOString(),
        })
        .eq("id", msg.conversation_id);

      await supabase.rpc("increment_unread_counts", {
        p_conversation_id: msg.conversation_id,
        p_sender_id: user.id,
      });
    },
    [user, messages]
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!user) return;
      const supabase = getSupabaseBrowserClient();

      const { error } = await supabase
        .from("messages")
        .update({ content: newContent, is_edited: true })
        .eq("id", messageId)
        .eq("sender_id", user.id);

      if (error) {
        console.error("Error editing message:", error);
        return;
      }

      // Update local state immediately
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: newContent, is_edited: true } : m))
      );
    },
    [user]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!user) return;
      const supabase = getSupabaseBrowserClient();

      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("id", messageId)
        .eq("sender_id", user.id);

      if (error) {
        console.error("Error deleting message:", error);
        return;
      }

      // Remove from local state
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    },
    [user]
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user) return;
      const supabase = getSupabaseBrowserClient();

      // Check if already reacted
      const { data: existing } = await supabase
        .from("message_reactions")
        .select("id")
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("emoji", emoji)
        .maybeSingle();

      if (existing) {
        // Remove reaction
        await supabase.from("message_reactions").delete().eq("id", existing.id);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  reactions: (m.reactions ?? []).filter(
                    (r) => !(r.user_id === user.id && r.emoji === emoji)
                  ),
                }
              : m
          )
        );
      } else {
        // Add reaction
        const { data: inserted } = await supabase
          .from("message_reactions")
          .insert({ message_id: messageId, user_id: user.id, emoji })
          .select()
          .single();

        if (inserted) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, reactions: [...(m.reactions ?? []), inserted as MessageReaction] }
                : m
            )
          );
        }
      }
    },
    [user]
  );

  const uploadMessageImage = useCallback(async (file: File): Promise<string | null> => {
    if (!user) return null;
    const supabase = getSupabaseBrowserClient();
    const ext = file.name.split(".").pop();
    const path = `messages/${user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from("media")
      .upload(path, file, { upsert: false });

    if (error) {
      console.error("Upload error:", error);
      return null;
    }

    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return data.publicUrl;
  }, [user]);

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!user) return;
      const supabase = getSupabaseBrowserClient();

      const { error } = await supabase
        .from("conversation_participants")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);

      if (error) {
        console.error("Error leaving conversation:", error);
        return;
      }

      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
    },
    [user, activeConversationId]
  );

  const getOrCreateConversation = useCallback(
    async (otherUserId: string): Promise<string | null> => {
      if (!user) return null;
      const supabase = getSupabaseBrowserClient();

      const { data: myParticipations } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (myParticipations && myParticipations.length > 0) {
        const myConvIds = myParticipations.map((p) => p.conversation_id);

        const { data: allParticipants } = await supabase
          .from("conversation_participants")
          .select("conversation_id, user_id")
          .in("conversation_id", myConvIds);

        if (allParticipants) {
          const sharedConv = allParticipants.find(
            (p) => p.user_id === otherUserId
          );
          if (sharedConv) {
            return sharedConv.conversation_id;
          }
        }
      }

      const convId = crypto.randomUUID();

      const { error: convError } = await supabase
        .from("conversations")
        .insert({ id: convId, last_message: null } as Record<string, unknown>);

      if (convError) {
        console.error("Error creating conversation:", convError);
        return null;
      }

      const { error: partError } = await supabase
        .from("conversation_participants")
        .insert([
          { conversation_id: convId, user_id: user.id, unread_count: 0 },
          { conversation_id: convId, user_id: otherUserId, unread_count: 0 },
        ]);

      if (partError) {
        console.error("Error adding participants:", partError);
        return null;
      }

      return convId;
    },
    [user]
  );

  // Subscribe to real-time messages for active conversation
  useEffect(() => {
    if (!activeConversationId) return;
    const supabase = getSupabaseBrowserClient();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`messages:${activeConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        async (payload) => {
          let msg = payload.new as Message;
          // Decrypt if encrypted
          if (isEncrypted(msg.content)) {
            const key = await getEncKey(activeConversationId);
            if (key && msg.content) {
              const decrypted = await decryptMessage(msg.content, key);
              msg = { ...msg, content: decrypted ?? "🔒 Не удалось расшифровать" };
            }
          }
          setMessages((prev) => {
            // Skip if already exists (by real id)
            if (prev.some((m) => m.id === msg.id)) return prev;
            // If this is our own message, replace the temp/optimistic one
            const currentUser = userRef.current;
            if (msg.sender_id === currentUser?.id) {
              const hasTempVersion = prev.some((m) => m.id.startsWith("temp-") && m.sender_id === currentUser.id && Math.abs(new Date(m.created_at).getTime() - new Date(msg.created_at).getTime()) < 5000);
              if (hasTempVersion) {
                return prev.map((m) =>
                  m.id.startsWith("temp-") && m.sender_id === currentUser.id && Math.abs(new Date(m.created_at).getTime() - new Date(msg.created_at).getTime()) < 5000
                    ? { ...msg, reactions: [], _status: "sent" as const }
                    : m
                );
              }
            }
            return [...prev, { ...msg, reactions: [] }];
          });
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url, bio, cover_url, location, website, date_of_birth, followers_count, following_count, posts_count, is_online, last_seen, public_key, created_at, updated_at")
            .eq("id", msg.sender_id)
            .single();
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msg.id ? { ...m, profiles: (profile as Profile) ?? undefined } : m
            )
          );
          // If it's from someone else, mark as read immediately (user is viewing chat)
          const currentUser = userRef.current;
          const currentConvId = activeConvIdRef.current;
          if (msg.sender_id !== currentUser?.id && currentUser && currentConvId) {
            await Promise.all([
              supabase.rpc("mark_messages_read", { p_conversation_id: currentConvId }),
              supabase
                .from("conversation_participants")
                .update({ unread_count: 0, last_read_at: new Date().toISOString() })
                .eq("conversation_id", currentConvId)
                .eq("user_id", currentUser.id),
            ]);
            refreshBadgeCount();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? { ...m, content: updated.content, image_url: updated.image_url, audio_url: updated.audio_url, message_type: updated.message_type, is_read: updated.is_read, is_edited: updated.is_edited }
                : m
            )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        (payload) => {
          const deleted = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== deleted.id));
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("Messages channel error — will auto-reconnect");
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId]);

  // Subscribe to real-time reactions for active conversation messages
  useEffect(() => {
    if (!activeConversationId) return;
    const supabase = getSupabaseBrowserClient();

    if (reactionsChannelRef.current) {
      supabase.removeChannel(reactionsChannelRef.current);
    }

    const channel = supabase
      .channel(`reactions:${activeConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          const reaction = payload.new as MessageReaction;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== reaction.message_id) return m;
              // Avoid duplicates
              if ((m.reactions ?? []).some((r) => r.id === reaction.id)) return m;
              return { ...m, reactions: [...(m.reactions ?? []), reaction] };
            })
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          const deleted = payload.old as { id: string; message_id: string };
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== deleted.message_id) return m;
              return { ...m, reactions: (m.reactions ?? []).filter((r) => r.id !== deleted.id) };
            })
          );
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("Reactions channel error");
        }
      });

    reactionsChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId]);

  // Subscribe to conversation list updates (debounced) — use FILTERED subscription
  // Uses userIdRef to avoid re-creating channel on token refresh
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  useEffect(() => {
    const uid = userIdRef.current;
    if (!uid) return;
    const supabase = getSupabaseBrowserClient();

    const debouncedReload = () => {
      if (convDebounceRef.current) clearTimeout(convDebounceRef.current);
      convDebounceRef.current = setTimeout(() => loadConversations(), 500);
    };

    const channel = supabase
      .channel(`conv-updates:${uid}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
          filter: `user_id=eq.${uid}`,
        },
        debouncedReload
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_participants",
          filter: `user_id=eq.${uid}`,
        },
        debouncedReload
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("Conversation updates channel error");
        }
      });

    return () => {
      if (convDebounceRef.current) clearTimeout(convDebounceRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadConversations]);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user, loadConversations]);

  // Recover from phone sleep / tab becoming visible again
  useEffect(() => {
    if (!user) return;

    let wakeTimeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      // Wait for network to be back (phones take a moment after waking)
      const tryRefresh = async () => {
        // If offline, wait up to 5s for online event
        if (!navigator.onLine) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 5000);
            const onOnline = () => {
              clearTimeout(timer);
              window.removeEventListener("online", onOnline);
              // Give connection a moment to stabilize
              setTimeout(resolve, 500);
            };
            window.addEventListener("online", onOnline);
          });
        } else {
          // Online but let Supabase reconnect websockets
          await new Promise((r) => setTimeout(r, 800));
        }

        if (cancelled) return;

        loadConversations();
        const convId = activeConvIdRef.current;
        if (convId) {
          loadMessages(convId, { silent: true });
        }
      };

      // Clear any pending wake
      if (wakeTimeout) clearTimeout(wakeTimeout);
      tryRefresh();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeTimeout) clearTimeout(wakeTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return {
    conversations,
    messages,
    activeConversationId,
    loadingConversations,
    loadingMessages,
    loadConversations,
    loadMessages,
    sendMessage,
    retryMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    uploadMessageImage,
    getOrCreateConversation,
    deleteConversation,
  };
}
