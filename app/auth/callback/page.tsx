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

    const supabase = getSupabaseBrowserClient();

    // PKCE flow: exchange code for session
    const code = searchParams.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          console.error("OAuth code exchange failed:", error);
          router.replace("/auth?error=oauth_failed");
        } else {
          router.replace("/");
        }
      });
      return;
    }

    // Implicit flow fallback: tokens in URL hash (#access_token=...)
    // detectSessionInUrl in the client config handles this automatically
    let attempts = 0;
    const maxAttempts = 20;

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace("/");
        return;
      }
      attempts++;
      if (attempts >= maxAttempts) {
        router.replace("/auth?error=oauth_failed");
        return;
      }
      setTimeout(check, 500);
    };

    setTimeout(check, 300);
  }, [router, searchParams]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-[var(--bg-base)]">
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
