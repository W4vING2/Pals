"use client";

import { useEffect, useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore, useCallStore } from "@/lib/store";
import { getWebRTCManager } from "@/lib/webrtc";
import type { CallType } from "@/lib/webrtc";
import type { Profile } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Call signaling via Supabase Broadcast.
 * Each user subscribes to `call:{userId}` to receive signals.
 * To send signals to a remote user, we reuse a persistent outbound channel
 * for the duration of the call.
 */

type BroadcastSignal = {
  conversation_id: string;
  from_id: string;
  type: "offer" | "answer" | "ice-candidate" | "hang-up";
  call_type: "voice" | "video";
  signal: string;
};

export function useCalls() {
  const { user } = useAuthStore();
  const {
    incomingCall,
    activeCall,
    callStatus,
    callError,
    setIncomingCall,
    setActiveCall,
    setCallStatus,
    setCallError,
    endCall,
  } = useCallStore();

  const activeCallRef = useRef(activeCall);
  activeCallRef.current = activeCall;

  const incomingCallRef = useRef(incomingCall);
  incomingCallRef.current = incomingCall;

  const pendingSignalsRef = useRef<string[]>([]);

  // Persistent outbound channel for sending signals during a call
  const outboundChannelRef = useRef<RealtimeChannel | null>(null);
  const outboundReadyRef = useRef(false);
  const outboundQueueRef = useRef<BroadcastSignal[]>([]);

  // Clean up outbound channel
  const cleanupOutbound = useCallback(() => {
    if (outboundChannelRef.current) {
      const supabase = getSupabaseBrowserClient();
      supabase.removeChannel(outboundChannelRef.current);
      outboundChannelRef.current = null;
    }
    outboundReadyRef.current = false;
    outboundQueueRef.current = [];
  }, []);

  // Set up outbound channel to a specific user
  const setupOutbound = useCallback((remoteUserId: string) => {
    cleanupOutbound();
    const supabase = getSupabaseBrowserClient();
    const channel = supabase.channel(`call:${remoteUserId}`);
    outboundChannelRef.current = channel;

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        outboundReadyRef.current = true;
        // Flush queued signals
        for (const sig of outboundQueueRef.current) {
          channel.send({ type: "broadcast", event: "signal", payload: sig });
        }
        outboundQueueRef.current = [];
      }
    });
  }, [cleanupOutbound]);

  // Send a signal via the persistent outbound channel
  const sendSignal = useCallback((signal: BroadcastSignal) => {
    const channel = outboundChannelRef.current;
    if (channel && outboundReadyRef.current) {
      channel.send({ type: "broadcast", event: "signal", payload: signal });
    } else {
      // Queue for when channel is ready
      outboundQueueRef.current.push(signal);
    }
  }, []);

  // Listen for incoming call signals via Broadcast
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();

    const channel = supabase
      .channel(`call:${user.id}`, {
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event: "signal" }, async ({ payload }: { payload: BroadcastSignal }) => {
        const signal = payload;

        if (signal.type === "offer") {
          if (activeCallRef.current || incomingCallRef.current) return;
          pendingSignalsRef.current = [];

          const { data: callerProfile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", signal.from_id)
            .single();

          setIncomingCall({
            callerId: signal.from_id,
            callerProfile: callerProfile as Profile | null,
            remoteUserId: signal.from_id,
            remoteProfile: callerProfile as Profile | null,
            conversationId: signal.conversation_id,
            type: signal.call_type,
            signal: signal.signal,
          });
        } else if (signal.type === "answer") {
          if (activeCallRef.current) {
            const manager = getWebRTCManager();
            manager.feedSignal(signal.signal);
          }
        } else if (signal.type === "ice-candidate") {
          const manager = getWebRTCManager();
          if (manager.hasPeer()) {
            manager.feedSignal(signal.signal);
          } else {
            pendingSignalsRef.current.push(signal.signal);
          }
        } else if (signal.type === "hang-up") {
          pendingSignalsRef.current = [];
          const manager = getWebRTCManager();
          manager.destroy();
          endCall();
          cleanupOutbound();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, setIncomingCall, endCall, cleanupOutbound]);

  const initiateCall = useCallback(
    async (conversationId: string, remoteUserId: string, callType: CallType) => {
      if (!user) return null;

      const manager = getWebRTCManager();
      const supabase = getSupabaseBrowserClient();
      const { data: remoteProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", remoteUserId)
        .single();

      try {
        setCallError(null);

        // Set up persistent outbound channel to remote user
        setupOutbound(remoteUserId);

        // Override signal sending to use Broadcast
        manager.onSignalOverride = (signalData) => {
          const signalType: "offer" | "answer" | "ice-candidate" =
            signalData.type === "offer" ? "offer"
            : signalData.type === "answer" ? "answer"
            : "ice-candidate";

          sendSignal({
            conversation_id: conversationId,
            from_id: user.id,
            type: signalType,
            call_type: callType,
            signal: JSON.stringify(signalData),
          });
        };

        const localStream = await manager.initiateCall(conversationId, user.id, remoteUserId, callType);

        setActiveCall(
          {
            callerId: user.id,
            callerProfile: null,
            remoteUserId,
            remoteProfile: remoteProfile as Profile | null,
            conversationId,
            type: callType,
          },
          "ringing"
        );

        manager.onConnected = () => setCallStatus("connected");
        manager.onError = (err) => {
          console.error("WebRTC error:", err);
          setCallError(err.message);
        };
        manager.onClose = () => {
          endCall();
          cleanupOutbound();
        };

        return localStream;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to start call";
        console.error("Failed to initiate call:", message);
        setCallError(message);
        cleanupOutbound();
        return null;
      }
    },
    [user, setActiveCall, setCallStatus, setCallError, endCall, setupOutbound, sendSignal, cleanupOutbound]
  );

  const acceptCall = useCallback(async () => {
    if (!user || !incomingCall || !incomingCall.signal) return null;

    const manager = getWebRTCManager();

    try {
      setCallError(null);

      // Set up persistent outbound channel to caller
      setupOutbound(incomingCall.callerId);

      manager.onSignalOverride = (signalData) => {
        const signalType: "offer" | "answer" | "ice-candidate" =
          signalData.type === "offer" ? "offer"
          : signalData.type === "answer" ? "answer"
          : "ice-candidate";

        sendSignal({
          conversation_id: incomingCall.conversationId,
          from_id: user.id,
          type: signalType,
          call_type: incomingCall.type,
          signal: JSON.stringify(signalData),
        });
      };

      const localStream = await manager.acceptCall(
        incomingCall.conversationId,
        user.id,
        incomingCall.callerId,
        incomingCall.signal,
        incomingCall.type
      );

      // Feed buffered ICE candidates
      if (pendingSignalsRef.current.length > 0) {
        for (const sig of pendingSignalsRef.current) {
          manager.feedSignal(sig);
        }
        pendingSignalsRef.current = [];
      }

      setActiveCall({
        ...incomingCall,
        remoteUserId: incomingCall.callerId,
        remoteProfile: incomingCall.callerProfile,
      });
      setIncomingCall(null);

      manager.onConnected = () => setCallStatus("connected");
      manager.onError = (err) => {
        console.error("WebRTC error:", err);
        setCallError(err.message);
      };
      manager.onClose = () => {
        endCall();
        cleanupOutbound();
      };

      return localStream;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to accept call";
      console.error("Failed to accept call:", message);
      setCallError(message);
      setIncomingCall(null);
      cleanupOutbound();
      return null;
    }
  }, [user, incomingCall, setActiveCall, setIncomingCall, setCallStatus, setCallError, endCall, setupOutbound, sendSignal, cleanupOutbound]);

  const declineCall = useCallback(async () => {
    if (!user || !incomingCall) return;

    // Quick one-shot send for hang-up
    const supabase = getSupabaseBrowserClient();
    const ch = supabase.channel(`call:${incomingCall.callerId}`);
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.send({
          type: "broadcast",
          event: "signal",
          payload: {
            conversation_id: incomingCall.conversationId,
            from_id: user.id,
            type: "hang-up",
            call_type: incomingCall.type,
            signal: "{}",
          },
        });
        setTimeout(() => supabase.removeChannel(ch), 500);
      }
    });

    setIncomingCall(null);
  }, [user, incomingCall, setIncomingCall]);

  const hangup = useCallback(async () => {
    if (!user || !activeCall) return;
    const manager = getWebRTCManager();

    // Send hang-up via outbound channel
    sendSignal({
      conversation_id: activeCall.conversationId,
      from_id: user.id,
      type: "hang-up",
      call_type: activeCall.type,
      signal: "{}",
    });

    // Small delay to let the signal send before destroying
    setTimeout(() => {
      manager.destroy();
      endCall();
      cleanupOutbound();
    }, 100);
  }, [user, activeCall, endCall, sendSignal, cleanupOutbound]);

  return {
    incomingCall,
    activeCall,
    callStatus,
    callError,
    initiateCall,
    acceptCall,
    declineCall,
    hangup,
    clearCallError: () => setCallError(null),
  };
}
