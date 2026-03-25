"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import { Suspense } from "react";

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handled = useRef(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const log = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setDebugLog((prev) => [...prev, `[${ts}] ${msg}`]);
    console.log(`[auth-callback] ${msg}`);
  };

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
    log(`isNative: ${isNative}`);
    log(`URL: ${window.location.href}`);

    // Show deep link info if available (set by AppShell handler)
    const dlDebug = (window as any).__deepLinkDebug;
    if (dlDebug) {
      log(`deepLink rawUrl: ${dlDebug.rawUrl}`);
      log(`deepLink timestamp: ${dlDebug.timestamp}`);
    } else {
      log("No deepLink data (page may have loaded directly, not via deep link handler)");
    }
    log(`searchParams: ${searchParams.toString()}`);

    const code = searchParams.get("code");
    log(`code: ${code ? code.slice(0, 12) + "..." : "NULL"}`);

    // Check if PKCE code verifier exists in localStorage
    const storageKey = "pals-auth-token";
    let verifierFound = false;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes("code-verifier")) {
          verifierFound = true;
          log(`code-verifier key found: ${key}`);
          const val = localStorage.getItem(key);
          log(`code-verifier value: ${val ? val.slice(0, 12) + "..." : "NULL"}`);
        }
      }
      if (!verifierFound) {
        log("WARNING: No code-verifier found in localStorage!");
        // List all localStorage keys for debugging
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) keys.push(key);
        }
        log(`All localStorage keys: ${keys.join(", ") || "(empty)"}`);
      }
    } catch (e) {
      log(`localStorage error: ${e}`);
    }

    const supabase = getSupabaseBrowserClient();

    function goHome() {
      log("SUCCESS — redirecting to /");
      if (isNative) {
        window.location.href = "/";
      } else {
        router.replace("/");
      }
    }

    function goAuth() {
      log("FAILED — redirecting to /auth");
      if (isNative) {
        window.location.href = "/auth?error=oauth_failed";
      } else {
        router.replace("/auth?error=oauth_failed");
      }
    }

    // Try exchangeCodeForSession and log the result
    if (code) {
      log("Calling exchangeCodeForSession...");
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (error) {
          log(`exchangeCode ERROR: ${error.message}`);
          log(`error status: ${(error as any).status || "unknown"}`);
        } else {
          log(`exchangeCode OK, session: ${data.session ? "YES" : "NO"}`);
          log(`user: ${data.session?.user?.email || data.session?.user?.id || "none"}`);
        }
      }).catch((err) => {
        log(`exchangeCode EXCEPTION: ${err?.message || err}`);
      });
    }

    // Also check if detectSessionInUrl already set up a session
    let attempts = 0;
    const maxAttempts = 30;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          log(`getSession error #${attempts}: ${error.message}`);
        }
        if (session) {
          log(`Session found after ${attempts} polls! user=${session.user?.email || session.user?.id}`);
          goHome();
          return;
        }
        if (attempts % 5 === 0) {
          log(`Poll #${attempts}: no session yet`);
        }
      } catch (err: any) {
        log(`Poll #${attempts} exception: ${err?.message || err}`);
      }
      attempts++;
      if (attempts >= maxAttempts) {
        log(`Gave up after ${maxAttempts} polls (${maxAttempts * 0.5}s)`);
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

      {/* Debug panel — remove after fixing */}
      <div className="mt-6 w-full max-w-md bg-black/80 rounded-xl p-3 text-[10px] font-mono text-green-400 max-h-[50vh] overflow-auto">
        <p className="text-yellow-400 mb-1 text-xs font-bold">DEBUG LOG (remove after fix)</p>
        {debugLog.length === 0 && <p className="text-gray-500">Waiting...</p>}
        {debugLog.map((line, i) => (
          <p key={i} className={line.includes("ERROR") || line.includes("WARNING") || line.includes("FAILED") ? "text-red-400" : ""}>{line}</p>
        ))}
      </div>
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
