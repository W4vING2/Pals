"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Tab = "login" | "register";

export default function AuthPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Register state
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regDob, setRegDob] = useState("");
  const [regError, setRegError] = useState<string | null>(null);
  const [regLoading, setRegLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!loginEmail || !loginPassword) {
      setLoginError("Please fill in all fields");
      return;
    }
    setLoginLoading(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error) {
      setLoginError(error.message);
    } else {
      router.push("/");
    }
    setLoginLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);

    if (!regEmail || !regPassword || !regUsername) {
      setRegError("Username, email and password are required");
      return;
    }
    if (regPassword.length < 8) {
      setRegError("Password must be at least 8 characters");
      return;
    }
    if (!/^[a-z0-9_]{3,30}$/.test(regUsername)) {
      setRegError("Username must be 3-30 chars, lowercase letters, numbers, underscores");
      return;
    }

    setRegLoading(true);
    const supabase = getSupabaseBrowserClient();

    // Check username availability
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", regUsername)
      .maybeSingle();

    if (existing) {
      setRegError("Username already taken");
      setRegLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: regEmail,
      password: regPassword,
      options: {
        data: { username: regUsername, date_of_birth: regDob || null },
      },
    });

    if (error) {
      setRegError(error.message);
    } else if (data.user) {
      // Insert profile
      await supabase.from("profiles").insert({
        id: data.user.id,
        username: regUsername,
        date_of_birth: regDob || null,
        display_name: null,
      });
      router.push("/");
    }
    setRegLoading(false);
  };

  const handleGoogle = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 bg-[var(--bg-base)]">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[var(--accent-blue)]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-[var(--accent-mint)]/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold font-display gradient-text">Pals</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2">Connect with your people</p>
        </div>

        {/* Card */}
        <div className="glass-strong rounded-3xl p-6 shadow-[var(--shadow-lg)]">
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-[var(--bg-elevated)] rounded-2xl mb-6">
            {(["login", "register"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all duration-150 capitalize ${
                  tab === t
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t === "login" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>

          {tab === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                autoComplete="email"
              />
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete="current-password"
              />
              {loginError && (
                <p className="text-sm text-red-400 bg-red-400/10 rounded-xl px-3 py-2">
                  {loginError}
                </p>
              )}
              <Button type="submit" loading={loginLoading} className="w-full">
                Sign In
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <Input
                label="Username"
                type="text"
                placeholder="yourname"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value.toLowerCase())}
                autoComplete="username"
                helperText="3-30 chars, lowercase, no spaces"
              />
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                autoComplete="email"
              />
              <Input
                label="Password"
                type="password"
                placeholder="Min. 8 characters"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                autoComplete="new-password"
              />
              <Input
                label="Date of Birth"
                type="date"
                value={regDob}
                onChange={(e) => setRegDob(e.target.value)}
              />
              {regError && (
                <p className="text-sm text-red-400 bg-red-400/10 rounded-xl px-3 py-2">
                  {regError}
                </p>
              )}
              <Button type="submit" loading={regLoading} className="w-full">
                Create Account
              </Button>
            </form>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--text-secondary)]">or</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* Google */}
          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--border-strong)] transition-all duration-150 active:scale-[0.98]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span className="text-sm font-medium text-[var(--text-primary)]">Continue with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
}
