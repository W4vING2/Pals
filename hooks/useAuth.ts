"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import type { Profile } from "@/lib/supabase";

// Global flag: auth listener is initialized only once across all hook instances
declare global {
  // eslint-disable-next-line no-var
  var __authInitialized: boolean | undefined;
}

async function loadOrCreateProfile(u: User) {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", u.id)
    .maybeSingle();

  if (data) return data as Profile;

  // Profile doesn't exist — create it (handles OAuth and edge cases)
  const username =
    u.user_metadata?.username ||
    u.user_metadata?.user_name ||
    u.email?.split("@")[0]?.replace(/[^a-z0-9_]/gi, "").toLowerCase().slice(0, 30) ||
    `user_${u.id.slice(0, 8)}`;

  const { data: created } = await supabase
    .from("profiles")
    .insert({
      id: u.id,
      username,
      display_name: u.user_metadata?.full_name || u.user_metadata?.name || null,
      avatar_url: u.user_metadata?.avatar_url || null,
      date_of_birth: u.user_metadata?.date_of_birth || null,
    })
    .select()
    .maybeSingle();

  return created as Profile | null;
}

/** Wait for network to be available (or resolve immediately if online) */
function waitForOnline(ms: number): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms); // safety timeout
    const handler = () => {
      clearTimeout(timer);
      window.removeEventListener("online", handler);
      // Small delay for connection to stabilize
      setTimeout(resolve, 300);
    };
    window.addEventListener("online", handler);
  });
}

/** Retry a function with delays, giving up after maxRetries */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delayMs: number
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries) {
        // Wait for online + delay before retrying
        await waitForOnline(5000);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

/** Race a promise against a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    ),
  ]);
}

export function useAuth() {
  const { user, profile, setUser, setProfile, signOut: storeSignOut } = useAuthStore();
  const [loading, setLoading] = useState(!user); // already loaded if user in store

  useEffect(() => {
    // Only initialize the auth listener once globally
    if (globalThis.__authInitialized) {
      setLoading(false);
      return;
    }
    globalThis.__authInitialized = true;

    const supabase = getSupabaseBrowserClient();
    let initialDone = false;

    // Safety: never block the app for more than 6s even if INITIAL_SESSION never fires
    const safetyTimer = setTimeout(() => {
      if (!initialDone) {
        initialDone = true;
        console.warn("Auth safety timeout — unblocking app");
        setLoading(false);
      }
    }, 6000);

    // Rely entirely on onAuthStateChange — it fires INITIAL_SESSION synchronously
    // from local storage without navigator.locks, avoiding the getSession() hang
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // TOKEN_REFRESHED — silently ignore (don't trigger re-renders)
        if (event === "TOKEN_REFRESHED") {
          if (!session) {
            console.warn("Token refresh failed, signing out");
            try { await supabase.auth.signOut({ scope: "local" }); } catch { /* ok */ }
            setUser(null);
            setProfile(null);
            storeSignOut();
          }
          // Success — Supabase client uses new token internally, no state update needed
          return;
        }

        // SIGNED_OUT event — clean up
        if (event === "SIGNED_OUT") {
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        const u = session?.user ?? null;
        setUser(u);

        if (u) {
          try {
            const p = await withTimeout(loadOrCreateProfile(u), 10000);
            if (p) setProfile(p);
          } catch {
            console.warn("Failed to load profile on auth change");
          }
        }
        if (!u) setProfile(null);

        if (!initialDone) {
          initialDone = true;
          clearTimeout(safetyTimer);
        }
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
      globalThis.__authInitialized = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    storeSignOut();
    globalThis.__authInitialized = false;
  };

  return { user, profile, loading, signOut };
}
