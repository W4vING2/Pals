"use client";

import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneCall } from "lucide-react";
import { PageTransition } from "@/components/layout/PageTransition";
import { useAuth } from "@/hooks/useAuth";
import { useCalls } from "@/hooks/useCalls";
import { useMessages } from "@/hooks/useMessages";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Profile } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────

type CallLog = {
  id: string;
  caller_id: string;
  callee_id: string;
  call_type: "voice" | "video";
  status: "completed" | "missed" | "declined" | "failed";
  duration_seconds: number;
  started_at: string;
  ended_at: string | null;
  caller_profile: Profile | null;
  callee_profile: Profile | null;
};

type GroupedCallLogs = {
  label: string;
  items: CallLog[];
};

// ── Helpers ──────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const callDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (callDate.getTime() === startOfToday.getTime()) return "Сегодня";
  if (callDate.getTime() === startOfYesterday.getTime()) return "Вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function groupByDate(logs: CallLog[]): GroupedCallLogs[] {
  const groups: Map<string, CallLog[]> = new Map();
  for (const log of logs) {
    const label = getDateLabel(log.started_at);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(log);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

// ── Skeleton ──────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-11 h-11 rounded-full bg-white/10 animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-32 rounded-full bg-white/10 animate-pulse" />
        <div className="h-3 w-20 rounded-full bg-white/10 animate-pulse" />
      </div>
      <div className="h-3 w-12 rounded-full bg-white/10 animate-pulse" />
    </div>
  );
}

// ── Call Row ─────────────────────────────────────────────────────

function CallRow({
  log,
  currentUserId,
  onCallBack,
}: {
  log: CallLog;
  currentUserId: string;
  onCallBack: (log: CallLog) => void;
}) {
  const isOutgoing = log.caller_id === currentUserId;
  const otherProfile = isOutgoing ? log.callee_profile : log.caller_profile;
  const isMissed = !isOutgoing && log.status === "missed";

  const StatusIcon =
    isMissed ? PhoneMissed
    : isOutgoing ? PhoneOutgoing
    : PhoneIncoming;

  const statusColor =
    isMissed ? "text-red-400"
    : isOutgoing ? "text-violet-400"
    : "text-emerald-400";

  const displayName =
    otherProfile?.display_name || otherProfile?.username || "Неизвестный";

  const avatarSrc = otherProfile?.avatar_url;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors"
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={displayName}
            className="w-11 h-11 rounded-full object-cover"
          />
        ) : (
          <div className="w-11 h-11 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-300 font-semibold text-base">
            {displayName[0]?.toUpperCase() ?? "?"}
          </div>
        )}
      </div>

      {/* Name + status */}
      <div className="flex-1 min-w-0">
        <div
          className={`font-medium text-sm truncate ${isMissed ? "text-red-400" : "text-white"}`}
        >
          {displayName}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${statusColor}`} />
          <span className="text-xs text-white/40">
            {log.call_type === "video" ? "Видео" : "Голос"}
            {log.status === "completed" && log.duration_seconds > 0
              ? ` · ${formatDuration(log.duration_seconds)}`
              : log.status === "declined"
                ? " · Отклонён"
                : log.status === "missed"
                  ? " · Пропущен"
                  : log.status === "failed"
                    ? " · Ошибка"
                    : ""}
          </span>
        </div>
      </div>

      {/* Time */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        <span className="text-xs text-white/35">{formatTime(log.started_at)}</span>
        {/* Call-back button */}
        <button
          onClick={() => onCallBack(log)}
          className="p-1.5 rounded-full bg-violet-500/15 hover:bg-violet-500/30 transition-colors"
          aria-label="Перезвонить"
        >
          {log.call_type === "video" ? (
            <Video className="w-3.5 h-3.5 text-violet-400" />
          ) : (
            <Phone className="w-3.5 h-3.5 text-violet-400" />
          )}
        </button>
      </div>
    </motion.div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function CallsPage() {
  const { user, loading: authLoading } = useAuth();
  const { initiateCall } = useCalls();
  const { getOrCreateConversation } = useMessages();

  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: fetchError } = await (supabase as any)
        .from("call_logs")
        .select(
          `
          id,
          caller_id,
          callee_id,
          call_type,
          status,
          duration_seconds,
          started_at,
          ended_at,
          caller_profile:profiles!call_logs_caller_id_fkey(*),
          callee_profile:profiles!call_logs_callee_id_fkey(*)
          `
        )
        .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
        .order("started_at", { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;

      setLogs((data ?? []) as unknown as CallLog[]);
    } catch (err) {
      console.error("Failed to fetch call logs:", err);
      setError("Не удалось загрузить историю звонков");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchLogs();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, authLoading, fetchLogs]);

  const handleCallBack = useCallback(
    async (log: CallLog) => {
      if (!user) return;
      const remoteUserId = log.caller_id === user.id ? log.callee_id : log.caller_id;
      const conversationId = await getOrCreateConversation(remoteUserId);
      if (!conversationId) return;
      await initiateCall(conversationId, remoteUserId, log.call_type);
    },
    [user, getOrCreateConversation, initiateCall]
  );

  const grouped = groupByDate(logs);

  return (
    <PageTransition>
      <div className="min-h-screen bg-black text-white">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-black/80 backdrop-blur-xl border-b border-white/[0.06] px-4 py-3 flex items-center gap-3">
          <PhoneCall className="w-5 h-5 text-violet-400" />
          <h1 className="text-lg font-semibold tracking-tight">Звонки</h1>
        </div>

        {/* Content */}
        <div className="pb-28">
          {/* Loading */}
          {(loading || authLoading) && (
            <div className="divide-y divide-white/[0.05]">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          )}

          {/* Error */}
          {!loading && !authLoading && error && (
            <div className="flex flex-col items-center justify-center py-24 text-center px-6">
              <Phone className="w-12 h-12 text-white/20 mb-4" />
              <p className="text-white/50 text-sm">{error}</p>
              <button
                onClick={fetchLogs}
                className="mt-4 px-4 py-2 rounded-full bg-violet-500/20 text-violet-300 text-sm hover:bg-violet-500/30 transition-colors"
              >
                Повторить
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !authLoading && !error && logs.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex flex-col items-center justify-center py-24 text-center px-6"
            >
              <div className="w-20 h-20 rounded-full bg-white/[0.06] flex items-center justify-center mb-5">
                <Phone className="w-9 h-9 text-white/25" />
              </div>
              <p className="text-white/60 font-medium">Нет звонков</p>
              <p className="text-white/35 text-sm mt-1">История звонков появится здесь</p>
            </motion.div>
          )}

          {/* Grouped call logs */}
          {!loading && !authLoading && !error && logs.length > 0 && (
            <AnimatePresence>
              {grouped.map((group) => (
                <div key={group.label}>
                  {/* Date header */}
                  <div className="px-4 py-2 text-xs font-semibold text-white/35 uppercase tracking-wider bg-white/[0.02]">
                    {group.label}
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {group.items.map((log) => (
                      <CallRow
                        key={log.id}
                        log={log}
                        currentUserId={user!.id}
                        onCallBack={handleCallBack}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
