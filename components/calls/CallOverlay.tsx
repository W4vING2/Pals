"use client";

import React, { useEffect, useRef, useState } from "react";
import { useCallStore } from "@/lib/store";
import { useAuthStore } from "@/lib/store";
import { useCalls } from "@/hooks/useCalls";
import { getWebRTCManager } from "@/lib/webrtc";
import { Avatar } from "@/components/ui/Avatar";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function CallOverlay() {
  const { activeCall } = useCallStore();
  const { profile } = useAuthStore();
  const { hangup } = useCalls();

  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const caller = activeCall?.callerProfile;
  const callerName = caller?.display_name ?? caller?.username ?? "Unknown";

  useEffect(() => {
    if (!activeCall) return;

    const manager = getWebRTCManager();
    const stream = manager.getLocalStream();
    if (stream) {
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    }

    manager.onStream = (stream) => {
      setRemoteStream(stream);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    // Start duration timer
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      manager.onStream = null;
    };
  }, [activeCall]);

  if (!activeCall) return null;

  const isVideo = activeCall.type === "video";

  const toggleMute = () => {
    const manager = getWebRTCManager();
    manager.toggleMute(!muted);
    setMuted((m) => !m);
  };

  const toggleCamera = () => {
    const manager = getWebRTCManager();
    manager.toggleCamera(!cameraOn);
    setCameraOn((c) => !c);
  };

  return (
    <div className="fixed inset-0 z-[100] animate-scale-in bg-[var(--bg-base)]">
      {isVideo ? (
        /* ── Video call ── */
        <>
          {/* Remote video (full screen) */}
          {remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-[var(--bg-base)] to-[var(--bg-elevated)]">
              <Avatar src={caller?.avatar_url} name={callerName} size="xl" />
              <p className="text-xl font-semibold text-[var(--text-primary)]">{callerName}</p>
              <p className="text-sm text-[var(--text-secondary)]">Connecting…</p>
            </div>
          )}

          {/* Local video (PiP bottom-right) */}
          <div className="absolute bottom-28 right-4 w-28 h-40 rounded-2xl overflow-hidden shadow-[var(--shadow-lg)] border-2 border-[var(--border)]">
            {localStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-[var(--bg-elevated)] flex items-center justify-center">
                <Avatar src={profile?.avatar_url} name={profile?.display_name ?? profile?.username ?? "Me"} size="sm" />
              </div>
            )}
          </div>

          {/* Duration */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 glass px-4 py-1.5 rounded-full">
            <p className="text-sm font-mono text-[var(--text-primary)]">{formatDuration(duration)}</p>
          </div>
        </>
      ) : (
        /* ── Voice call ── */
        <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-[var(--accent-blue)]/10 to-[var(--bg-base)]">
          <div className="relative">
            <span className="absolute inset-0 rounded-full bg-[var(--accent-blue)]/20 animate-ping scale-110" />
            <Avatar src={caller?.avatar_url} name={callerName} size="xl" />
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-[var(--text-primary)]">{callerName}</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {formatDuration(duration)}
            </p>
          </div>
        </div>
      )}

      {/* Control bar */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4">
        {/* Mute */}
        <button
          onClick={toggleMute}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 ${
            muted
              ? "bg-[var(--bg-elevated)] text-red-400"
              : "bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--border-strong)]"
          }`}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M3 3l18 18M9.9 4.24A5 5 0 0117 9v4.17M15 9.34V5a3 3 0 00-5.94-.6" />
            </svg>
          ) : (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        {/* Camera toggle (video call only) */}
        {isVideo && (
          <button
            onClick={toggleCamera}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 ${
              !cameraOn
                ? "bg-[var(--bg-elevated)] text-red-400"
                : "bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--border-strong)]"
            }`}
            aria-label={cameraOn ? "Turn off camera" : "Turn on camera"}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {cameraOn ? (
                <>
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </>
              ) : (
                <>
                  <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </>
              )}
            </svg>
          </button>
        )}

        {/* Hang up */}
        <button
          onClick={hangup}
          className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-all duration-150 active:scale-95 shadow-lg shadow-red-500/30"
          aria-label="Hang up"
        >
          <svg className="w-7 h-7 rotate-135" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
