"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video } from "lucide-react";
import { useCalls } from "@/hooks/useCalls";
import { startRingtone, stopRingtone } from "@/lib/ringtone";

export function IncomingCallBanner() {
  const { incomingCall, acceptCall, declineCall } = useCalls();

  // Start/stop ringtone
  useEffect(() => {
    if (incomingCall) {
      startRingtone();
    } else {
      stopRingtone();
    }
    return () => stopRingtone();
  }, [incomingCall]);

  const callerName =
    incomingCall?.callerProfile?.display_name ??
    incomingCall?.callerProfile?.username ??
    "Неизвестный";

  const callerAvatar = incomingCall?.callerProfile?.avatar_url;
  const isVideo = incomingCall?.type === "video";

  return (
    <AnimatePresence>
      {incomingCall && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[90] bg-[var(--bg-base)]"
        >
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--accent-mint)]/10 via-[var(--bg-base)] to-[var(--bg-base)]" />

          {/* Content */}
          <div className="relative h-full flex flex-col items-center justify-center px-6">
            {/* Incoming call label */}
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="text-sm text-[var(--text-secondary)] mb-8 flex items-center gap-2"
            >
              {isVideo ? (
                <Video className="w-4 h-4" />
              ) : (
                <Phone className="w-4 h-4" />
              )}
              {isVideo ? "Входящий видеозвонок" : "Входящий аудиозвонок"}
            </motion.p>

            {/* Avatar with pulse rings */}
            <div className="relative mb-6">
              {/* Outer pulse */}
              <motion.span
                animate={{
                  scale: [1, 1.8, 1],
                  opacity: [0.3, 0, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeOut",
                }}
                className="absolute inset-0 rounded-full bg-[var(--accent-mint)]/20"
              />
              {/* Inner pulse */}
              <motion.span
                animate={{
                  scale: [1, 1.4, 1],
                  opacity: [0.4, 0, 0.4],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeOut",
                  delay: 0.3,
                }}
                className="absolute inset-0 rounded-full bg-[var(--accent-mint)]/30"
              />

              {callerAvatar ? (
                <img
                  src={callerAvatar}
                  alt={callerName}
                  className="w-28 h-28 rounded-full object-cover relative z-10 ring-4 ring-[var(--accent-mint)]/20"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-purple-500 to-emerald-500 flex items-center justify-center text-white text-4xl font-bold relative z-10 ring-4 ring-[var(--accent-mint)]/20">
                  {callerName[0]?.toUpperCase()}
                </div>
              )}
            </div>

            {/* Caller name */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-2xl font-bold text-[var(--text-primary)] mb-1"
            >
              {callerName}
            </motion.p>

            {incomingCall.callerProfile?.username && (
              <p className="text-sm text-[var(--text-secondary)] mb-2">
                @{incomingCall.callerProfile.username}
              </p>
            )}

            {/* Animated dots */}
            <div className="flex items-center gap-1 mt-2 mb-16">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                  className="w-1.5 h-1.5 rounded-full bg-[var(--accent-mint)]"
                />
              ))}
            </div>

            {/* Action buttons */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 20 }}
              className="flex items-center gap-12"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              {/* Decline */}
              <div className="flex flex-col items-center gap-2">
                <motion.button
                  onClick={declineCall}
                  whileTap={{ scale: 0.9 }}
                  animate={{
                    boxShadow: [
                      "0 0 0 0 rgba(239, 68, 68, 0.3)",
                      "0 0 0 10px rgba(239, 68, 68, 0)",
                    ],
                  }}
                  transition={{
                    boxShadow: { duration: 1.5, repeat: Infinity, ease: "easeOut" },
                  }}
                  className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white active:scale-95 transition-colors"
                  aria-label="Decline"
                >
                  <PhoneOff className="w-7 h-7" />
                </motion.button>
                <span className="text-xs text-[var(--text-secondary)]">Отклонить</span>
              </div>

              {/* Accept */}
              <div className="flex flex-col items-center gap-2">
                <motion.button
                  onClick={acceptCall}
                  whileTap={{ scale: 0.9 }}
                  animate={{
                    boxShadow: [
                      "0 0 0 0 rgba(52, 211, 153, 0.3)",
                      "0 0 0 10px rgba(52, 211, 153, 0)",
                    ],
                  }}
                  transition={{
                    boxShadow: { duration: 1.5, repeat: Infinity, ease: "easeOut" },
                  }}
                  className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white active:scale-95 transition-colors"
                  aria-label="Accept"
                >
                  <Phone className="w-7 h-7" />
                </motion.button>
                <span className="text-xs text-[var(--text-secondary)]">Принять</span>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
