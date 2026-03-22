"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { motion } from "framer-motion";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AuthPage() {
  const router = useRouter();

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
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="relative min-h-dvh flex items-center justify-center p-4 bg-[var(--bg-base)] overflow-hidden">
      {/* Animated gradient orbs */}
      <motion.div
        className="absolute top-[-10%] left-[15%] w-[28rem] h-[28rem] rounded-full bg-[var(--accent-blue)]/10 blur-[100px]"
        animate={{
          x: [0, 30, -20, 0],
          y: [0, -40, 20, 0],
          scale: [1, 1.1, 0.95, 1],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-5%] right-[10%] w-[24rem] h-[24rem] rounded-full bg-emerald-500/8 blur-[100px]"
        animate={{
          x: [0, -25, 15, 0],
          y: [0, 30, -25, 0],
          scale: [1, 0.9, 1.05, 1],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[40%] right-[30%] w-[16rem] h-[16rem] rounded-full bg-purple-500/6 blur-[80px]"
        animate={{
          x: [0, 20, -10, 0],
          y: [0, -15, 25, 0],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Main content */}
      <motion.div
        className="relative z-10 w-full max-w-sm"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 to-emerald-400 bg-clip-text text-transparent">
            Pals
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            Connect with your people
          </p>
        </div>

        {/* Card */}
        <GlassPanel intensity="strong" className="rounded-3xl p-6">
          <Tabs defaultValue="login">
            <TabsList className="w-full mb-6 bg-[var(--bg-elevated)] rounded-2xl p-1">
              <TabsTrigger
                value="login"
                className="flex-1 rounded-xl py-2 text-sm font-semibold data-active:bg-[var(--bg-surface)] data-active:text-[var(--text-primary)] data-active:shadow-sm text-[var(--text-secondary)]"
              >
                Sign In
              </TabsTrigger>
              <TabsTrigger
                value="register"
                className="flex-1 rounded-xl py-2 text-sm font-semibold data-active:bg-[var(--bg-surface)] data-active:text-[var(--text-primary)] data-active:shadow-sm text-[var(--text-secondary)]"
              >
                Register
              </TabsTrigger>
            </TabsList>

            {/* Login Tab */}
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Email
                  </label>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    autoComplete="email"
                    className="h-10 rounded-xl bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Password
                  </label>
                  <Input
                    type="password"
                    placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-10 rounded-xl bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50"
                  />
                </div>

                {loginError && (
                  <div className="text-sm text-red-400 bg-red-500/10 rounded-xl px-3 py-2.5">
                    {loginError}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full h-10 rounded-xl bg-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/90 text-white font-semibold"
                >
                  {loginLoading && <Loader2 className="size-4 animate-spin mr-2" />}
                  Sign In
                </Button>
              </form>
            </TabsContent>

            {/* Register Tab */}
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Username
                  </label>
                  <Input
                    type="text"
                    placeholder="yourname"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value.toLowerCase())}
                    autoComplete="username"
                    className="h-10 rounded-xl bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50"
                  />
                  <p className="text-xs text-[var(--text-secondary)]/70">
                    3-30 chars, lowercase, no spaces
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Email
                  </label>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    autoComplete="email"
                    className="h-10 rounded-xl bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Password
                  </label>
                  <Input
                    type="password"
                    placeholder="Min. 8 characters"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    autoComplete="new-password"
                    className="h-10 rounded-xl bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Date of Birth
                  </label>
                  <Input
                    type="date"
                    value={regDob}
                    onChange={(e) => setRegDob(e.target.value)}
                    className="h-10 rounded-xl bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)]"
                  />
                </div>

                {regError && (
                  <div className="text-sm text-red-400 bg-red-500/10 rounded-xl px-3 py-2.5">
                    {regError}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={regLoading}
                  className="w-full h-10 rounded-xl bg-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/90 text-white font-semibold"
                >
                  {regLoading && <Loader2 className="size-4 animate-spin mr-2" />}
                  Create Account
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs text-[var(--text-secondary)]">or</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* Google OAuth */}
          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-[var(--border)] bg-transparent hover:bg-[var(--bg-elevated)] transition-all duration-150 active:scale-[0.98]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span className="text-sm font-medium text-[var(--text-primary)]">
              Continue with Google
            </span>
          </button>
        </GlassPanel>
      </motion.div>
    </div>
  );
}
