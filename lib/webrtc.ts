import SimplePeer from "simple-peer";

export type CallType = "voice" | "video";

type SignalHandler = (signal: SimplePeer.SignalData) => void;
type StreamHandler = (stream: MediaStream) => void;
type ConnectedHandler = () => void;
type ErrorHandler = (err: Error) => void;
type CloseHandler = () => void;

// ICE servers — STUN + free TURN for NAT traversal
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // Free TURN servers from Open Relay (for symmetric NAT / mobile networks)
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export class WebRTCManager {
  private peer: SimplePeer.Instance | null = null;
  private localStream: MediaStream | null = null;

  // Event handlers
  public onSignal: SignalHandler | null = null;
  /** Override: if set, peer "signal" events call this instead of default handler */
  public onSignalOverride: SignalHandler | null = null;
  public onStream: StreamHandler | null = null;
  public onConnected: ConnectedHandler | null = null;
  public onError: ErrorHandler | null = null;
  public onClose: CloseHandler | null = null;

  private async getMedia(callType: CallType): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        window.isSecureContext
          ? "Camera/microphone not supported in this browser"
          : "Calls require HTTPS. Open the app via HTTPS to use calls."
      );
    }

    const constraints: MediaStreamConstraints = {
      audio: true,
      video: callType === "video"
        ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
        : false,
    };

    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err: unknown) {
      const e = err as DOMException;
      if (e.name === "NotAllowedError") {
        throw new Error(
          callType === "video"
            ? "Camera and microphone access denied. Please allow permissions and try again."
            : "Microphone access denied. Please allow permissions and try again."
        );
      }
      if (e.name === "NotFoundError") {
        throw new Error(
          callType === "video"
            ? "No camera found on this device. Try a voice call instead."
            : "No microphone found on this device."
        );
      }
      if (e.name === "NotReadableError") {
        throw new Error("Camera/microphone is already in use by another app.");
      }
      throw new Error(`Could not access media: ${e.message}`);
    }
  }

  async initiateCall(
    _conversationId: string,
    _userId: string,
    _remoteUserId: string,
    callType: CallType
  ): Promise<MediaStream> {
    // Clean up any leftover state from previous calls (preserve onSignalOverride)
    const savedOverride = this.onSignalOverride;
    this.destroyPeerAndStream();
    this.onSignalOverride = savedOverride;

    this.localStream = await this.getMedia(callType);

    this.peer = new SimplePeer({
      initiator: true,
      trickle: true,
      stream: this.localStream,
      config: { iceServers: ICE_SERVERS },
    });

    this.bindPeerEvents();
    return this.localStream;
  }

  async acceptCall(
    _conversationId: string,
    _userId: string,
    _callerId: string,
    incomingSignal: string,
    callType: CallType
  ): Promise<MediaStream> {
    // Clean up any leftover state (preserve onSignalOverride)
    const savedOverride = this.onSignalOverride;
    this.destroyPeerAndStream();
    this.onSignalOverride = savedOverride;

    this.localStream = await this.getMedia(callType);

    this.peer = new SimplePeer({
      initiator: false,
      trickle: true,
      stream: this.localStream,
      config: { iceServers: ICE_SERVERS },
    });

    this.bindPeerEvents();

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

  private bindPeerEvents() {
    if (!this.peer) return;

    this.peer.on("signal", (signal) => {
      if (this.onSignalOverride) {
        this.onSignalOverride(signal);
      } else {
        this.onSignal?.(signal);
      }
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
      this.destroyPeerAndStream();
    });
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

  hasPeer(): boolean {
    return this.peer !== null;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /** Destroy peer and stream only — does NOT reset onSignalOverride */
  private destroyPeerAndStream() {
    if (this.peer) {
      try { this.peer.destroy(); } catch { /* ignore */ }
      this.peer = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
  }

  /** Full cleanup including onSignalOverride */
  destroy() {
    this.destroyPeerAndStream();
    this.onSignalOverride = null;
    this.onSignal = null;
    this.onStream = null;
    this.onConnected = null;
    this.onError = null;
    this.onClose = null;
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
