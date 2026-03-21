"use client";

import React from "react";
import { Avatar } from "@/components/ui/Avatar";
import { useCalls } from "@/hooks/useCalls";

export function IncomingCallBanner() {
  const { incomingCall, acceptCall, declineCall } = useCalls();

  if (!incomingCall) return null;

  const caller = incomingCall.callerProfile;
  const name = caller?.display_name ?? caller?.username ?? "Unknown";

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
      <div className="glass-strong rounded-3xl shadow-[var(--shadow-lg)] p-4 flex items-center gap-4 min-w-80 max-w-sm">
        {/* Pulsing avatar */}
        <div className="relative shrink-0">
          <span className="absolute inset-0 rounded-full bg-[var(--accent-mint)]/30 animate-ping" />
          <Avatar
            src={caller?.avatar_url}
            name={name}
            size="md"
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{name}</p>
          <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
            {incomingCall.type === "video" ? (
              <>
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M0 4a2 2 0 012-2h8a2 2 0 012 2v2.586l3.293-3.293A1 1 0 0117 4v8a1 1 0 01-1.707.707L12 9.414V12a2 2 0 01-2 2H2a2 2 0 01-2-2V4z" />
                </svg>
                Incoming video call
              </>
            ) : (
              <>
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.654 1.328a.678.678 0 00-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 004.168 6.608 17.569 17.569 0 006.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 00-.063-1.015l-2.307-1.794a.678.678 0 00-.58-.122l-2.19.547a1.745 1.745 0 01-1.657-.459L5.482 8.062a1.745 1.745 0 01-.46-1.657l.548-2.19a.678.678 0 00-.122-.58L3.654 1.328z" />
                </svg>
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
          <svg className="w-5 h-5 rotate-135" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
          </svg>
        </button>

        {/* Accept */}
        <button
          onClick={acceptCall}
          className="w-10 h-10 rounded-full bg-[var(--accent-mint)] hover:bg-[var(--accent-mint-hover)] flex items-center justify-center text-[var(--bg-base)] transition-all duration-150 active:scale-95 shrink-0"
          aria-label="Accept"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
