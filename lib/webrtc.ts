import SimplePeer from "simple-peer";
import { getSupabaseBrowserClient } from "./supabase";

export type CallType = "voice" | "video";

type SignalHandler = (signal: SimplePeer.SignalData) => void;
type StreamHandler = (stream: MediaStream) => void;
type ConnectedHandler = () => void;
type ErrorHandler = (err: Error) => void;
type CloseHandler = () => void;

export class WebRTCManager {
  private peer: SimplePeer.Instance | null = null;
  private localStream: MediaStream | null = null;
  private conversationId: string | null = null;
  private userId: string | null = null;
  private remoteUserId: string | null = null;

  // Event handlers
  public onSignal: SignalHandler | null = null;
  public onStream: StreamHandler | null = null;
  public onConnected: ConnectedHandler | null = null;
  public onError: ErrorHandler | null = null;
  public onClose: CloseHandler | null = null;

  private async getMedia(callType: CallType): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: callType === "video" ? { width: 1280, height: 720 } : false,
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  async initiateCall(
    conversationId: string,
    userId: string,
    remoteUserId: string,
    callType: CallType
  ): Promise<MediaStream> {
    this.conversationId = conversationId;
    this.userId = userId;
    this.remoteUserId = remoteUserId;

    this.localStream = await this.getMedia(callType);

    this.peer = new SimplePeer({
      initiator: true,
      trickle: true,
      stream: this.localStream,
    });

    this.bindPeerEvents(conversationId, userId, remoteUserId, callType);
    return this.localStream;
  }

  async acceptCall(
    conversationId: string,
    userId: string,
    callerId: string,
    incomingSignal: string,
    callType: CallType
  ): Promise<MediaStream> {
    this.conversationId = conversationId;
    this.userId = userId;
    this.remoteUserId = callerId;

    this.localStream = await this.getMedia(callType);

    this.peer = new SimplePeer({
      initiator: false,
      trickle: true,
      stream: this.localStream,
    });

    this.bindPeerEvents(conversationId, userId, callerId, callType);

    // Feed in the incoming offer signal
    try {
      const parsed = JSON.parse(incomingSignal);
      this.peer.signal(parsed);
    } catch {
      console.error("Failed to parse incoming signal");
    }

    return this.localStream;
  }

  feedSignal(signalStr: string) {
    if (!this.peer) return;
    try {
      const parsed = JSON.parse(signalStr);
      this.peer.signal(parsed);
    } catch {
      console.error("Failed to feed signal");
    }
  }

  private bindPeerEvents(
    conversationId: string,
    userId: string,
    remoteUserId: string,
    callType: CallType
  ) {
    if (!this.peer) return;

    this.peer.on("signal", async (signal) => {
      this.onSignal?.(signal);

      // Send signal via Supabase Realtime as a DB insert
      const supabase = getSupabaseBrowserClient();
      const signalType: "offer" | "answer" | "ice-candidate" =
        signal.type === "offer"
          ? "offer"
          : signal.type === "answer"
          ? "answer"
          : "ice-candidate";

      await supabase.from("call_signals").insert({
        conversation_id: conversationId,
        caller_id: userId,
        callee_id: remoteUserId,
        type: signalType,
        call_type: callType,
        signal: JSON.stringify(signal),
      });
    });

    this.peer.on("stream", (stream) => {
      this.onStream?.(stream);
    });

    this.peer.on("connect", () => {
      this.onConnected?.();
    });

    this.peer.on("error", (err) => {
      this.onError?.(err);
    });

    this.peer.on("close", () => {
      this.onClose?.();
      this.cleanup();
    });
  }

  async hangup(conversationId: string, userId: string, remoteUserId: string) {
    // Notify remote peer via DB signal
    const supabase = getSupabaseBrowserClient();
    await supabase.from("call_signals").insert({
      conversation_id: conversationId,
      caller_id: userId,
      callee_id: remoteUserId,
      type: "hang-up",
      call_type: "voice",
      signal: JSON.stringify({ type: "hang-up" }),
    });

    this.cleanup();
  }

  toggleMute(muted: boolean) {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  toggleCamera(enabled: boolean) {
    if (!this.localStream) return;
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  private cleanup() {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.conversationId = null;
    this.userId = null;
    this.remoteUserId = null;
  }

  destroy() {
    this.cleanup();
  }
}

// Singleton instance
let managerInstance: WebRTCManager | null = null;

export function getWebRTCManager(): WebRTCManager {
  if (!managerInstance) {
    managerInstance = new WebRTCManager();
  }
  return managerInstance;
}
