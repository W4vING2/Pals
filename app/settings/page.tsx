"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { PageTransition } from "@/components/layout/PageTransition";
import { Loader2, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/supabase";

export default function SettingsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { profile, setProfile } = useAuthStore();

  // Profile section
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Account section
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

  const saveProfileHandler = async () => {
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
      setPasswordError("Заполните все поля");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Пароли не совпадают");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Пароль минимум 8 символов");
      return;
    }
    setSavingPassword(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) {
      setPasswordError(error.message);
    } else {
      setPasswordSaved(true);
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
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Настройки
        </h1>

        {/* Profile Section */}
        <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
          <CardHeader>
            <CardTitle className="text-[var(--text-primary)]">
              Профиль
            </CardTitle>
            <CardDescription className="text-[var(--text-secondary)]">
              Обновите информацию вашего профиля
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Отображаемое имя
              </label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ваше имя"
                maxLength={50}
                className="h-10 rounded-xl bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                О себе
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Расскажите о себе..."
                rows={3}
                maxLength={200}
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 resize-none outline-none input-focus transition-colors"
              />
              <p className="text-xs text-[var(--text-secondary)] text-right">
                {bio.length}/200
              </p>
            </div>
            <div className="flex items-center justify-between pt-1">
              {profileSaved && (
                <span className="flex items-center gap-1 text-sm text-emerald-400">
                  <Check className="size-3.5" />
                  Сохранено
                </span>
              )}
              <Button
                onClick={saveProfileHandler}
                disabled={savingProfile}
                className="ml-auto rounded-xl bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90"
              >
                {savingProfile && (
                  <Loader2 className="size-3.5 animate-spin mr-1" />
                )}
                Сохранить
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Account Section */}
        <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
          <CardHeader>
            <CardTitle className="text-[var(--text-primary)]">
              Аккаунт
            </CardTitle>
            <CardDescription className="text-[var(--text-secondary)]">
              Управление настройками аккаунта
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="py-2">
              <p className="text-xs text-[var(--text-secondary)] mb-1">Почта</p>
              <p className="text-sm text-[var(--text-primary)] font-medium">
                {user?.email}
              </p>
            </div>

            <div className="border-t border-[var(--border)] pt-4 space-y-4">
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                Смена пароля
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Новый пароль
                </label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Мин. 8 символов"
                  autoComplete="new-password"
                  className="h-10 rounded-xl bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  Подтвердите пароль
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Повторите новый пароль"
                  autoComplete="new-password"
                  className="h-10 rounded-xl bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50"
                />
              </div>

              {passwordError && (
                <div className="text-sm text-red-400 bg-red-500/10 rounded-xl px-3 py-2.5">
                  {passwordError}
                </div>
              )}

              <div className="flex items-center justify-between">
                {passwordSaved && (
                  <span className="flex items-center gap-1 text-sm text-emerald-400">
                    <Check className="size-3.5" />
                    Пароль обновлён
                  </span>
                )}
                <Button
                  onClick={changePassword}
                  disabled={savingPassword}
                  variant="outline"
                  className="ml-auto rounded-xl border-[var(--border)] text-[var(--text-primary)]"
                >
                  {savingPassword && (
                    <Loader2 className="size-3.5 animate-spin mr-1" />
                  )}
                  Обновить пароль
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="bg-red-500/5 border-red-500/20">
          <CardHeader>
            <CardTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="size-4" />
              Опасная зона
            </CardTitle>
            <CardDescription className="text-[var(--text-secondary)]">
              Удаление аккаунта необратимо. Все ваши посты, сообщения и данные будут удалены навсегда.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Введите ваше имя пользователя &quot;{profile?.username}&quot; для подтверждения
              </label>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={profile?.username}
                className={cn(
                  "h-10 rounded-xl bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50",
                  deleteConfirm &&
                    deleteConfirm !== profile?.username &&
                    "border-red-500/50 focus-visible:border-red-500"
                )}
              />
              {deleteConfirm && deleteConfirm !== profile?.username && (
                <p className="text-xs text-red-400">
                  Имя пользователя не совпадает
                </p>
              )}
            </div>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleting || deleteConfirm !== profile?.username}
              className="w-full rounded-xl"
            >
              {deleting && (
                <Loader2 className="size-3.5 animate-spin mr-1" />
              )}
              Удалить аккаунт
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
