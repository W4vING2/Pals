"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useThemeStore, useAuthStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Profile } from "@/lib/supabase";

export default function SettingsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { profile, setProfile } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();

  // Profile section
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Account section
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  // Danger zone
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  React.useEffect(() => {
    if (!user) router.replace("/auth");
  }, [user, router]);

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
      })
      .eq("id", user.id)
      .select()
      .single();
    if (data) {
      setProfile(data as Profile);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    }
    setSavingProfile(false);
  };

  const changePassword = async () => {
    setPasswordError(null);
    if (!newPassword || !confirmPassword) {
      setPasswordError("Please fill in all fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    setSavingPassword(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordError(error.message);
    } else {
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSaved(false), 2000);
    }
    setSavingPassword(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== profile?.username) return;
    setDeleting(true);
    // Sign out and rely on backend to clean up
    await signOut();
    router.replace("/auth");
    setDeleting(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <h1 className="text-2xl font-bold font-display text-[var(--text-primary)]">Settings</h1>

      {/* ── Profile Section ── */}
      <section className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] p-6 space-y-4">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Profile</h2>
        <Input
          label="Display Name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your display name"
          maxLength={50}
        />
        <div>
          <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1.5">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell people about yourself…"
            rows={3}
            maxLength={200}
            className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] resize-none focus:outline-none focus:border-[var(--accent-blue)] transition-all duration-150"
          />
          <p className="text-xs text-[var(--text-secondary)] text-right mt-1">{bio.length}/200</p>
        </div>
        <div className="flex items-center justify-between">
          {profileSaved && (
            <span className="text-sm text-[var(--accent-mint)]">✓ Saved</span>
          )}
          <Button onClick={saveProfile} loading={savingProfile} className="ml-auto">
            Save Profile
          </Button>
        </div>
      </section>

      {/* ── Account Section ── */}
      <section className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] p-6 space-y-4">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Account</h2>
        <div className="py-2">
          <p className="text-xs text-[var(--text-secondary)] mb-1">Email</p>
          <p className="text-sm text-[var(--text-primary)] font-medium">{user?.email}</p>
        </div>
        <div className="border-t border-[var(--border)] pt-4 space-y-3">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Change Password</p>
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min. 8 characters"
            autoComplete="new-password"
          />
          <Input
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password"
            autoComplete="new-password"
          />
          {passwordError && (
            <p className="text-sm text-red-400 bg-red-400/10 rounded-xl px-3 py-2">{passwordError}</p>
          )}
          <div className="flex items-center justify-between">
            {passwordSaved && <span className="text-sm text-[var(--accent-mint)]">✓ Password updated</span>}
            <Button onClick={changePassword} loading={savingPassword} variant="secondary" className="ml-auto">
              Update Password
            </Button>
          </div>
        </div>
      </section>

      {/* ── Appearance Section ── */}
      <section className="bg-[var(--bg-surface)] rounded-3xl border border-[var(--border)] p-6 space-y-4">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Appearance</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Theme</p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Currently: {theme === "dark" ? "Dark" : "Light"} mode
            </p>
          </div>
          <button
            onClick={toggleTheme}
            className={`relative w-14 h-7 rounded-full transition-all duration-300 ${
              theme === "dark" ? "bg-[var(--accent-blue)]" : "bg-[var(--border-strong)]"
            }`}
            aria-label="Toggle theme"
          >
            <span
              className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform duration-300 flex items-center justify-center ${
                theme === "dark" ? "translate-x-7" : "translate-x-0.5"
              }`}
            >
              {theme === "dark" ? (
                <svg className="w-3.5 h-3.5 text-[var(--accent-blue)]" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6 .278a.768.768 0 01.08.858 7.208 7.208 0 00-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 01.81.316.733.733 0 01-.031.893A8.349 8.349 0 018.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 016 .278z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 12a4 4 0 100-8 4 4 0 000 8zM8 0a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2A.5.5 0 018 0zm0 13a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2A.5.5 0 018 13zm8-5a.5.5 0 01-.5.5h-2a.5.5 0 010-1h2a.5.5 0 01.5.5zM3 8a.5.5 0 01-.5.5h-2a.5.5 0 010-1h2A.5.5 0 013 8zm10.657-5.657a.5.5 0 010 .707l-1.414 1.415a.5.5 0 11-.707-.708l1.414-1.414a.5.5 0 01.707 0zm-9.193 9.193a.5.5 0 010 .707L3.05 13.657a.5.5 0 01-.707-.707l1.414-1.414a.5.5 0 01.707 0zm9.193 2.121a.5.5 0 01-.707 0l-1.414-1.414a.5.5 0 01.707-.707l1.414 1.414a.5.5 0 010 .707zM4.464 4.465a.5.5 0 01-.707 0L2.343 3.05a.5.5 0 11.707-.707l1.414 1.414a.5.5 0 010 .707z" />
                </svg>
              )}
            </span>
          </button>
        </div>
      </section>

      {/* ── Danger Zone ── */}
      <section className="bg-red-500/5 rounded-3xl border border-red-500/20 p-6 space-y-4">
        <h2 className="text-base font-semibold text-red-400">Danger Zone</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Deleting your account is irreversible. All your posts, messages, and data will be permanently removed.
        </p>
        <div>
          <Input
            label={`Type your username "${profile?.username}" to confirm`}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={profile?.username}
            error={deleteConfirm && deleteConfirm !== profile?.username ? "Username doesn't match" : undefined}
          />
        </div>
        <Button
          variant="danger"
          onClick={handleDeleteAccount}
          loading={deleting}
          disabled={deleteConfirm !== profile?.username}
          className="w-full"
        >
          Delete Account
        </Button>
      </section>
    </div>
  );
}
