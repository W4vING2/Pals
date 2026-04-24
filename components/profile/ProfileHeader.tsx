"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/Avatar";
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
import { StoryViewer } from "@/components/stories/StoryViewer";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  AtSign,
  Ban,
  Camera,
  CalendarDays,
  Link as LinkIcon,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  Video,
  UserCheck,
  UserPlus,
} from "lucide-react";
import type { Profile, Story } from "@/lib/supabase";

const revealTransition = {
  duration: 0.46,
  ease: [0.22, 1, 0.36, 1] as const,
};

const revealVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...revealTransition, delay },
  }),
};

interface ProfileHeaderProps {
  profile: Profile;
  isOwnProfile: boolean;
  onMessageClick?: () => void;
  onCallClick?: (type: "voice" | "video") => void;
  onProfileUpdated?: (profile: Profile) => void;
}

function formatBirthday(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const hadBirthday =
    now.getMonth() > date.getMonth() ||
    (now.getMonth() === date.getMonth() && now.getDate() >= date.getDate());
  if (!hadBirthday) age -= 1;

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }) + (age >= 0 ? ` (${age} years old)` : "");
}

function ProfileAvatar({
  profile,
  name,
  hasStories,
  isOwnProfile,
  uploadingAvatar,
  onOpenStories,
  onAvatarClick,
}: {
  profile: Profile;
  name: string;
  hasStories: boolean;
  isOwnProfile: boolean;
  uploadingAvatar: boolean;
  onOpenStories: () => void;
  onAvatarClick: () => void;
}) {
  return (
    <div className="relative mx-auto h-28 w-28 sm:h-32 sm:w-32">
      <motion.div
        className="absolute -inset-1 rounded-full"
        style={{
          background: hasStories
            ? "conic-gradient(from 0deg, #df5cff, #748cff, #7df7ff, #df5cff)"
            : "linear-gradient(135deg, rgba(130,150,255,0.65), rgba(219,80,255,0.65))",
        }}
        animate={hasStories ? { rotate: 360 } : {}}
        transition={hasStories ? { duration: 4, repeat: Infinity, ease: "linear" } : {}}
      />
      <button
        type="button"
        onClick={hasStories ? onOpenStories : undefined}
        className={cn(
          "relative h-full w-full overflow-hidden rounded-full border-[5px] border-[#030307] bg-gradient-to-br from-[#8aa3ff] via-[#6b67ff] to-[#d64cff] text-4xl font-bold text-white shadow-[0_28px_60px_rgba(91,74,255,0.36)]",
          hasStories && "cursor-pointer"
        )}
        aria-label={hasStories ? "Открыть истории" : undefined}
      >
        {profile.avatar_url ? (
          <Image src={profile.avatar_url} alt={name} fill className="object-cover" sizes="144px" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>

      {isOwnProfile ? (
        <button
          type="button"
          onClick={onAvatarClick}
          disabled={uploadingAvatar}
          className="glass-button glass-icon-button absolute bottom-1 right-1 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white"
          aria-label="Сменить аватар"
        >
          {uploadingAvatar ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
        </button>
      ) : (
        <OnlineIndicator isOnline={profile.is_online} size="lg" className="z-10 ring-[#030307]" />
      )}
    </div>
  );
}

export function ProfileHeader({
  profile,
  isOwnProfile,
  onMessageClick,
  onCallClick,
  onProfileUpdated,
}: ProfileHeaderProps) {
  const { user, setProfile: setStoreProfile } = useAuthStore();
  const router = useRouter();
  const { isBlocked, blockUser, unblockUser } = useBlockedUsers();
  const blocked = isBlocked(profile.id);
  const [profileStories, setProfileStories] = useState<Story[] | null>(null);
  const [hasStories, setHasStories] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [localFollowersCount, setLocalFollowersCount] = useState(profile.followers_count ?? 0);
  const [localFollowingCount, setLocalFollowingCount] = useState(profile.following_count ?? 0);
  const [editing, setEditing] = useState(false);
  const [showFollowModal, setShowFollowModal] = useState<"followers" | "following" | null>(null);
  const [followList, setFollowList] = useState<Profile[]>([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const [website, setWebsite] = useState(profile.website ?? "");
  const [saving, setSaving] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const name = profile.display_name ?? profile.username;
  const birthday = formatBirthday(profile.date_of_birth);
  const statusLabel = profile.is_online || isOwnProfile ? "online" : "last seen recently";

  useEffect(() => {
    setDisplayName(profile.display_name ?? "");
    setBio(profile.bio ?? "");
    setLocation(profile.location ?? "");
    setWebsite(profile.website ?? "");
  }, [profile.bio, profile.display_name, profile.location, profile.website]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
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
    if (data && data.length > 0) setProfileStories(data as Story[]);
  };

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

  useEffect(() => setLocalFollowersCount(profile.followers_count ?? 0), [profile.followers_count]);
  useEffect(() => setLocalFollowingCount(profile.following_count ?? 0), [profile.following_count]);

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
    const channel = supabase
      .channel(`follows:${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "follows", filter: `following_id=eq.${profile.id}` }, () => setLocalFollowersCount((c) => c + 1))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "follows", filter: `following_id=eq.${profile.id}` }, () => setLocalFollowersCount((c) => Math.max(0, c - 1)))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "follows", filter: `follower_id=eq.${profile.id}` }, () => setLocalFollowingCount((c) => c + 1))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "follows", filter: `follower_id=eq.${profile.id}` }, () => setLocalFollowingCount((c) => Math.max(0, c - 1)))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile.id, reloadFollowCounts]);

  const openFollowModal = async (type: "followers" | "following") => {
    setShowFollowModal(type);
    setFollowList([]);
    const supabase = getSupabaseBrowserClient();
    const idColumn = type === "followers" ? "follower_id" : "following_id";
    const filterColumn = type === "followers" ? "following_id" : "follower_id";
    const { data: followRows } = await supabase
      .from("follows")
      .select(idColumn)
      .eq(filterColumn, profile.id);
    const ids = (followRows ?? []).map((row) => row[idColumn as keyof typeof row] as string);
    if (ids.length > 0) {
      const { data } = await supabase.from("profiles").select("*").in("id", ids);
      setFollowList((data ?? []) as Profile[]);
    }
  };

  const toggleFollow = async () => {
    if (!user || followPending) return;
    setFollowPending(true);
    const supabase = getSupabaseBrowserClient();

    if (following) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profile.id);
      setFollowing(false);
      setLocalFollowersCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: profile.id });
      setFollowing(true);
      setLocalFollowersCount((c) => c + 1);
    }
    setFollowPending(false);
  };

  const uploadToStorage = async (folder: string, file: File): Promise<string | null> => {
    if (!user) return null;
    const supabase = getSupabaseBrowserClient();
    const ext = file.name.split(".").pop();
    const path = `${folder}/${user.id}.${ext}`;
    await supabase.storage.from("media").remove([path]);
    const { error: uploadErr } = await supabase.storage.from("media").upload(path, file);
    if (uploadErr) {
      console.error(`${folder} upload error:`, uploadErr);
      return null;
    }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    const url = await uploadToStorage("avatars", file);
    if (!url) {
      setUploadingAvatar(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const { data: updated } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id).select().single();
    if (updated) {
      setStoreProfile(updated as Profile);
      onProfileUpdated?.(updated as Profile);
    }
    setUploadingAvatar(false);
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingCover(true);
    const url = await uploadToStorage("covers", file);
    if (!url) {
      setUploadingCover(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const { data: updated } = await supabase.from("profiles").update({ cover_url: url }).eq("id", user.id).select().single();
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

  const scrollToPosts = () => {
    document.getElementById("profile-posts")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleBlockToggle = async () => {
    if (blocked) await unblockUser(profile.id);
    else await blockUser(profile.id);
  };

  return (
    <section className="relative overflow-hidden bg-[#030307] px-4 pb-5 pt-[calc(env(safe-area-inset-top,0px)+0.6rem)] text-white">
      <div className="pointer-events-none absolute inset-0">
        {profile.cover_url ? (
          <Image src={profile.cover_url} alt="" fill className="object-cover opacity-20 blur-xl scale-110" sizes="100vw" />
        ) : null}
        <motion.div
          className="absolute -left-14 top-16 h-44 w-44 rounded-full bg-[#7a67ff]/16 blur-3xl"
          animate={{ y: [0, -10, 0], scale: [1, 1.04, 1] }}
          transition={{ duration: 7.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-[-2.5rem] top-1/3 h-52 w-52 rounded-full bg-[#ea62ff]/12 blur-3xl"
          animate={{ y: [0, 12, 0], scale: [1.02, 0.98, 1.02] }}
          transition={{ duration: 8.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(107,103,255,0.20),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.10),#030307_72%)]" />
      </div>

      <motion.div
        custom={0}
        variants={revealVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 mx-auto flex max-w-2xl items-center justify-between"
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="glass-button glass-icon-button flex h-12 w-12 items-center justify-center rounded-full text-white"
          aria-label="Назад"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>

        {isOwnProfile ? (
          <div className="glass-pill flex items-center rounded-full p-1.5">
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingCover}
              className="glass-button flex h-10 w-10 items-center justify-center rounded-full text-white/80 hover:text-white"
              aria-label="Сменить обложку"
            >
              {uploadingCover ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="glass-button rounded-full px-4 py-2 text-[17px] font-semibold text-white"
            >
              Edit
            </button>
          </div>
        ) : (
          <div className="h-12 w-12" aria-hidden="true" />
        )}
      </motion.div>

      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />

      <motion.div
        custom={0.08}
        variants={revealVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 mx-auto mt-3 max-w-2xl text-center"
      >
        <ProfileAvatar
          profile={profile}
          name={name}
          hasStories={hasStories}
          isOwnProfile={isOwnProfile}
          uploadingAvatar={uploadingAvatar}
          onOpenStories={openStories}
          onAvatarClick={() => avatarInputRef.current?.click()}
        />

        <h1 className="mt-4 text-[29px] font-semibold leading-tight tracking-[0.01em] text-white sm:text-[34px]">
          {name}
        </h1>
        <div className="mt-1 flex items-center justify-center gap-2 text-[18px] text-white/58">
          {isOwnProfile ? <span className="rounded-md bg-[#d95cff]/80 px-1.5 text-sm font-bold text-white">1</span> : null}
          <span>{statusLabel}</span>
        </div>
      </motion.div>

      {!isOwnProfile && (
        <motion.div
          custom={0.14}
          variants={revealVariants}
          initial="hidden"
          animate="visible"
          className="relative z-10 mx-auto mt-6 grid max-w-2xl grid-cols-3 gap-2.5 sm:grid-cols-6"
        >
          <button
            type="button"
            onClick={onMessageClick}
            disabled={blocked}
            className="glass-button glass-action-card flex h-16 flex-col items-center justify-center gap-1 rounded-[1.25rem] text-[#f06dff] disabled:opacity-45"
          >
            <MessageCircle className="h-5 w-5" />
            <span className="text-xs">message</span>
          </button>
          <button
            type="button"
            onClick={toggleFollow}
            disabled={followPending || blocked}
            className="glass-button glass-action-card flex h-16 flex-col items-center justify-center gap-1 rounded-[1.25rem] text-[#f06dff] disabled:opacity-45"
          >
            {followPending ? <Loader2 className="h-5 w-5 animate-spin" /> : following ? <UserCheck className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
            <span className="text-xs">{following ? "following" : "follow"}</span>
          </button>
          <button
            type="button"
            onClick={scrollToPosts}
            className="glass-button glass-action-card flex h-16 flex-col items-center justify-center gap-1 rounded-[1.25rem] text-[#f06dff]"
          >
            <Search className="h-5 w-5" />
            <span className="text-xs">posts</span>
          </button>
          <button
            type="button"
            onClick={handleBlockToggle}
            className="glass-button glass-action-card flex h-16 flex-col items-center justify-center gap-1 rounded-[1.25rem] text-[#ff6d91]"
          >
            <Ban className="h-5 w-5" />
            <span className="text-xs">{blocked ? "unblock" : "block"}</span>
          </button>
          <button
            type="button"
            onClick={() => onCallClick?.("voice")}
            disabled={blocked}
            className="glass-button glass-action-card flex h-16 flex-col items-center justify-center gap-1 rounded-[1.25rem] text-[#f06dff] disabled:opacity-45"
          >
            <Phone className="h-5 w-5" />
            <span className="text-xs">audio</span>
          </button>
          <button
            type="button"
            onClick={() => onCallClick?.("video")}
            disabled={blocked}
            className="glass-button glass-action-card flex h-16 flex-col items-center justify-center gap-1 rounded-[1.25rem] text-[#f06dff] disabled:opacity-45"
          >
            <Video className="h-5 w-5" />
            <span className="text-xs">video</span>
          </button>
        </motion.div>
      )}

      <motion.div
        custom={0.2}
        variants={revealVariants}
        initial="hidden"
        animate="visible"
        className="glass-panel animate-float-drift relative z-10 mx-auto mt-6 max-w-2xl rounded-[1.65rem] px-4 py-3 text-left"
      >
        <div className="space-y-3 divide-y divide-white/8">
          <div className="pb-3">
            <p className="text-[16px] leading-tight text-white">username</p>
            <div className="mt-1 flex items-center justify-between gap-4">
              <p className="truncate text-[21px] leading-tight text-[#ed78ff]">@{profile.username}</p>
              <AtSign className="h-6 w-6 shrink-0 text-[#ed78ff]" />
            </div>
          </div>

          {birthday && isOwnProfile ? (
            <div className="py-3">
              <p className="text-[16px] leading-tight text-white">birthday</p>
              <div className="mt-1 flex items-center gap-2 text-[20px] leading-tight text-white/88">
                <CalendarDays className="h-5 w-5 text-white/42" />
                <span>{birthday}</span>
              </div>
            </div>
          ) : null}

          <div className="py-3">
            <p className="text-[16px] leading-tight text-white">bio</p>
            <p className="mt-1 whitespace-pre-wrap text-[19px] leading-snug text-white/88">
              {profile.bio || (isOwnProfile ? "Добавьте пару строк о себе" : "Пользователь пока ничего не написал")}
            </p>
          </div>

          {(profile.location || profile.website) && (
            <div className="py-3">
              <p className="text-[16px] leading-tight text-white">links</p>
              <div className="mt-2 flex flex-wrap gap-3 text-[15px] text-white/70">
                {profile.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {profile.location}
                  </span>
                )}
                {profile.website && (
                  <a href={profile.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[#ed78ff]">
                    <LinkIcon className="h-4 w-4" />
                    {profile.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 pt-3 text-center">
            <div>
              <AnimatedCounter value={profile.posts_count ?? 0} className="text-[20px] font-semibold text-white" />
              <p className="text-sm text-white/45">posts</p>
            </div>
            <button type="button" onClick={() => openFollowModal("followers")} className="glass-button rounded-2xl py-1 transition hover:opacity-100">
              <AnimatedCounter value={localFollowersCount} className="text-[20px] font-semibold text-white" />
              <p className="text-sm text-white/45">followers</p>
            </button>
            <button type="button" onClick={() => openFollowModal("following")} className="glass-button rounded-2xl py-1 transition hover:opacity-100">
              <AnimatedCounter value={localFollowingCount} className="text-[20px] font-semibold text-white" />
              <p className="text-sm text-white/45">following</p>
            </button>
          </div>
        </div>
      </motion.div>

      {blocked && !isOwnProfile ? (
        <div className="relative z-10 mx-auto mt-4 max-w-2xl rounded-2xl border border-red-400/15 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Пользователь заблокирован
        </div>
      ) : null}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="border-white/10 bg-[#17171d] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Редактировать профиль</DialogTitle>
            <DialogDescription className="text-white/50">Обновите информацию о профиле</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/50">Имя</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-11 rounded-2xl border-white/10 bg-white/[0.07] text-white" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-white/50">О себе</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={200}
                className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/50">Местоположение</label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} className="h-11 rounded-2xl border-white/10 bg-white/[0.07] text-white" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/50">Сайт</label>
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} className="h-11 rounded-2xl border-white/10 bg-white/[0.07] text-white" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(false)} className="glass-button rounded-2xl px-4 py-2 text-sm text-white/60 hover:bg-white/10">Отмена</button>
              <button type="button" disabled={saving} onClick={saveProfile} className="glass-button inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#738cff] to-[#ed62ff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Сохранить
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showFollowModal !== null} onOpenChange={(open) => { if (!open) setShowFollowModal(null); }}>
        <DialogContent className="border-white/10 bg-[#17171d] text-white sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">{showFollowModal === "followers" ? "Подписчики" : "Подписки"}</DialogTitle>
          </DialogHeader>
          <div className="-mx-4 max-h-80 overflow-y-auto divide-y divide-white/10">
            {followList.length === 0 ? (
              <p className="py-10 text-center text-sm text-white/45">Пока нет пользователей</p>
            ) : (
              followList.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setShowFollowModal(null);
                    router.push(`/profile/${u.username}`);
                  }}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-white/8"
                >
                  <Avatar className="h-9 w-9">
                    {u.avatar_url ? <AvatarImage src={u.avatar_url} alt={u.display_name ?? u.username} /> : null}
                    <AvatarFallback className="bg-white/10 text-xs text-white">{(u.display_name ?? u.username).slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-white">{u.display_name ?? u.username}</p>
                    <p className="text-xs text-white/45">@{u.username}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {profileStories && <StoryViewer stories={profileStories} startIndex={0} onClose={() => setProfileStories(null)} />}
    </section>
  );
}
