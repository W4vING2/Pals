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
import { Loader2, Check, AlertTriangle, Ban, Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/Avatar";
import { isPushSupported, subscribeToPush, unsubscribeFromPush, isSubscribedToPush } from "@/lib/push";
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

  // Push notifications
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // Blocked users
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(true);

  // Danger zone
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  React.useEffect(() => {
    if (!user) router.replace("/auth");
  }, [user, router]);

  // Check push notification status
  React.useEffect(() => {
    isPushSupported().then(setPushSupported);
    isSubscribedToPush().then(setPushEnabled);
  }, []);

  const loadBlockedUsers = React.useCallback(async () => {
    if (!user) return;
    setLoadingBlocked(true);
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("blocked_users")
      .select("blocked_id, profiles:blocked_id(id, username, display_name, avatar_url)")
      .eq("blocker_id", user.id);
    setBlockedUsers(data ?? []);
    setLoadingBlocked(false);
  }, [user]);

  React.useEffect(() => {
    loadBlockedUsers();
  }, [loadBlockedUsers]);

  const handleUnblock = async (blockedId: string) => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    await supabase.from("blocked_users").delete().eq("blocker_id", user.id).eq("blocked_id", blockedId);
    setBlockedUsers((prev) => prev.filter((b) => b.blocked_id !== blockedId));
  };

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

        {/* Push Notifications */}
        {pushSupported && (
          <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
            <CardHeader>
              <CardTitle className="text-[var(--text-primary)] flex items-center gap-2">
                {pushEnabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
                Уведомления
              </CardTitle>
              <CardDescription className="text-[var(--text-secondary)]">
                Push-уведомления о новых сообщениях
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--text-primary)]">
                    {pushEnabled ? "Уведомления включены" : "Уведомления выключены"}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {pushEnabled
                      ? "Вы будете получать уведомления о новых сообщениях"
                      : "Включите, чтобы не пропускать сообщения"}
                  </p>
                </div>
                <Button
                  variant={pushEnabled ? "secondary" : "default"}
                  size="sm"
                  disabled={pushLoading}
                  onClick={async () => {
                    if (!user) return;
                    setPushLoading(true);
                    if (pushEnabled) {
                      await unsubscribeFromPush(user.id);
                      setPushEnabled(false);
                    } else {
                      const ok = await subscribeToPush(user.id);
                      setPushEnabled(ok);
                    }
                    setPushLoading(false);
                  }}
                >
                  {pushLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : pushEnabled ? (
                    "Выключить"
                  ) : (
                    "Включить"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Blocked Users */}
        <Card className="bg-[var(--bg-surface)] border-[var(--border)]">
          <CardHeader>
            <CardTitle className="text-[var(--text-primary)] flex items-center gap-2">
              <Ban className="size-4" />
              Заблокированные
            </CardTitle>
            <CardDescription className="text-[var(--text-secondary)]">
              Пользователи, которых вы заблокировали
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingBlocked ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-5 animate-spin text-[var(--text-secondary)]" />
              </div>
            ) : blockedUsers.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] text-center py-6">
                Нет заблокированных пользователей
              </p>
            ) : (
              <div className="space-y-2">
                {blockedUsers.map((item) => {
                  const p = item.profiles;
                  if (!p) return null;
                  const name = p.display_name ?? p.username;
                  return (
                    <div
                      key={item.blocked_id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          {p.avatar_url ? (
                            <AvatarImage src={p.avatar_url} alt={name} />
                          ) : null}
                          <AvatarFallback className="text-xs bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                            {name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">{name}</p>
                          <p className="text-xs text-[var(--text-secondary)]">@{p.username}</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnblock(item.blocked_id)}
                        className="rounded-xl border-[var(--border)] text-red-400 hover:bg-red-400/10"
                      >
                        Разблокировать
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
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
