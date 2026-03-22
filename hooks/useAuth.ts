"use client";

import { useEffect, useState } from "react";
import type { User, AuthError } from "@supabase/supabase-js";
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

/** Clear corrupted auth state and sign out gracefully */
async function handleAuthError(supabase: ReturnType<typeof getSupabaseBrowserClient>) {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // signOut itself may fail if session is broken — that's OK
  }
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

    // Get initial session with timeout (8s max)
    withTimeout(supabase.auth.getSession(), 8000)
      .then(async ({ data: { session }, error }) => {
        // Handle invalid/expired refresh token
        if (error) {
          console.warn("Session error, clearing auth state:", error.message);
          await handleAuthError(supabase);
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          try {
            const p = await withTimeout(loadOrCreateProfile(u), 8000);
            if (p) setProfile(p);
          } catch {
            console.warn("Failed to load profile, continuing without it");
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        console.warn("Auth getSession timeout/error:", err);
        // Don't block the app — set loading false anyway
        setLoading(false);
      });

    // Single auth state listener for the whole app
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // TOKEN_REFRESHED with null session means refresh failed
        if (event === "TOKEN_REFRESHED" && !session) {
          console.warn("Token refresh failed, signing out");
          await handleAuthError(supabase);
          setUser(null);
          setProfile(null);
          storeSignOut();
          setLoading(false);
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
        if (u && event !== "INITIAL_SESSION") {
          try {
            const p = await loadOrCreateProfile(u);
            if (p) setProfile(p);
          } catch {
            console.warn("Failed to load profile on auth change");
          }
        }
        if (!u) setProfile(null);
        setLoading(false);
      }
    );

    return () => {
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
