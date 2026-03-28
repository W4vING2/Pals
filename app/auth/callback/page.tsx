"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import { Suspense } from "react";

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    const supabase = getSupabaseBrowserClient();
    const code = searchParams.get("code");

    function goHome() {
      if (isNative) {
        window.location.href = "/";
      } else {
        router.replace("/");
      }
    }

    function goAuth() {
      if (isNative) {
        window.location.href = "/auth?error=oauth_failed";
      } else {
        router.replace("/auth?error=oauth_failed");
      }
    }

    // Exchange code for session
    if (code) {
      supabase.auth.exchangeCodeForSession(code).catch(() => {});
    }

    // Poll for session
    let attempts = 0;
    const maxAttempts = 30;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          goHome();
          return;
        }
      } catch {}
      attempts++;
      if (attempts >= maxAttempts) {
        goAuth();
        return;
      }
      setTimeout(poll, 500);
    };

    setTimeout(poll, 500);

    return () => { cancelled = true; };
  }, [router, searchParams]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-[var(--bg-base)] p-4">
      <Loader2 className="size-8 animate-spin text-[var(--accent-blue)]" />
      <p className="text-sm text-[var(--text-secondary)]">Вход...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-[var(--bg-base)]">
        <Loader2 className="size-8 animate-spin text-[var(--accent-blue)]" />
      </div>
    }>
      <CallbackInner />
    </Suspense>
  );
}
