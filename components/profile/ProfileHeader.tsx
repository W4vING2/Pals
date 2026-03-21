"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import type { Profile } from "@/lib/supabase";
import { useRouter } from "next/navigation";

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
  const [localFollowersCount, setLocalFollowersCount] = useState(profile.followers_count ?? 0);
  const [editing, setEditing] = useState(false);
  const [showFollowModal, setShowFollowModal] = useState<"followers" | "following" | null>(null);
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
      // Get follower IDs, then load their profiles
      const { data: followRows } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("following_id", profile.id);
      const ids = (followRows ?? []).map((r) => r.follower_id);
      if (ids.length > 0) {
        const { data } = await supabase.from("profiles").select("*").in("id", ids);
        setFollowList((data ?? []) as Profile[]);
      }
    } else {
      // Get following IDs, then load their profiles
      const { data: followRows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", profile.id);
      const ids = (followRows ?? []).map((r) => r.following_id);
      if (ids.length > 0) {
        const { data } = await supabase.from("profiles").select("*").in("id", ids);
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    const supabase = getSupabaseBrowserClient();
    const ext = file.name.split(".").pop();
    const path = `avatars/${user.id}.${ext}`;

    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true });
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

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingCover(true);
    const supabase = getSupabaseBrowserClient();
    const ext = file.name.split(".").pop();
    const path = `covers/${user.id}.${ext}`;

    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true });
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
      {/* Cover photo */}
      <div className="relative h-40 sm:h-56 bg-gradient-to-br from-[var(--accent-blue)]/30 to-[var(--accent-mint)]/20 rounded-3xl overflow-hidden">
        {profile.cover_url && (
          <Image src={profile.cover_url} alt="Cover" fill className="object-cover" sizes="100vw" />
        )}
        {isOwnProfile && (
          <button
            onClick={() => coverInputRef.current?.click()}
            disabled={uploadingCover}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 glass px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all duration-150"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M12.5 2.5l1 1-9 9-1.5.5.5-1.5 9-9z" />
            </svg>
            {uploadingCover ? "Uploading…" : "Edit cover"}
          </button>
        )}
        <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
      </div>

      {/* Profile info */}
      <div className="px-4 -mt-10 space-y-4">
        {/* Avatar row */}
        <div className="flex items-end justify-between">
          <div className="relative">
            <div className="ring-4 ring-[var(--bg-base)] rounded-full">
              <Avatar
                src={profile.avatar_url}
                name={name}
                size="xl"
              />
            </div>
            {isOwnProfile && (
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[var(--accent-blue)] text-white flex items-center justify-center shadow-md hover:bg-[var(--accent-blue-hover)] transition-colors"
                aria-label="Change avatar"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12.5 2.5l1 1-9 9-1.5.5.5-1.5 9-9z" />
                </svg>
              </button>
            )}
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pb-2">
            {isOwnProfile ? (
              <Button variant="secondary" size="sm" onClick={() => setEditing(!editing)}>
                {editing ? "Cancel" : "Edit profile"}
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={onMessageClick}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
                  </svg>
                  Message
                </Button>
                <Button
                  variant={following ? "secondary" : "primary"}
                  size="sm"
                  loading={followPending}
                  onClick={toggleFollow}
                >
                  {following ? "Following" : "Follow"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Name & bio */}
        {editing ? (
          <div className="space-y-3 bg-[var(--bg-surface)] rounded-2xl p-4 border border-[var(--border)]">
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={200}
                className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--accent-blue)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Website</label>
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" loading={saving} onClick={saveProfile}>Save</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">{name}</h1>
              <p className="text-sm text-[var(--text-secondary)]">@{profile.username}</p>
            </div>
            {profile.bio && (
              <p className="text-sm text-[var(--text-primary)] leading-relaxed">{profile.bio}</p>
            )}
            <div className="flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
              {profile.location && (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M8 1.5a4.5 4.5 0 010 9C5.015 10.5 3 7.5 8 1.5z" />
                    <circle cx="8" cy="6" r="1.5" />
                  </svg>
                  {profile.location}
                </span>
              )}
              {profile.website && (
                <a href={profile.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[var(--accent-blue)] hover:underline">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M6.5 9.5l3-3m-3 0h3v3" />
                    <path d="M3 8a5 5 0 005 5h.5M8 3H3a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-5" />
                  </svg>
                  {profile.website.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-6 py-3 border-t border-[var(--border)]">
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--text-primary)]">{profile.posts_count ?? 0}</p>
            <p className="text-xs text-[var(--text-secondary)]">Posts</p>
          </div>
          <button onClick={() => openFollowModal("followers")} className="text-center hover:opacity-70 transition-opacity">
            <p className="text-lg font-bold text-[var(--text-primary)]">{localFollowersCount}</p>
            <p className="text-xs text-[var(--text-secondary)]">Followers</p>
          </button>
          <button onClick={() => openFollowModal("following")} className="text-center hover:opacity-70 transition-opacity">
            <p className="text-lg font-bold text-[var(--text-primary)]">{profile.following_count ?? 0}</p>
            <p className="text-xs text-[var(--text-secondary)]">Following</p>
          </button>
        </div>
      </div>

      {/* Followers / Following modal */}
      {showFollowModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowFollowModal(null)}>
          <div className="w-full max-w-sm bg-[var(--bg-surface)] rounded-3xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h2 className="font-bold text-[var(--text-primary)] capitalize">{showFollowModal}</h2>
              <button onClick={() => setShowFollowModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border)]">
              {followList.length === 0 ? (
                <p className="text-center text-[var(--text-secondary)] text-sm py-10">No users yet</p>
              ) : (
                followList.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setShowFollowModal(null); router.push(`/profile/${u.username}`); }}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    <Avatar src={u.avatar_url} name={u.display_name ?? u.username} size="sm" />
                    <div className="text-left">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{u.display_name ?? u.username}</p>
                      <p className="text-xs text-[var(--text-secondary)]">@{u.username}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
