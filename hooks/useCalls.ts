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
 *
 * IMPORTANT: The inbound channel subscription is a module-level singleton
 * to avoid duplicate channels when useCalls() is instantiated from multiple
 * components (MessagesPage, IncomingCallBanner, CallOverlay).
 */

type BroadcastSignal = {
  conversation_id: string;
  from_id: string;
  type: "offer" | "answer" | "ice-candidate" | "hang-up";
  call_type: "voice" | "video";
  signal: string;
};

// ── Module-level singleton state for inbound channel ──────────────
let inboundChannel: RealtimeChannel | null = null;
let inboundUserId: string | null = null;
const pendingSignals: string[] = [];
/** Timestamp of last decline — ignore retry offers within 10s */
let lastDeclineAt = 0;
/** Buffered answer signal — if answer arrives before activeCall is set */
let pendingAnswer: string | null = null;

// ── Module-level outbound channel state ───────────────────────────
let outboundChannel: RealtimeChannel | null = null;
let outboundReady = false;
let outboundQueue: BroadcastSignal[] = [];
const offerRetryTimers: ReturnType<typeof setTimeout>[] = [];

function cleanupOutbound() {
  for (const t of offerRetryTimers) clearTimeout(t);
  offerRetryTimers.length = 0;

  if (outboundChannel) {
    const supabase = getSupabaseBrowserClient();
    supabase.removeChannel(outboundChannel);
    outboundChannel = null;
  }
  outboundReady = false;
  outboundQueue = [];
}

function setupOutbound(remoteUserId: string): Promise<void> {
  cleanupOutbound();
  const supabase = getSupabaseBrowserClient();
  const channel = supabase.channel(`call:${remoteUserId}`);
  outboundChannel = channel;

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Outbound channel subscription timeout"));
    }, 10000);

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        outboundReady = true;
        // Flush queued signals
        for (const sig of outboundQueue) {
          channel.send({ type: "broadcast", event: "signal", payload: sig });
        }
        outboundQueue = [];
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error(`Outbound channel failed: ${status}`));
      }
    });
  });
}

function sendSignal(signal: BroadcastSignal) {
  if (outboundChannel && outboundReady) {
    outboundChannel.send({ type: "broadcast", event: "signal", payload: signal });
  } else {
    outboundQueue.push(signal);
  }
}

function setupInboundChannel(userId: string) {
  // Already subscribed for this user — skip
  if (inboundChannel && inboundUserId === userId) return;

  // Clean up previous
  if (inboundChannel) {
    const supabase = getSupabaseBrowserClient();
    supabase.removeChannel(inboundChannel);
    inboundChannel = null;
    inboundUserId = null;
  }

  const supabase = getSupabaseBrowserClient();

  const channel = supabase
    .channel(`call:${userId}`, {
      config: { broadcast: { self: false } },
    })
    .on("broadcast", { event: "signal" }, async ({ payload }: { payload: BroadcastSignal }) => {
      const signal = payload;

      if (signal.type === "offer") {
        // Read FRESH store state for offer handling
        const s = useCallStore.getState();
        if (s.activeCall || s.incomingCall) return;

        // Ignore retry offers shortly after a decline
        if (Date.now() - lastDeclineAt < 10000) return;

        pendingSignals.length = 0;

        const { data: callerProfile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", signal.from_id)
          .single();

        // Re-check FRESH state after async fetch
        const latest = useCallStore.getState();
        if (latest.activeCall || latest.incomingCall) return;
        if (Date.now() - lastDeclineAt < 10000) return;

        latest.setIncomingCall({
          callerId: signal.from_id,
          callerProfile: callerProfile as Profile | null,
          remoteUserId: signal.from_id,
          remoteProfile: callerProfile as Profile | null,
          conversationId: signal.conversation_id,
          type: signal.call_type,
          signal: signal.signal,
        });
      } else if (signal.type === "answer") {
        // Stop offer retries — call was answered
        for (const t of offerRetryTimers) clearTimeout(t);
        offerRetryTimers.length = 0;

        // Read FRESH store state — activeCall must be set
        const s = useCallStore.getState();
        const manager = getWebRTCManager();
        if (s.activeCall && manager.hasPeer()) {
          manager.feedSignal(signal.signal);
        } else {
          // Answer arrived before activeCall is fully set (race on video calls)
          // Buffer it and feed when peer is ready
          pendingAnswer = signal.signal;
        }
      } else if (signal.type === "ice-candidate") {
        const manager = getWebRTCManager();
        if (manager.hasPeer()) {
          manager.feedSignal(signal.signal);
        } else {
          pendingSignals.push(signal.signal);
        }
      } else if (signal.type === "hang-up") {
        pendingSignals.length = 0;
        const manager = getWebRTCManager();
        manager.destroy();
        useCallStore.getState().endCall();
        cleanupOutbound();
      }
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.warn("Call inbound channel error — will auto-reconnect");
      }
    });

  inboundChannel = channel;
  inboundUserId = userId;
}

