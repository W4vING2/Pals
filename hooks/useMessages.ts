"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Conversation, Message, ConversationParticipant, ProfileSummary } from "@/lib/supabase";
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
        // Enrich with sender profiles
        const senderIds = [...new Set(msgs.map((m) => m.sender_id))];
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, is_online")
          .in("id", senderIds);
        const profilesMap = new Map((profilesData ?? []).map((p) => [p.id, p]));
        const enriched: Message[] = msgs.map((m) => ({
          ...m,
          profiles: profilesMap.get(m.sender_id) as Message["profiles"],
        }));
        setMessages(enriched);
      }
    } else {
      setMessages([]);
    }
    setLoadingMessages(false);

    // Mark as read
    if (user) {
      await supabase
        .from("conversation_participants")
        .update({ unread_count: 0, last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);
    }
  }, [user]);

  const sendMessage = useCallback(
    async (conversationId: string, content: string, imageUrl?: string) => {
      if (!user) return;
      const supabase = getSupabaseBrowserClient();

      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: content || null,
        image_url: imageUrl ?? null,
      });

      if (error) {
        console.error("Error sending message:", error);
        return;
      }

      // Reload messages to guarantee visibility (real-time may also fire — dedup handles it)
      loadMessages(conversationId, { silent: true });

      // Update conversation last_message
      await supabase
        .from("conversations")
        .update({
          last_message: content || "📷 Image",
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);

      // Increment unread for other participants
      await supabase.rpc("increment_unread_counts", {
        p_conversation_id: conversationId,
        p_sender_id: user.id,
      });
    },
    [user, loadMessages]
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

      // Find existing conversation: get my conversations, then check
      // which ones have the other user as participant.
      // RLS only allows seeing own rows, so we query our own participations
      // and load ALL participants for those conversations.
      const { data: myParticipations } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (myParticipations && myParticipations.length > 0) {
        const myConvIds = myParticipations.map((p) => p.conversation_id);

        // Load all participants in my conversations (RLS allows seeing
        // participants of conversations you belong to)
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

      // Create new conversation with client-generated UUID
      // (avoids RLS issue: after insert, .select() fails because
      // you're not yet a participant of the conversation)
      const convId = crypto.randomUUID();

      const { error: convError } = await supabase
        .from("conversations")
        .insert({ id: convId, last_message: null } as Record<string, unknown>);

      if (convError) {
        console.error("Error creating conversation:", convError);
        return null;
      }

      // Add both participants — now the conversation becomes visible via RLS
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
          // Avoid duplicates (message we just sent)
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          // Load sender profile and enrich
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
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId]);

  // Subscribe to real-time conversation list updates (debounced)
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
          table: "conversations",
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
    uploadMessageImage,
    getOrCreateConversation,
  };
}
