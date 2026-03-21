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

  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoadingConversations(true);
    const supabase = getSupabaseBrowserClient();

    // Use the underlying postgres client without deep typing for complex joins
    const { data: rawData, error } = await (supabase as ReturnType<typeof getSupabaseBrowserClient>)
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
      setLoadingConversations(false);
      return;
    }

    const conversationIds = participantsData.map((p) => p.conversation_id);

    // Load conversations
    const { data: convData } = await supabase
      .from("conversations")
      .select("*")
      .in("id", conversationIds);

    // Load all participants with profiles
    const { data: allParticipants } = await supabase
      .from("conversation_participants")
      .select("*")
      .in("conversation_id", conversationIds);

    // Load profiles for participants
    const allParticipantsList = (allParticipants ?? []) as ConversationParticipant[];
    const userIds = [...new Set(allParticipantsList.map((p) => p.user_id))];

    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", userIds);

    const profilesMap = new Map(
      (profilesData ?? []).map((p) => [p.id, p as { id: string; username: string; display_name: string | null; avatar_url: string | null }])
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

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    setActiveConversationId(conversationId);
    const supabase = getSupabaseBrowserClient();

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      // Enrich with sender profiles
      const msgs = data as Message[];
      const senderIds = [...new Set(msgs.map((m) => m.sender_id))];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", senderIds);
      const profilesMap = new Map((profilesData ?? []).map((p) => [p.id, p]));
      const enriched: Message[] = msgs.map((m) => ({
        ...m,
        profiles: profilesMap.get(m.sender_id) as Message["profiles"],
      }));
      setMessages(enriched);
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

      // Check for existing conversation
      const { data: existing } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      if (existing && existing.length > 0) {
        const myConvIds = existing.map((e) => e.conversation_id);
        const { data: shared } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", otherUserId)
          .in("conversation_id", myConvIds);

        if (shared && shared.length > 0) {
          return shared[0].conversation_id;
        }
      }

      // Create new conversation
      const { data: conv, error } = await supabase
        .from("conversations")
        .insert({ last_message: null })
        .select()
        .single();

      if (error || !conv) return null;

      const convTyped = conv as Conversation;
      await supabase.from("conversation_participants").insert([
        { conversation_id: convTyped.id, user_id: user.id, unread_count: 0 },
        { conversation_id: convTyped.id, user_id: otherUserId, unread_count: 0 },
      ]);

      return convTyped.id;
    },
    [user]
  );

  // Subscribe to real-time messages
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
          // Load sender profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url, bio, cover_url, location, website, date_of_birth, followers_count, following_count, posts_count, is_online, last_seen, created_at, updated_at")
            .eq("id", msg.sender_id)
            .single();
          setMessages((prev) => [...prev, { ...msg, profiles: profile ?? undefined }]);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId]);

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
