"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { useCallStore } from "@/lib/store";
import { useAuthStore } from "@/lib/store";
import { useCalls } from "@/hooks/useCalls";
import { getWebRTCManager } from "@/lib/webrtc";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
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
  const callerName =
    caller?.display_name ?? caller?.username ?? "Unknown";

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
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[100] bg-[var(--bg-base)]"
    >
      {isVideo ? (
        /* -- Video call -- */
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
              {caller?.avatar_url ? (
                <img
                  src={caller.avatar_url}
                  alt={callerName}
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-3xl font-bold">
                  {callerName[0]?.toUpperCase()}
                </div>
              )}
              <p className="text-xl font-semibold text-[var(--text-primary)]">
                {callerName}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                Connecting...
              </p>
            </div>
          )}

          {/* Local video (PiP bottom-right) */}
          <div className="absolute bottom-28 right-4 w-28 h-40 rounded-xl overflow-hidden shadow-lg border-2 border-[var(--border)]">
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
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={
                      profile.display_name ??
                      profile.username ??
                      "Me"
                    }
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-sm font-semibold">
                    {(
                      profile?.display_name ??
                      profile?.username ??
                      "M"
                    )[0]?.toUpperCase()}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Duration */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-xl px-4 py-1.5 rounded-full">
            <p className="text-sm font-mono text-[var(--text-primary)]">
              {formatDuration(duration)}
            </p>
          </div>
        </>
      ) : (
        /* -- Voice call -- */
        <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-[var(--accent-blue)]/10 to-[var(--bg-base)]">
          <div className="relative">
            <span className="absolute inset-0 rounded-full bg-[var(--accent-blue)]/20 animate-ping scale-110" />
            {caller?.avatar_url ? (
              <img
                src={caller.avatar_url}
                alt={callerName}
                className="w-24 h-24 rounded-full object-cover relative z-10"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-3xl font-bold relative z-10">
                {callerName[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-[var(--text-primary)]">
              {callerName}
            </p>
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
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 backdrop-blur-xl",
            muted
              ? "bg-white/10 text-red-400"
              : "bg-white/10 text-[var(--text-primary)] hover:bg-white/20"
          )}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <MicOff className="w-6 h-6" />
          ) : (
            <Mic className="w-6 h-6" />
          )}
        </button>

        {/* Camera toggle (video call only) */}
        {isVideo && (
          <button
            onClick={toggleCamera}
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 backdrop-blur-xl",
              !cameraOn
                ? "bg-white/10 text-red-400"
                : "bg-white/10 text-[var(--text-primary)] hover:bg-white/20"
            )}
            aria-label={cameraOn ? "Turn off camera" : "Turn on camera"}
          >
            {cameraOn ? (
              <Video className="w-6 h-6" />
            ) : (
              <VideoOff className="w-6 h-6" />
            )}
          </button>
        )}

        {/* Hang up */}
        <motion.button
          onClick={hangup}
          animate={{
            boxShadow: [
              "0 0 0 0 rgba(239, 68, 68, 0.4)",
              "0 0 0 8px rgba(239, 68, 68, 0)",
            ],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeOut",
          }}
          className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-all duration-150 active:scale-95"
          aria-label="Hang up"
        >
          <PhoneOff className="w-7 h-7" />
        </motion.button>
      </div>
    </motion.div>
  );
}
