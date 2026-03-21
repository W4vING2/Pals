"use client";

import React, { useState, useRef, useEffect } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/supabase";

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
  const [following, setFollowing] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [localFollowersCount, setLocalFollowersCount] = useState(
    profile.followers_count ?? 0
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

  // Sync local count when profile prop changes
  useEffect(() => {
    setLocalFollowersCount(profile.followers_count ?? 0);
  }, [profile.followers_count]);

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

  const handleAvatarUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    const supabase = getSupabaseBrowserClient();
    const ext = file.name.split(".").pop();
    const path = `avatars/${user.id}.${ext}`;

    const { error } = await supabase.storage
      .from("media")
      .upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      const { data: updated } = await supabase
        .from("profiles")
        .update({ avatar_url: data.publicUrl })
        .eq("id", user.id)
        .select()
        .single();
      if (updated) {
        setStoreProfile(updated as Profile);
        onProfileUpdated?.(updated as Profile);
      }
    }
    setUploadingAvatar(false);
  };

  const handleCoverUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingCover(true);
    const supabase = getSupabaseBrowserClient();
    const ext = file.name.split(".").pop();
    const path = `covers/${user.id}.${ext}`;

    const { error } = await supabase.storage
      .from("media")
      .upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      const { data: updated } = await supabase
        .from("profiles")
        .update({ cover_url: data.publicUrl })
        .eq("id", user.id)
        .select()
        .single();
      if (updated) {
        setStoreProfile(updated as Profile);
        onProfileUpdated?.(updated as Profile);
      }
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
      <div className="relative h-40 sm:h-56 bg-gradient-to-br from-[var(--accent-blue)]/30 to-purple-500/20 rounded-3xl overflow-hidden">
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
          <button
            onClick={() => coverInputRef.current?.click()}
            disabled={uploadingCover}
            className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-xl text-xs font-medium text-white hover:bg-black/60 transition-all duration-150"
          >
            <Camera className="size-3.5" />
            {uploadingCover ? "Uploading..." : "Edit cover"}
          </button>
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
            {/* Animated gradient ring */}
            <motion.div
              className="absolute -inset-1 rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, var(--accent-blue), #a855f7, #06b6d4, var(--accent-blue))",
              }}
              animate={{ rotate: 360 }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "linear",
              }}
            />
            <div className="relative rounded-full bg-[var(--bg-base)] p-[3px]">
              <Avatar className="size-20">
                {profile.avatar_url ? (
                  <AvatarImage src={profile.avatar_url} alt={name} />
                ) : null}
                <AvatarFallback className="text-lg font-bold bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                  {name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>

            {isOwnProfile && (
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute bottom-0 right-0 z-10 size-7 rounded-full bg-[var(--accent-blue)] text-white flex items-center justify-center shadow-md hover:bg-[var(--accent-blue)]/80 transition-colors"
                aria-label="Change avatar"
              >
                <Camera className="size-3.5" />
              </button>
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
                {editing ? "Cancel" : "Edit profile"}
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMessageClick}
                  className="rounded-xl text-[var(--text-secondary)]"
                >
                  <MessageCircle className="size-4" />
                  Message
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
                        {following ? "Following" : "Follow"}
                      </motion.span>
                    </AnimatePresence>
                  </Button>
                </motion.div>
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
                  Edit profile
                </DialogTitle>
                <DialogDescription className="text-[var(--text-secondary)]">
                  Update your profile information
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Display name
                  </label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-10 rounded-xl bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Bio
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    maxLength={200}
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--accent-blue)] transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">
                      Location
                    </label>
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="h-10 rounded-xl bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-primary)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">
                      Website
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
                    Cancel
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
                    Save
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
            <p className="text-xs text-[var(--text-secondary)]">Posts</p>
          </div>
          <button
            onClick={() => openFollowModal("followers")}
            className="text-center hover:opacity-70 transition-opacity"
          >
            <AnimatedCounter
              value={localFollowersCount}
              className="text-lg font-bold text-[var(--text-primary)]"
            />
            <p className="text-xs text-[var(--text-secondary)]">Followers</p>
          </button>
          <button
            onClick={() => openFollowModal("following")}
            className="text-center hover:opacity-70 transition-opacity"
          >
            <AnimatedCounter
              value={profile.following_count ?? 0}
              className="text-lg font-bold text-[var(--text-primary)]"
            />
            <p className="text-xs text-[var(--text-secondary)]">Following</p>
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
            <DialogTitle className="capitalize text-[var(--text-primary)]">
              {showFollowModal}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto -mx-4 divide-y divide-[var(--border)]">
            {followList.length === 0 ? (
              <p className="text-center text-[var(--text-secondary)] text-sm py-10">
                No users yet
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
    </div>
  );
}
