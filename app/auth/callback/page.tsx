"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function AuthCallbackPage() {
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const supabase = getSupabaseBrowserClient();

    // For implicit flow: tokens are in the URL hash (#access_token=...)
    // detectSessionInUrl: true in the client config handles parsing automatically.
    // We just poll until the session appears, then redirect to home.

    let attempts = 0;
    const maxAttempts = 20; // 10 seconds max

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

    // Small delay to let detectSessionInUrl process the hash
    setTimeout(check, 300);
  }, [router]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-[var(--bg-base)]">
      <Loader2 className="size-8 animate-spin text-[var(--accent-blue)]" />
      <p className="text-sm text-[var(--text-secondary)]">Signing in...</p>
    </div>
  );
}
