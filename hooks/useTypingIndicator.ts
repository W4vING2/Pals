"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";

interface TypingUser {
  userId: string;
  displayName: string;
}

export function useTypingIndicator(conversationId: string | null) {
  const { user, profile } = useAuthStore();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const channelRef = useRef<any>(null);
  const lastBroadcastRef = useRef(0);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    if (!conversationId || !user) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase.channel(`typing:${conversationId}`);

    channel.on("broadcast", { event: "typing" }, (payload: any) => {
      const { userId, displayName } = payload.payload;
      if (userId === user.id) return;

      const existing = timersRef.current.get(userId);
      if (existing) clearTimeout(existing);

      setTypingUsers((prev) => {
        const filtered = prev.filter((u) => u.userId !== userId);
        return [...filtered, { userId, displayName }];
      });

      const timer = setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
        timersRef.current.delete(userId);
      }, 3000);
      timersRef.current.set(userId, timer);
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
      setTypingUsers([]);
    };
  }, [conversationId, user]);

  const broadcastTyping = useCallback(() => {
    if (!channelRef.current || !user) return;
    const now = Date.now();
    if (now - lastBroadcastRef.current < 500) return;
    lastBroadcastRef.current = now;

    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        userId: user.id,
        displayName: profile?.display_name ?? profile?.username ?? "Пользователь",
      },
    });
  }, [user, profile]);

  return { typingUsers, broadcastTyping };
}
