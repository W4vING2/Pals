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

    // Get initial session once
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        const p = await loadOrCreateProfile(u);
        if (p) setProfile(p);
      }
      setLoading(false);
    });

    // Single auth state listener for the whole app
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        if (u && event !== "INITIAL_SESSION") {
          const p = await loadOrCreateProfile(u);
          if (p) setProfile(p);
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
