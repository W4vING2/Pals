"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileNavBar } from "./MobileNavBar";
import { useAuth } from "@/hooks/useAuth";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { usePresence } from "@/hooks/usePresence";
import { useRealtimeBadges } from "@/hooks/useRealtimeBadges";
import { useCallStore, useCreatePostStore } from "@/lib/store";
import { IncomingCallBanner } from "@/components/calls/IncomingCallBanner";
import { CallOverlay } from "@/components/calls/CallOverlay";
import { CreatePost } from "@/components/feed/CreatePost";

const AUTH_PATHS = ["/auth"];

function SplashScreen({ onFinished }: { onFinished: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onFinished, 2800);
    return () => clearTimeout(timer);
  }, [onFinished]);

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--bg-base)] overflow-hidden"
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
    >
      {/* Pulsing glow behind logo */}
      <motion.div
        className="absolute rounded-full bg-[var(--accent-blue)]/20 blur-3xl"
        initial={{ width: 0, height: 0, opacity: 0 }}
        animate={{
          width: [0, 120, 300, 200],
          height: [0, 120, 300, 200],
          opacity: [0, 0.6, 0.3, 0],
        }}
        transition={{
          duration: 2.4,
          times: [0, 0.25, 0.6, 1],
          ease: "easeOut",
        }}
      />
      {/* Logo: starts tiny, pulses, then expands dramatically */}
      <motion.img
        src="/logo.png"
        alt="Pals"
        className="relative z-10"
        style={{ width: 112, height: 112 }}
        initial={{ scale: 0.1, opacity: 0, rotate: -20 }}
        animate={{
          scale: [0.1, 0.5, 0.45, 1.1, 6],
          opacity: [0, 1, 1, 1, 0],
          rotate: [-20, 0, 0, 0, 0],
        }}
        transition={{
          duration: 2.6,
          times: [0, 0.2, 0.35, 0.6, 1],
          ease: [0.16, 1, 0.3, 1],
        }}
      />
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

  // Only show splash once per app lifetime (not on re-renders or tab switch)
  const splashDoneRef = useRef(false);
  const [showSplash, setShowSplash] = useState(() => !splashDoneRef.current);
  const splashMinTimeRef = useRef(false);

  // Minimum splash time (800ms for animation), then wait for auth
  useEffect(() => {
    if (splashDoneRef.current) return;
    const timer = setTimeout(() => {
      splashMinTimeRef.current = true;
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Dismiss splash when auth is done AND minimum time has passed
  useEffect(() => {
    if (splashDoneRef.current) return;
    if (!loading && showSplash) {
      const dismiss = () => {
        splashDoneRef.current = true;
        setShowSplash(false);
      };
      if (splashMinTimeRef.current) {
        dismiss();
      } else {
        const timer = setTimeout(dismiss, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [loading, showSplash]);

  // Initialize Capacitor push notifications on native app
  useEffect(() => {
    if (!user) return;
    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    if (!isNative) return;

    (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        // Listen for notification taps
        PushNotifications.addListener("pushNotificationActionPerformed", (notification) => {
          const url = notification.notification?.data?.url;
          if (url) window.location.href = url;
        });

        // Re-register if already subscribed (keeps FCM token fresh)
        const perms = await PushNotifications.checkPermissions();
        if (perms.receive === "granted") {
          await PushNotifications.register();
        }
      } catch {
        // Plugin not available
      }
    })();
  }, [user]);

  // Handle deep link for OAuth redirect on Capacitor native
  useEffect(() => {
    const isNative = typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
    if (!isNative) return;

    /** Extract auth code/params from a deep-link URL and navigate to the callback page */
    function handleDeepLink(rawUrl: string) {
      try {
        const url = new URL(rawUrl);
        const isAuthCallback =
          url.pathname?.includes("/auth/callback") ||
          (url.host === "auth" && url.pathname?.includes("/callback"));

        if (!isAuthCallback) return;

        // Close the in-app browser (fire-and-forget)
        import("@capacitor/browser")
          .then(({ Browser }) => Browser.close())
          .catch(() => {});

        const code = url.searchParams.get("code");

        if (code) {
          window.location.href = `/auth/callback?code=${encodeURIComponent(code)}`;
        } else {
          // Implicit flow fallback: tokens in hash
          const params = url.hash || url.search;
          if (params) {
            window.location.href = `/auth/callback${params}`;
          }
        }
      } catch {
        // Invalid URL
      }
    }

    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");

        // Cold-start: the app was launched via a deep link before the listener
        // could be registered. getLaunchUrl() returns the URL that started the app.
        const launch = await App.getLaunchUrl();
        if (launch?.url) {
          handleDeepLink(launch.url);
        }

        // Warm-start: the app is already running and receives a deep link
        const handle = await App.addListener("appUrlOpen", (event: { url: string }) => {
          handleDeepLink(event.url);
        });
        cleanup = () => handle.remove();
      } catch {
        // @capacitor/app not available
      }
    })();

    return () => cleanup?.();
  }, []);

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
            className="fixed bottom-28 lg:bottom-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-sm z-[70]"
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
            ? "min-h-dvh pb-24 lg:pb-0 lg:pl-60"
            : "min-h-dvh"
        }
      >
        {children}
      </main>
    </>
  );
}
