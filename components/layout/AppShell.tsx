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
      <motion.img
        src="/logo.png"
        alt="Pals"
        className="w-28 h-28"
        animate={{
          scale: [0.4, 1.15, 1],
          opacity: [0, 1, 1],
        }}
        transition={{
          duration: 0.8,
          times: [0, 0.45, 1],
          ease: [0.22, 1, 0.36, 1],
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
      // DEBUG: store deep link info so callback page can display it
      try {
        (window as any).__deepLinkDebug = {
          rawUrl,
          timestamp: new Date().toISOString(),
        };
        console.log("[deep-link] rawUrl:", rawUrl);
      } catch {}

      try {
        const url = new URL(rawUrl);
        const isAuthCallback =
          url.pathname?.includes("/auth/callback") ||
          (url.host === "auth" && url.pathname?.includes("/callback"));

        console.log("[deep-link] parsed:", { protocol: url.protocol, host: url.host, pathname: url.pathname, search: url.search, isAuthCallback });

        if (!isAuthCallback) return;

        // Close the in-app browser (fire-and-forget)
        import("@capacitor/browser")
          .then(({ Browser }) => Browser.close())
          .catch(() => {});

        // Delegate code exchange to the callback page — it already handles PKCE
        // exchange, error recovery, and session polling in a single place.
        const code = url.searchParams.get("code");
        console.log("[deep-link] code:", code ? code.slice(0, 12) + "..." : "NULL");

        if (code) {
          window.location.href = `/auth/callback?code=${encodeURIComponent(code)}`;
        } else {
          // Implicit flow fallback: tokens in hash
          const params = url.hash || url.search;
          if (params) {
            window.location.href = `/auth/callback${params}`;
          }
        }
      } catch (e) {
        console.error("[deep-link] error:", e);
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
