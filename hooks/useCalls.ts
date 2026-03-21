"use client";

import { useEffect, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore, useCallStore } from "@/lib/store";
import { getWebRTCManager } from "@/lib/webrtc";
import type { CallType } from "@/lib/webrtc";
import type { Profile } from "@/lib/supabase";

export function useCalls() {
  const { user } = useAuthStore();
  const { incomingCall, activeCall, setIncomingCall, setActiveCall, endCall } = useCallStore();

  // Listen for incoming call signals
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();

    const channel = supabase
      .channel(`calls:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_signals",
          filter: `callee_id=eq.${user.id}`,
        },
        async (payload) => {
          const signal = payload.new as {
            id: string;
            conversation_id: string;
            caller_id: string;
            callee_id: string;
            type: string;
            call_type: "voice" | "video";
            signal: string;
          };

          if (signal.type === "offer") {
            // Fetch caller profile
            const { data: callerProfile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", signal.caller_id)
              .single();

            setIncomingCall({
              callerId: signal.caller_id,
              callerProfile: callerProfile as Profile | null,
              remoteUserId: signal.caller_id,
              remoteProfile: callerProfile as Profile | null,
              conversationId: signal.conversation_id,
              type: signal.call_type,
              signal: signal.signal,
            });
          } else if (signal.type === "answer" && activeCall) {
            // Feed answer signal to our peer
            const manager = getWebRTCManager();
            manager.feedSignal(signal.signal);
          } else if (signal.type === "ice-candidate") {
            const manager = getWebRTCManager();
            manager.feedSignal(signal.signal);
          } else if (signal.type === "hang-up") {
            const manager = getWebRTCManager();
            manager.destroy();
            endCall();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, activeCall, setIncomingCall, endCall]);

  const initiateCall = useCallback(
    async (
      conversationId: string,
      remoteUserId: string,
      callType: CallType
    ) => {
      if (!user) return null;

      const manager = getWebRTCManager();
      const supabase = getSupabaseBrowserClient();
      const { data: remoteProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", remoteUserId)
        .single();

      try {
        const localStream = await manager.initiateCall(
          conversationId,
          user.id,
          remoteUserId,
          callType
        );

        setActiveCall({
          callerId: user.id,
          callerProfile: null,
          remoteUserId,
          remoteProfile: remoteProfile as Profile | null,
          conversationId,
          type: callType,
        });

        return localStream;
      } catch (err) {
        console.error("Failed to initiate call:", err);
        return null;
      }
    },
    [user, setActiveCall]
  );

  const acceptCall = useCallback(async () => {
    if (!user || !incomingCall || !incomingCall.signal) return null;

    const manager = getWebRTCManager();

    try {
      const localStream = await manager.acceptCall(
        incomingCall.conversationId,
        user.id,
        incomingCall.callerId,
        incomingCall.signal,
        incomingCall.type
      );

      setActiveCall({
        ...incomingCall,
        remoteUserId: incomingCall.callerId,
        remoteProfile: incomingCall.callerProfile,
      });
      setIncomingCall(null);

      return localStream;
    } catch (err) {
      console.error("Failed to accept call:", err);
      return null;
    }
  }, [user, incomingCall, setActiveCall, setIncomingCall]);

  const declineCall = useCallback(async () => {
    if (!user || !incomingCall) return;

    const supabase = getSupabaseBrowserClient();
    await supabase.from("call_signals").insert({
      conversation_id: incomingCall.conversationId,
      caller_id: user.id,
      callee_id: incomingCall.callerId,
      type: "hang-up",
      call_type: incomingCall.type,
      signal: JSON.stringify({ type: "hang-up" }),
    });

    setIncomingCall(null);
  }, [user, incomingCall, setIncomingCall]);

  const hangup = useCallback(async () => {
    if (!user || !activeCall) return;
    const manager = getWebRTCManager();

    await manager.hangup(
      activeCall.conversationId,
      user.id,
      activeCall.remoteUserId
    );
    endCall();
  }, [user, activeCall, endCall]);

  return {
    incomingCall,
    activeCall,
    initiateCall,
    acceptCall,
    declineCall,
    hangup,
  };
}
