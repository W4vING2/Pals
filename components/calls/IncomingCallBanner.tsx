"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video } from "lucide-react";
import { useCalls } from "@/hooks/useCalls";

export function IncomingCallBanner() {
  const { incomingCall, acceptCall, declineCall } = useCalls();

  return (
    <AnimatePresence>
      {incomingCall && (
        <motion.div
          initial={{ y: -120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -120, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="bg-[var(--bg-elevated)]/80 backdrop-blur-xl rounded-3xl shadow-lg border border-[var(--border)] p-4 flex items-center gap-4 min-w-80 max-w-sm">
            {/* Pulsing avatar */}
            <div className="relative shrink-0">
              <motion.span
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.5, 0, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeOut",
                }}
                className="absolute inset-0 rounded-full bg-[var(--accent-mint)]/30"
              />
              {incomingCall.callerProfile?.avatar_url ? (
                <img
                  src={incomingCall.callerProfile.avatar_url}
                  alt={
                    incomingCall.callerProfile.display_name ??
                    incomingCall.callerProfile.username ??
                    "Caller"
                  }
                  className="w-10 h-10 rounded-full object-cover relative z-10"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-sm font-semibold relative z-10">
                  {(
                    incomingCall.callerProfile?.display_name ??
                    incomingCall.callerProfile?.username ??
                    "?"
                  )[0]?.toUpperCase()}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {incomingCall.callerProfile?.display_name ??
                  incomingCall.callerProfile?.username ??
                  "Unknown"}
              </p>
              <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                {incomingCall.type === "video" ? (
                  <>
                    <Video className="w-3 h-3" />
                    Incoming video call
                  </>
                ) : (
                  <>
                    <Phone className="w-3 h-3" />
                    Incoming voice call
                  </>
                )}
              </p>
            </div>

            {/* Decline */}
            <button
              onClick={declineCall}
              className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-all duration-150 active:scale-95 shrink-0"
              aria-label="Decline"
            >
              <PhoneOff className="w-5 h-5" />
            </button>

            {/* Accept */}
            <button
              onClick={acceptCall}
              className="w-10 h-10 rounded-full bg-[var(--accent-mint)] hover:bg-[var(--accent-mint-hover)] flex items-center justify-center text-[var(--bg-base)] transition-all duration-150 active:scale-95 shrink-0"
              aria-label="Accept"
            >
              <Phone className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
