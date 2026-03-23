"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  Check,
  Loader2,
  UserPlus,
  UserMinus,
  Camera,
  LogOut,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/supabase";
import type { ConversationWithDetails } from "@/hooks/useMessages";

interface GroupSettingsProps {
  open: boolean;
  onClose: () => void;
  conversation: ConversationWithDetails;
  onUpdated: () => void;
}

export function GroupSettings({
  open,
  onClose,
  conversation,
  onUpdated,
}: GroupSettingsProps) {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<"members" | "add">("members");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [groupName, setGroupName] = useState(conversation.name ?? "");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const isAdmin = conversation.created_by === user?.id;
  const memberIds = new Set(conversation.participants.map((p) => p.user_id));

  useEffect(() => {
    setGroupName(conversation.name ?? "");
  }, [conversation.name]);

  const searchUsers = useCallback(
    async (query: string) => {
      if (!query.trim() || !user) {
        setResults([]);
        return;
      }
      setSearching(true);
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(20);
      // Filter out existing members
      if (data) {
        setResults(
          (data as Profile[]).filter((p) => !memberIds.has(p.id))
        );
      }
      setSearching(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, conversation.participants]
  );

  useEffect(() => {
    if (tab !== "add") return;
    const t = setTimeout(() => searchUsers(search), 300);
    return () => clearTimeout(t);
  }, [search, searchUsers, tab]);

  const saveName = async () => {
    if (!groupName.trim()) return;
    setSaving(true);
    const supabase = getSupabaseBrowserClient();
    await supabase
      .from("conversations")
      .update({ name: groupName.trim() })
      .eq("id", conversation.id);
    setSaving(false);
    onUpdated();
  };

  const handleAvatarUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    const supabase = getSupabaseBrowserClient();
    const ext = file.name.split(".").pop();
    const path = `groups/${conversation.id}.${ext}`;

    const { error } = await supabase.storage
      .from("media")
      .upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      await supabase
        .from("conversations")
        .update({ avatar_url: `${data.publicUrl}?t=${Date.now()}` })
        .eq("id", conversation.id);
      onUpdated();
    }
    setUploadingAvatar(false);
  };

  const removeMember = async (userId: string) => {
    setRemoving(userId);
    const supabase = getSupabaseBrowserClient();
    const removedProfile = conversation.participants.find(p => p.user_id === userId)?.profiles;
    const removedName = removedProfile?.display_name ?? removedProfile?.username ?? "Пользователь";
    await supabase
      .from("conversation_participants")
      .delete()
      .eq("conversation_id", conversation.id)
      .eq("user_id", userId);
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender_id: user!.id,
      content: `${removedName} удалён(а) из группы`,
      message_type: "system",
    });
    setRemoving(null);
    onUpdated();
  };

  const addMember = async (profile: Profile) => {
    setAdding(profile.id);
    const supabase = getSupabaseBrowserClient();
    await supabase.from("conversation_participants").insert({
      conversation_id: conversation.id,
      user_id: profile.id,
      unread_count: 0,
    });
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender_id: user!.id,
      content: `${profile.display_name ?? profile.username} добавлен(а) в группу`,
      message_type: "system",
    });
    setAdding(null);
    setResults((prev) => prev.filter((p) => p.id !== profile.id));
    onUpdated();
  };

  const leaveGroup = async () => {
    if (!user) return;
    onClose();
    const supabase = getSupabaseBrowserClient();
    const myProfile = conversation.participants.find(p => p.user_id === user.id)?.profiles;
    const myName = myProfile?.display_name ?? myProfile?.username ?? "Пользователь";
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender_id: user.id,
      content: `${myName} покинул(а) группу`,
      message_type: "system",
    });
    await supabase
      .from("conversation_participants")
      .delete()
      .eq("conversation_id", conversation.id)
      .eq("user_id", user.id);
    onUpdated();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md bg-[var(--bg-surface)] border-[var(--border)] p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-[var(--text-primary)]">
            Настройки группы
          </DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">
            {conversation.participants.length} участн.
          </DialogDescription>
        </DialogHeader>

        {/* Group info */}
        <div className="px-4 pb-4 flex items-center gap-3">
          <label className="relative cursor-pointer shrink-0">
            <Avatar className="size-14">
              {conversation.avatar_url ? (
                <AvatarImage src={conversation.avatar_url} />
              ) : null}
              <AvatarFallback className="text-lg bg-gradient-to-br from-purple-500 to-emerald-500 text-white">
                {(conversation.name ?? "G")[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {isAdmin && (
              <>
                <div className="absolute bottom-0 right-0 size-5 rounded-full bg-[var(--accent-blue)] text-white flex items-center justify-center">
                  <Camera className="size-2.5" />
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </>
            )}
          </label>
          {isAdmin ? (
            <div className="flex-1 flex gap-2">
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={50}
                className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] outline-none input-focus transition-colors"
              />
              <Button
                size="sm"
                onClick={saveName}
                disabled={saving || !groupName.trim()}
                className="rounded-xl shrink-0"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Сохранить"}
              </Button>
            </div>
          ) : (
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {conversation.name}
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          <button
            onClick={() => setTab("members")}
            className={cn(
              "flex-1 py-2.5 text-sm font-medium transition-colors",
              tab === "members"
                ? "text-[var(--accent-blue)] border-b-2 border-[var(--accent-blue)]"
                : "text-[var(--text-secondary)]"
            )}
          >
            Участники
          </button>
          {isAdmin && (
            <button
              onClick={() => setTab("add")}
              className={cn(
                "flex-1 py-2.5 text-sm font-medium transition-colors",
                tab === "add"
                  ? "text-[var(--accent-blue)] border-b-2 border-[var(--accent-blue)]"
                  : "text-[var(--text-secondary)]"
              )}
            >
              Добавить
            </button>
          )}
        </div>

        <div className="max-h-[40vh] overflow-y-auto">
          {tab === "members" ? (
            <div className="divide-y divide-[var(--border)]">
              {conversation.participants.map((p) => {
                const profile = p.profiles;
                const name =
                  profile?.display_name ?? profile?.username ?? "Unknown";
                const isCreator =
                  p.user_id === conversation.created_by;
                const isSelf = p.user_id === user?.id;

                return (
                  <div
                    key={p.user_id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <Avatar className="size-9">
                      {profile?.avatar_url ? (
                        <AvatarImage src={profile.avatar_url} />
                      ) : null}
                      <AvatarFallback className="text-xs bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                        {name[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {name}
                        </p>
                        {isCreator && (
                          <span className="text-[10px] bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] px-1.5 py-0.5 rounded-full font-medium">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        @{profile?.username}
                      </p>
                    </div>
                    {isAdmin && !isSelf && (
                      <button
                        onClick={() => removeMember(p.user_id)}
                        disabled={removing === p.user_id}
                        className="text-red-400 hover:text-red-300 transition-colors p-1.5"
                        title="Удалить участника"
                      >
                        {removing === p.user_id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <UserMinus className="size-4" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <div className="p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск пользователей..."
                    autoFocus
                    className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full pl-9 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none input-focus transition-colors"
                  />
                </div>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {searching ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-[var(--text-secondary)]" />
                  </div>
                ) : results.length === 0 && search ? (
                  <p className="text-center text-sm text-[var(--text-secondary)] py-8">
                    Пользователи не найдены
                  </p>
                ) : (
                  results.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => addMember(profile)}
                      disabled={adding === profile.id}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <Avatar className="size-9">
                        {profile.avatar_url ? (
                          <AvatarImage src={profile.avatar_url} />
                        ) : null}
                        <AvatarFallback className="text-xs bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                          {(
                            profile.display_name ?? profile.username
                          )[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {profile.display_name ?? profile.username}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          @{profile.username}
                        </p>
                      </div>
                      {adding === profile.id ? (
                        <Loader2 className="size-4 animate-spin text-[var(--text-secondary)]" />
                      ) : (
                        <UserPlus className="size-4 text-[var(--accent-blue)]" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Leave group */}
        <div className="p-4 border-t border-[var(--border)]">
          <button
            onClick={leaveGroup}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <LogOut className="size-4" />
            Покинуть группу
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
