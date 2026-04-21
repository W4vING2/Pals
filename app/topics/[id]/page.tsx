"use client";

import { use, useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Hash, Users, Clock, Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/Avatar";
import { PageTransition } from "@/components/layout/PageTransition";

interface TopicSenderProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface TopicMessage {
  id: string;
  topic_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles?: TopicSenderProfile;
}

interface Topic {
  id: string;
  title: string;
  description: string | null;
  created_by: string;
  created_at: string;
  expires_at: string;
  participant_count: number;
  message_count: number;
  tags: string[];
}

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Закрыт";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

export default function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuthStore();

  const [topic, setTopic] = useState<Topic | null>(null);
  const [messages, setMessages] = useState<TopicMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null>(null);
  const topicChannelRef = useRef<ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load topic and messages
  useEffect(() => {
    if (!user) return;

    const load = async () => {
      const supabase = getSupabaseBrowserClient();

      const { data: topicData } = await (supabase as any)
        .from("topics")
        .select("*")
        .eq("id", id)
        .single();

      if (!topicData || new Date(topicData.expires_at) <= new Date()) {
        setExpired(true);
        setLoading(false);
        return;
      }

      setTopic(topicData as Topic);
      setParticipantCount(topicData.participant_count);
      setTimeRemaining(timeLeft(topicData.expires_at));

      // Load last 100 messages with sender profiles
      const { data: msgsData } = await (supabase as any)
        .from("topic_messages")
        .select("*")
        .eq("topic_id", id)
        .order("created_at", { ascending: true })
        .limit(100);

      if (msgsData && msgsData.length > 0) {
        const senderIds = [...new Set(msgsData.map((m: TopicMessage) => m.sender_id))] as string[];
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", senderIds);

        const profilesMap = new Map((profilesData ?? []).map((p: TopicSenderProfile) => [p.id, p]));
        const enriched = msgsData.map((m: TopicMessage) => ({
          ...m,
          profiles: profilesMap.get(m.sender_id),
        }));
        setMessages(enriched as TopicMessage[]);
      }

      setLoading(false);
    };

    load();
  }, [id, user]);

  // Increment participant count on mount
  useEffect(() => {
    if (!topic || !user) return;
    const supabase = getSupabaseBrowserClient();
    ;(supabase as any)
      .from("topics")
      .update({ participant_count: topic.participant_count + 1 })
      .eq("id", id)
      .then(() => {
        setParticipantCount((prev) => prev + 1);
      });
    // We don't decrement on unmount because tracking real-time presence
    // is outside the scope of this simple counter
  }, [topic?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime subscription for messages
  useEffect(() => {
    if (!topic || expired) return;
    const supabase = getSupabaseBrowserClient();

    const channel = supabase
      .channel(`topic-messages:${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "topic_messages",
          filter: `topic_id=eq.${id}`,
        },
        async (payload) => {
          const newMsg = payload.new as TopicMessage;
          // Fetch sender profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .eq("id", newMsg.sender_id)
            .single();

          setMessages((prev) => {
            // Avoid duplicate if we already optimistically added this message
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, { ...newMsg, profiles: profile ?? undefined }];
          });
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [topic, expired, id]);

  // Realtime subscription for topic updates (participant count)
  useEffect(() => {
    if (!topic || expired) return;
    const supabase = getSupabaseBrowserClient();

    const channel = supabase
      .channel(`topic-meta:${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "topics",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const updated = payload.new as Topic;
          setParticipantCount(updated.participant_count);
        }
      )
      .subscribe();

    topicChannelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [topic, expired, id]);

  // Countdown timer updates every minute
  useEffect(() => {
    if (!topic) return;
    const interval = setInterval(() => {
      const remaining = timeLeft(topic.expires_at);
      setTimeRemaining(remaining);
      if (remaining === "Закрыт") {
        setExpired(true);
        clearInterval(interval);
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [topic]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async () => {
    if (!input.trim() || !user || !topic || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);

    const supabase = getSupabaseBrowserClient();

    // Optimistic insert
    const optimisticMsg: TopicMessage = {
      id: `optimistic-${Date.now()}`,
      topic_id: id,
      sender_id: user.id,
      content,
      created_at: new Date().toISOString(),
      profiles: {
        id: user.id,
        username: user.email?.split("@")[0] ?? "me",
        display_name: null,
        avatar_url: null,
      },
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    const { error } = await ( supabase as any).from("topic_messages").insert({
      topic_id: id,
      sender_id: user.id,
      content,
    });

    if (error) {
      // Rollback optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setInput(content);
    }

    setSending(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="h-[calc(100dvh-5rem)] lg:h-dvh flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-blue)]" />
      </div>
    );
  }

  if (expired || !topic) {
    return (
      <PageTransition>
        <div className="h-[calc(100dvh-5rem)] lg:h-dvh flex flex-col items-center justify-center gap-4 px-4 text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-surface)] flex items-center justify-center">
            <Hash className="w-8 h-8 text-[var(--text-secondary)] opacity-40" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Топик закрыт</h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-xs">
            Этот топик истёк и больше недоступен.
          </p>
          <button
            onClick={() => router.back()}
            className="mt-2 text-sm font-medium text-[var(--accent-blue)] hover:opacity-70 transition-opacity"
          >
            ← Назад
          </button>
        </div>
      </PageTransition>
    );
  }

  return (
    <div className="h-[calc(100dvh-5rem)] lg:h-dvh flex flex-col bg-[var(--bg-base)]">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-xl hover:bg-[var(--bg-elevated)] transition-colors text-[var(--text-primary)]"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Hash className="w-5 h-5 text-[var(--accent-blue)] flex-shrink-0" />
            <h1 className="font-bold text-[var(--text-primary)] truncate">{topic.title}</h1>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              <Users className="w-3.5 h-3.5" />
              <span>{participantCount}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              <Clock className="w-3.5 h-3.5" />
              <span>{timeRemaining}</span>
            </div>
          </div>
        </div>

        {/* Description banner */}
        {topic.description && (
          <div className="px-4 pb-3">
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
              {topic.description}
            </p>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Hash className="w-10 h-10 text-[var(--text-secondary)] opacity-20" />
            <p className="text-sm text-[var(--text-secondary)]">Будьте первым — начните общение!</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isOwn = msg.sender_id === user?.id;
            const profile = msg.profiles;
            const displayName = profile?.display_name ?? profile?.username ?? "Пользователь";
            const initials = displayName[0]?.toUpperCase() ?? "?";

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Avatar for others */}
                {!isOwn && (
                  <div className="flex-shrink-0 mb-0.5">
                    <Avatar size="sm">
                      {profile?.avatar_url ? (
                        <AvatarImage src={profile.avatar_url} alt={displayName} />
                      ) : null}
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                  </div>
                )}

                <div className={`flex flex-col gap-0.5 max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}>
                  {/* Username for others */}
                  {!isOwn && (
                    <span className="text-xs text-[var(--text-secondary)] px-1">
                      {displayName}
                    </span>
                  )}
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                      isOwn
                        ? "bg-[var(--accent-blue)] text-white rounded-br-sm"
                        : "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border)] rounded-bl-sm"
                    } ${msg.id.startsWith("optimistic-") ? "opacity-70" : ""}`}
                  >
                    {msg.content}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 border-t border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Написать сообщение..."
            className="flex-1 resize-none bg-[var(--bg-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] rounded-2xl px-4 py-2.5 text-sm outline-none border border-[var(--border)] focus:border-[var(--accent-blue)] transition-colors max-h-32 overflow-y-auto"
            style={{ lineHeight: "1.5" }}
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 w-10 h-10 rounded-2xl bg-[var(--accent-blue)] text-white flex items-center justify-center hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
