"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AnimatedCounter } from "@/components/shared/AnimatedCounter";
import { OnlineIndicator } from "@/components/shared/OnlineIndicator";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import {
  Camera,
  MapPin,
  Link as LinkIcon,
  MessageCircle,
  UserCheck,
  UserPlus,
  X,
  Loader2,
  MoreHorizontal,
  Ban,
  Settings,
} from "lucide-react";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { cn } from "@/lib/utils";
import { StoryViewer } from "@/components/stories/StoryViewer";
import type { Profile, Story } from "@/lib/supabase";

interface ProfileHeaderProps {
  profile: Profile;
  isOwnProfile: boolean;
  onMessageClick?: () => void;
  onProfileUpdated?: (profile: Profile) => void;
}

export function ProfileHeader({
  profile,
  isOwnProfile,
  onMessageClick,
  onProfileUpdated,
}: ProfileHeaderProps) {
  const { user, setProfile: setStoreProfile } = useAuthStore();
  const router = useRouter();
  const { isBlocked, blockUser, unblockUser } = useBlockedUsers();
  const blocked = isBlocked(profile.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileStories, setProfileStories] = useState<Story[] | null>(null);
  const [hasStories, setHasStories] = useState(false);

  // Check if this user has active stories
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabase
      .from("stories")
      .select("id")
      .eq("user_id", profile.id)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .then(({ data }) => setHasStories((data?.length ?? 0) > 0));
  }, [profile.id]);

  const openStories = async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("stories")
      .select("*, profiles:user_id(id, username, display_name, avatar_url)")
      .eq("user_id", profile.id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });
    if (data && data.length > 0) {
      setProfileStories(data as Story[]);
    }
  };
  const [following, setFollowing] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [localFollowersCount, setLocalFollowersCount] = useState(
    profile.followers_count ?? 0
  );
  const [localFollowingCount, setLocalFollowingCount] = useState(
    profile.following_count ?? 0
  );
  const [editing, setEditing] = useState(false);
  const [showFollowModal, setShowFollowModal] = useState<
    "followers" | "following" | null
  >(null);
  const [followList, setFollowList] = useState<Profile[]>([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Edit form state
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const [website, setWebsite] = useState(profile.website ?? "");
  const [saving, setSaving] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const name = profile.display_name ?? profile.username;

  // Load follow status on mount
  useEffect(() => {
    if (!user || isOwnProfile) return;
    const supabase = getSupabaseBrowserClient();
    supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", profile.id)
      .maybeSingle()
      .then(({ data }) => setFollowing(!!data));
  }, [user, profile.id, isOwnProfile]);

  // Sync local counts when profile prop changes
  useEffect(() => {
    setLocalFollowersCount(profile.followers_count ?? 0);
  }, [profile.followers_count]);

  useEffect(() => {
    setLocalFollowingCount(profile.following_count ?? 0);
  }, [profile.following_count]);

  // Real-time follower/following count updates
  const reloadFollowCounts = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const [{ count: followers }, { count: followingCount }] = await Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profile.id),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id),
    ]);
    setLocalFollowersCount(followers ?? 0);
    setLocalFollowingCount(followingCount ?? 0);
  }, [profile.id]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    // Subscribe to follows where this profile is the target (followers change)
    const channel = supabase
      .channel(`follows:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "follows",
          filter: `following_id=eq.${profile.id}`,
        },
        () => setLocalFollowersCount((c) => c + 1)
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "follows",
          filter: `following_id=eq.${profile.id}`,
        },
        () => setLocalFollowersCount((c) => Math.max(0, c - 1))
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "follows",
          filter: `follower_id=eq.${profile.id}`,
        },
        () => setLocalFollowingCount((c) => c + 1)
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "follows",
          filter: `follower_id=eq.${profile.id}`,
        },
        () => setLocalFollowingCount((c) => Math.max(0, c - 1))
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile.id, reloadFollowCounts]);

  const openFollowModal = async (type: "followers" | "following") => {
    setShowFollowModal(type);
    setFollowList([]);
    const supabase = getSupabaseBrowserClient();
    if (type === "followers") {
      const { data: followRows } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("following_id", profile.id);
      const ids = (followRows ?? []).map((r) => r.follower_id);
      if (ids.length > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .in("id", ids);
        setFollowList((data ?? []) as Profile[]);
      }
    } else {
      const { data: followRows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", profile.id);
      const ids = (followRows ?? []).map((r) => r.following_id);
      if (ids.length > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .in("id", ids);
        setFollowList((data ?? []) as Profile[]);
      }
    }
  };

  const toggleFollow = async () => {
    if (!user || followPending) return;
    setFollowPending(true);
    const supabase = getSupabaseBrowserClient();

    if (following) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", profile.id);
      setFollowing(false);
      setLocalFollowersCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from("follows").insert({
        follower_id: user.id,
        following_id: profile.id,
      });
      setFollowing(true);
      setLocalFollowersCount((c) => c + 1);
    }
    setFollowPending(false);
  };

  const uploadToStorage = async (
    folder: string,
    file: File
  ): Promise<string | null> => {
    if (!user) return null;
    const supabase = getSupabaseBrowserClient();
    const ext = file.name.split(".").pop();
    const path = `${folder}/${user.id}.${ext}`;

    // Remove old file first (ignore errors if it doesn't exist)
    await supabase.storage.from("media").remove([path]);

    const { error: uploadErr } = await supabase.storage
      .from("media")
      .upload(path, file);
    if (uploadErr) {
      console.error(`${folder} upload error:`, uploadErr);
      return null;
    }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  };

  const handleAvatarUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    const url = await uploadToStorage("avatars", file);
    if (!url) {
      setUploadingAvatar(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const { data: updated } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", user.id)
      .select()
      .single();
    if (updated) {
      setStoreProfile(updated as Profile);
      onProfileUpdated?.(updated as Profile);
    }
    setUploadingAvatar(false);
  };

  const handleCoverUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingCover(true);
    const url = await uploadToStorage("covers", file);
    if (!url) {
      setUploadingCover(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const { data: updated } = await supabase
      .from("profiles")
      .update({ cover_url: url })
      .eq("id", user.id)
      .select()
      .single();
    if (updated) {
      setStoreProfile(updated as Profile);
      onProfileUpdated?.(updated as Profile);
    }
    setUploadingCover(false);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName || null,
        bio: bio || null,
        location: location || null,
        website: website || null,
      })
      .eq("id", user.id)
      .select()
      .single();

    if (!error && data) {
      setStoreProfile(data as Profile);
      onProfileUpdated?.(data as Profile);
      setEditing(false);
    }
    setSaving(false);
  };

  return (
    <div>
      {/* Cover photo with gradient overlay */}
      <div className="relative h-40 sm:h-56 bg-gradient-to-br from-purple-600/30 to-emerald-500/20 rounded-3xl overflow-hidden">
        {profile.cover_url && (
          <Image
            src={profile.cover_url}
            alt="Cover"
            fill
            className="object-cover"
            sizes="100vw"
          />
        )}
        {/* Gradient overlay at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--bg-base)] to-transparent" />

        {isOwnProfile && (
          <>
            <button
              onClick={() => router.push("/settings")}
              className="absolute top-3 right-3 z-10 size-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-all duration-150"
              aria-label="Настройки"
            >
              <Settings className="size-4.5" />
            </button>
            <button
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingCover}
              className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-xl text-xs font-medium text-white hover:bg-black/60 transition-all duration-150"
            >
              <Camera className="size-3.5" />
              {uploadingCover ? "Загрузка..." : "Обложка"}
            </button>
          </>
        )}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCoverUpload}
        />
      </div>

      {/* Profile info */}
      <div className="px-4 -mt-10 space-y-4">
        {/* Avatar row */}
        <div className="flex items-end justify-between">
          <div className="relative">
            {/* Animated gradient ring — active when user has stories */}
            <motion.div
              className="absolute -inset-1 rounded-full"
              style={{
                background: hasStories
                  ? "conic-gradient(from 0deg, #a855f7, #00e676, #7c3aed, #a855f7)"
                  : "var(--border)",
              }}
              animate={hasStories ? { rotate: 360 } : {}}
              transition={hasStories ? {
                duration: 4,
                repeat: Infinity,
                ease: "linear",
              } : {}}
            />
            <div
              className={cn("relative rounded-full bg-[var(--bg-base)] p-[3px]", hasStories && "cursor-pointer")}
              onClick={hasStories ? openStories : undefined}
            >
              <Avatar className="size-20">
                {profile.avatar_url ? (
                  <AvatarImage src={profile.avatar_url} alt={name} />
                ) : null}
                <AvatarFallback className="text-lg font-bold bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                  {name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>

            {isOwnProfile ? (
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute bottom-0 right-0 z-10 size-7 rounded-full bg-[var(--accent-blue)] text-white flex items-center justify-center shadow-md hover:bg-[var(--accent-blue)]/80 transition-colors"
                aria-label="Change avatar"
              >
                <Camera className="size-3.5" />
              </button>
            ) : (
              <OnlineIndicator
                isOnline={profile.is_online}
                size="lg"
                className="z-10 ring-[var(--bg-base)]"
              />
            )}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pb-2">
            {isOwnProfile ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(!editing)}
                className="rounded-xl border-[var(--border)] text-[var(--text-primary)]"
              >
                {editing ? "Отмена" : "Редактировать"}
              </Button>
            ) : (
              <>
                {blocked ? (
                  <p className="text-sm text-red-400 bg-red-400/10 px-3 py-1.5 rounded-xl">
                    Пользователь заблокирован
                  </p>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onMessageClick}
                      className="rounded-xl text-[var(--text-secondary)]"
                    >
                      <MessageCircle className="size-4" />
                      Сообщение
                    </Button>
                    <motion.div whileTap={{ scale: 0.95 }}>
                      <Button
                        variant={following ? "outline" : "default"}
                        size="sm"
                        disabled={followPending}
                        onClick={toggleFollow}
                        className={cn(
                          "rounded-xl transition-all duration-300",
                          following
                            ? "border-[var(--accent-blue)]/50 text-[var(--accent-blue)]"
                            : "bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90"
                        )}
                      >
                        {followPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : following ? (
                          <UserCheck className="size-4" />
                        ) : (
                          <UserPlus className="size-4" />
                        )}
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={following ? "following" : "follow"}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.15 }}
                          >
                            {following ? "Подписки" : "Подписаться"}
                          </motion.span>
                        </AnimatePresence>
                      </Button>
                    </motion.div>
                  </>
                )}
                <div className="relative" ref={menuRef}>
                  <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 rounded-xl hover:bg-[var(--bg-elevated)] transition-colors">
                    <MoreHorizontal className="size-5 text-[var(--text-secondary)]" />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-lg z-50 overflow-hidden min-w-[180px]">
                      <button
                        onClick={async () => {
                          if (blocked) { await unblockUser(profile.id); }
                          else { await blockUser(profile.id); }
                          setMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-[var(--bg-surface)] transition-colors"
                      >
                        <Ban className="size-4" />
                        {blocked ? "Разблокировать" : "Заблокировать"}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Name & bio */}
        {editing ? (
          <Dialog open={editing} onOpenChange={setEditing}>
            <DialogContent className="bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-primary)] sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-[var(--text-primary)]">
                  Редактировать профиль
                </DialogTitle>
                <DialogDescription className="text-[var(--text-secondary)]">
                  Обновите информацию о профиле
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Имя
                  </label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-10 rounded-xl bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    О себе
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    maxLength={200}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] resize-none outline-none input-focus transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">
                      Местоположение
                    </label>
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="h-10 rounded-xl bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">
                      Сайт
                    </label>
                    <Input
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="h-10 rounded-xl bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)]"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(false)}
                    className="rounded-xl text-[var(--text-secondary)]"
                  >
                    Отмена
                  </Button>
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={saveProfile}
                    className="rounded-xl bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90"
                  >
                    {saving && (
                      <Loader2 className="size-3.5 animate-spin mr-1" />
                    )}
                    Сохранить
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}

        <div className="space-y-2">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">
              {name}
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              @{profile.username}
            </p>
          </div>
          {profile.bio && (
            <p className="text-sm text-[var(--text-primary)] leading-relaxed">
              {profile.bio}
            </p>
          )}

          {/* Location & website info row */}
          <div className="flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
            {profile.location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" />
                {profile.location}
              </span>
            )}
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[var(--accent-blue)] hover:underline"
              >
                <LinkIcon className="size-3.5" />
                {profile.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        </div>

        {/* Stats row with AnimatedCounter */}
        <div className="flex gap-6 py-3 border-t border-[var(--border)]">
          <div className="text-center">
            <AnimatedCounter
              value={profile.posts_count ?? 0}
              className="text-lg font-bold text-[var(--text-primary)]"
            />
            <p className="text-xs text-[var(--text-secondary)]">Посты</p>
          </div>
          <button
            onClick={() => openFollowModal("followers")}
            className="text-center hover:opacity-70 transition-opacity"
          >
            <AnimatedCounter
              value={localFollowersCount}
              className="text-lg font-bold text-[var(--text-primary)]"
            />
            <p className="text-xs text-[var(--text-secondary)]">Подписчики</p>
          </button>
          <button
            onClick={() => openFollowModal("following")}
            className="text-center hover:opacity-70 transition-opacity"
          >
            <AnimatedCounter
              value={localFollowingCount}
              className="text-lg font-bold text-[var(--text-primary)]"
            />
            <p className="text-xs text-[var(--text-secondary)]">Подписки</p>
          </button>
        </div>
      </div>

      {/* Followers / Following modal */}
      <Dialog
        open={showFollowModal !== null}
        onOpenChange={(open) => {
          if (!open) setShowFollowModal(null);
        }}
      >
        <DialogContent className="bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-primary)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-primary)]">
              {showFollowModal === "followers" ? "Подписчики" : "Подписки"}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto -mx-4 divide-y divide-[var(--border)]">
            {followList.length === 0 ? (
              <p className="text-center text-[var(--text-secondary)] text-sm py-10">
                Пока нет пользователей
              </p>
            ) : (
              followList.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setShowFollowModal(null);
                    router.push(`/profile/${u.username}`);
                  }}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  <Avatar className="size-8">
                    {u.avatar_url ? (
                      <AvatarImage
                        src={u.avatar_url}
                        alt={u.display_name ?? u.username}
                      />
                    ) : null}
                    <AvatarFallback className="text-xs bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                      {(u.display_name ?? u.username).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {u.display_name ?? u.username}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      @{u.username}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Story viewer */}
      {profileStories && (
        <StoryViewer
          stories={profileStories}
          startIndex={0}
          onClose={() => setProfileStories(null)}
        />
      )}
    </div>
  );
}