function teardownInboundChannel() {
  if (inboundChannel) {
    const supabase = getSupabaseBrowserClient();
    supabase.removeChannel(inboundChannel);
    inboundChannel = null;
    inboundUserId = null;
  }
}

// ── Hook ──────────────────────────────────────────────────────────

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

  // Set up singleton inbound channel
  useEffect(() => {
    if (!user) return;
    setupInboundChannel(user.id);
    // Cleanup only on unmount or user change — but since it's a singleton,
    // it stays alive as long as at least one useCalls instance exists.
    // We track via a ref count.
    return () => {
      // Don't tear down — other instances may still be alive.
      // Teardown happens when user logs out (user becomes null).
    };
  }, [user]);

  // Teardown when user logs out
  const prevUserRef = useRef(user);
  useEffect(() => {
    if (prevUserRef.current && !user) {
      teardownInboundChannel();
      cleanupOutbound();
    }
    prevUserRef.current = user;
  }, [user]);

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

        // Set up persistent outbound channel — WAIT for it to be ready
        await setupOutbound(remoteUserId);

        // Override signal sending to use Broadcast
        // For offers: resend multiple times to handle Broadcast delivery failures on mobile
        manager.onSignalOverride = (signalData) => {
          const signalType: "offer" | "answer" | "ice-candidate" =
            signalData.type === "offer" ? "offer"
            : signalData.type === "answer" ? "answer"
            : "ice-candidate";

          const sig: BroadcastSignal = {
            conversation_id: conversationId,
            from_id: user.id,
            type: signalType,
            call_type: callType,
            signal: JSON.stringify(signalData),
          };

          sendSignal(sig);

          // Retry offers: resend 3 more times with increasing delays
          if (signalType === "offer") {
            const retryDelays = [1500, 3000, 5000];
            for (const delay of retryDelays) {
              const timer = setTimeout(() => {
                const store = useCallStore.getState();
                if (store.activeCall?.conversationId === conversationId && store.callStatus === "ringing") {
                  sendSignal(sig);
                }
              }, delay);
              offerRetryTimers.push(timer);
            }
          }
        };

        const localStream = await manager.initiateCall(conversationId, user.id, remoteUserId, callType);

        // Clear any pending answer from previous calls
        pendingAnswer = null;

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

        // Feed any answer that arrived while we were setting up (race condition on fast networks)
        if (pendingAnswer && manager.hasPeer()) {
          manager.feedSignal(pendingAnswer);
          pendingAnswer = null;
        }

        // Also check for pending answer after a short delay (covers async SimplePeer timing)
        const answerCheckTimer = setInterval(() => {
          if (pendingAnswer && manager.hasPeer()) {
            manager.feedSignal(pendingAnswer);
            pendingAnswer = null;
            clearInterval(answerCheckTimer);
          }
          // Stop checking after call is no longer ringing
          const cs = useCallStore.getState().callStatus;
          if (cs !== "ringing") {
            clearInterval(answerCheckTimer);
          }
        }, 200);

        manager.onConnected = () => {
          clearInterval(answerCheckTimer);
          setCallStatus("connected");
        };
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
    [user, setActiveCall, setCallStatus, setCallError, endCall]
  );

  const acceptCall = useCallback(async () => {
    if (!user || !incomingCall || !incomingCall.signal) return null;

    const manager = getWebRTCManager();

    try {
      setCallError(null);

      // Set up persistent outbound channel — WAIT for it to be ready
      await setupOutbound(incomingCall.callerId);

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

      // Feed buffered ICE candidates from the singleton store
      if (pendingSignals.length > 0) {
        for (const sig of pendingSignals) {
          manager.feedSignal(sig);
        }
        pendingSignals.length = 0;
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
  }, [user, incomingCall, setActiveCall, setIncomingCall, setCallStatus, setCallError, endCall]);

  const declineCall = useCallback(async () => {
    if (!user || !incomingCall) return;

    // Mark decline time to suppress retry offers
    lastDeclineAt = Date.now();

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
    }, 150);
  }, [user, activeCall, endCall]);

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
