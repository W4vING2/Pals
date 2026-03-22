"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileNavBar } from "./MobileNavBar";
import { useAuth } from "@/hooks/useAuth";
import { usePresence } from "@/hooks/usePresence";
import { useRealtimeBadges } from "@/hooks/useRealtimeBadges";
import { useCallStore, useCreatePostStore } from "@/lib/store";
import { IncomingCallBanner } from "@/components/calls/IncomingCallBanner";
import { CallOverlay } from "@/components/calls/CallOverlay";
import { CreatePost } from "@/components/feed/CreatePost";

const AUTH_PATHS = ["/auth"];

function SplashScreen({ onFinished }: { onFinished: () => void }) {
  useEffect(() => {
    // Safety: always dismiss after 3s max
    const timer = setTimeout(onFinished, 3000);
    return () => clearTimeout(timer);
  }, [onFinished]);

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--bg-base)]"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <motion.div
        className="flex flex-col items-center gap-3"
        animate={{
          scale: [0.5, 1.2, 1],
          opacity: [0, 1, 1],
        }}
        transition={{
          duration: 0.8,
          times: [0, 0.5, 1],
          ease: "easeOut",
        }}
      >
        <motion.img
          src="/icon-192.png"
          alt="Pals"
          className="w-20 h-20 rounded-3xl"
          animate={{
            scale: [0.5, 1.15, 1],
          }}
          transition={{
            duration: 0.8,
            times: [0, 0.45, 1],
            ease: [0.22, 1, 0.36, 1],
          }}
        />
        <motion.span
          className="gradient-text text-2xl font-bold tracking-tight"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          Pals
        </motion.span>
      </motion.div>
    </motion.div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  usePresence();
  useRealtimeBadges();
  const { activeCall, callError, setCallError } = useCallStore();
  const { open: createPostOpen, setOpen: setCreatePostOpen } = useCreatePostStore();

  const [showSplash, setShowSplash] = useState(true);
  const splashMinTimeRef = useRef(false);

  // Minimum splash time (800ms for animation), then wait for auth
  useEffect(() => {
    const timer = setTimeout(() => {
      splashMinTimeRef.current = true;
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Dismiss splash when auth is done AND minimum time has passed
  useEffect(() => {
    if (!loading && showSplash) {
      if (splashMinTimeRef.current) {
        setShowSplash(false);
      } else {
        // Auth finished fast — wait for min animation time
        const timer = setTimeout(() => setShowSplash(false), 800);
        return () => clearTimeout(timer);
      }
    }
  }, [loading, showSplash]);

  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));
  const showNav = !isAuthPage && !!user && !loading;

  return (
    <>
      {/* Splash screen */}
      <AnimatePresence>
        {showSplash && (
          <SplashScreen onFinished={() => setShowSplash(false)} />
        )}
      </AnimatePresence>

      {showNav && (
        <>
          <DesktopSidebar />
          <MobileNavBar />
          <IncomingCallBanner />
          <CreatePost
            open={createPostOpen}
            onClose={() => setCreatePostOpen(false)}
          />
        </>
      )}
      {activeCall && <CallOverlay />}

      {/* Call error toast (shows even when activeCall is null, e.g. getUserMedia failed) */}
      <AnimatePresence>
        {callError && !activeCall && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed bottom-24 lg:bottom-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-sm z-[70]"
          >
            <div className="bg-red-500/90 backdrop-blur-xl text-white text-sm rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg">
              <span className="flex-1">{callError}</span>
              <button onClick={() => setCallError(null)} className="shrink-0" aria-label="Dismiss">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main
        className={
          showNav
            ? "min-h-dvh pb-20 lg:pb-0 lg:pl-60"
            : "min-h-dvh"
        }
      >
        {children}
      </main>
    </>
  );
}
