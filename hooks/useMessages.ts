"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Conversation, Message, MessageReaction, ConversationParticipant, ProfileSummary } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";

export type ParticipantWithProfile = ConversationParticipant & { profiles: ProfileSummary };

export type ConversationWithDetails = Conversation & {
  participants: ParticipantWithProfile[];
  unread_count: number;
};

export function useMessages() {
  const { user } = useAuthStore();
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null>(null);
  const reactionsChannelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null>(null);
  const convDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoadingConversations(true);
    const supabase = getSupabaseBrowserClient();

    const { data: rawData, error } = await supabase
      .from("conversation_participants")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading conversations:", error);
      setLoadingConversations(false);
      return;
    }

    const participantsData = (rawData ?? []) as ConversationParticipant[];
    if (participantsData.length === 0) {
      setConversations([]);
      setLoadingConversations(false);
      return;
    }

    const conversationIds = participantsData.map((p) => p.conversation_id);

    // Parallel: load conversations + all participants at once
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

    // Sort by last_message_at desc
    result.sort((a, b) => {
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : new Date(a.created_at).getTime();
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : new Date(b.created_at).getTime();
      return bTime - aTime;
    });

    setConversations(result);
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
        // Enrich with sender profiles + reactions in parallel
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
        const enriched: Message[] = msgs.map((m) => ({
          ...m,
          profiles: profilesMap.get(m.sender_id) as Message["profiles"],
          reactions: reactionsMap.get(m.id) ?? [],
        }));
        setMessages(enriched);
      }
    } else {
      setMessages([]);
    }
    setLoadingMessages(false);

    // Mark as read: update participant unread count AND mark individual messages
    if (user) {
      await Promise.all([
        supabase
          .from("conversation_participants")
          .update({ unread_count: 0, last_read_at: new Date().toISOString() })
          .eq("conversation_id", conversationId)
          .eq("user_id", user.id),
        supabase.rpc("mark_messages_read", { p_conversation_id: conversationId }),
      ]);
    }
  }, [user, loadReactionsForMessages]);

  const sendMessage = useCallback(
    async (conversationId: string, content: string, imageUrl?: string) => {
      if (!user) return;
      const supabase = getSupabaseBrowserClient();

      // Optimistic: add message locally with "sending" status
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: content || null,
        image_url: imageUrl ?? null,
        is_read: false,
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
          content: content || null,
          image_url: imageUrl ?? null,
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
          last_message: content || "\ud83d\udcf7 Image",
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);

      // Increment unread for other participants
      await supabase.rpc("increment_unread_counts", {
        p_conversation_id: conversationId,
        p_sender_id: user.id,
      });
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
        .update({ content: newContent })
        .eq("id", messageId)
        .eq("sender_id", user.id);

      if (error) {
        console.error("Error editing message:", error);
        return;
      }

      // Update local state immediately
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: newContent } : m))
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
          const msg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, { ...msg, reactions: [] }];
          });
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url, bio, cover_url, location, website, date_of_birth, followers_count, following_count, posts_count, is_online, last_seen, created_at, updated_at")
            .eq("id", msg.sender_id)
            .single();
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msg.id ? { ...m, profiles: profile ?? undefined } : m
            )
          );
          // If it's from someone else, mark as read immediately (user is viewing chat)
          if (msg.sender_id !== user?.id && user && activeConversationId) {
            await Promise.all([
              supabase.rpc("mark_messages_read", { p_conversation_id: activeConversationId }),
              supabase
                .from("conversation_participants")
                .update({ unread_count: 0, last_read_at: new Date().toISOString() })
                .eq("conversation_id", activeConversationId)
                .eq("user_id", user.id),
            ]);
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
                ? { ...m, content: updated.content, image_url: updated.image_url, is_read: updated.is_read }
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
      .subscribe();

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
      .subscribe();

    reactionsChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId]);

  // Subscribe to conversation list updates (debounced) — use FILTERED subscription
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();

    const debouncedReload = () => {
      if (convDebounceRef.current) clearTimeout(convDebounceRef.current);
      convDebounceRef.current = setTimeout(() => loadConversations(), 500);
    };

    const channel = supabase
      .channel(`conv-updates:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
          filter: `user_id=eq.${user.id}`,
        },
        debouncedReload
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_participants",
          filter: `user_id=eq.${user.id}`,
        },
        debouncedReload
      )
      .subscribe();

    return () => {
      if (convDebounceRef.current) clearTimeout(convDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, loadConversations]);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user, loadConversations]);

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
  };
}
