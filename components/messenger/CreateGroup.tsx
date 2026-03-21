"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, Search, Check, Loader2, Users, Camera } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/supabase";

interface CreateGroupProps {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

export function CreateGroup({ open, onClose, onCreated }: CreateGroupProps) {
  const { user } = useAuthStore();
  const [step, setStep] = useState<"select" | "details">("select");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
        .neq("id", user.id)
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(20);
      if (data) setResults(data as Profile[]);
      setSearching(false);
    },
    [user]
  );

  useEffect(() => {
    const t = setTimeout(() => searchUsers(search), 300);
    return () => clearTimeout(t);
  }, [search, searchUsers]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setStep("select");
      setSearch("");
      setResults([]);
      setSelected([]);
      setGroupName("");
      setAvatarFile(null);
      setAvatarPreview(null);
    }
  }, [open]);

  const toggleUser = (profile: Profile) => {
    setSelected((prev) =>
      prev.some((p) => p.id === profile.id)
        ? prev.filter((p) => p.id !== profile.id)
        : [...prev, profile]
    );
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCreate = async () => {
    if (!user || selected.length === 0 || !groupName.trim()) return;
    setCreating(true);
    const supabase = getSupabaseBrowserClient();

    let avatarUrl: string | null = null;
    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const path = `groups/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("media")
        .upload(path, avatarFile);
      if (!error) {
        const { data } = supabase.storage.from("media").getPublicUrl(path);
        avatarUrl = data.publicUrl;
      }
    }

    const convId = crypto.randomUUID();
    const { error: convError } = await supabase
      .from("conversations")
      .insert({
        id: convId,
        is_group: true,
        name: groupName.trim(),
        avatar_url: avatarUrl,
        created_by: user.id,
      } as Record<string, unknown>);

    if (convError) {
      console.error("Error creating group:", convError);
      setCreating(false);
      return;
    }

    // Add all participants including self
    const participants = [
      { conversation_id: convId, user_id: user.id, unread_count: 0 },
      ...selected.map((p) => ({
        conversation_id: convId,
        user_id: p.id,
        unread_count: 0,
      })),
    ];

    await supabase.from("conversation_participants").insert(participants);

    setCreating(false);
    onCreated(convId);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md bg-[var(--bg-surface)] border-[var(--border)] p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-[var(--text-primary)]">
            {step === "select" ? "Add members" : "Group details"}
          </DialogTitle>
        </DialogHeader>

        {step === "select" ? (
          <div className="flex flex-col" style={{ maxHeight: "70vh" }}>
            {/* Selected chips */}
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                {selected.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => toggleUser(p)}
                    className="flex items-center gap-1.5 bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] rounded-full pl-1.5 pr-2.5 py-1 text-xs font-medium"
                  >
                    <Avatar className="size-5">
                      {p.avatar_url ? (
                        <AvatarImage src={p.avatar_url} />
                      ) : null}
                      <AvatarFallback className="text-[8px]">
                        {(p.display_name ?? p.username)[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {p.display_name ?? p.username}
                    <X className="size-3" />
                  </button>
                ))}
              </div>
            )}

            {/* Search input */}
            <div className="px-4 pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users..."
                  autoFocus
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-full pl-9 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none input-focus transition-colors"
                />
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)] min-h-[200px] max-h-[40vh]">
              {searching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--text-secondary)]" />
                </div>
              ) : results.length === 0 && search ? (
                <p className="text-center text-sm text-[var(--text-secondary)] py-8">
                  No users found
                </p>
              ) : (
                results.map((profile) => {
                  const isSelected = selected.some(
                    (p) => p.id === profile.id
                  );
                  return (
                    <button
                      key={profile.id}
                      onClick={() => toggleUser(profile)}
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
                      <div
                        className={cn(
                          "size-5 rounded-full border-2 flex items-center justify-center transition-all",
                          isSelected
                            ? "bg-[var(--accent-blue)] border-[var(--accent-blue)]"
                            : "border-[var(--border)]"
                        )}
                      >
                        {isSelected && (
                          <Check className="size-3 text-white" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[var(--border)]">
              <Button
                onClick={() => setStep("details")}
                disabled={selected.length === 0}
                className="w-full rounded-xl"
              >
                Next ({selected.length} selected)
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-5">
            {/* Group avatar */}
            <div className="flex justify-center">
              <label className="relative cursor-pointer">
                <div
                  className={cn(
                    "size-20 rounded-full flex items-center justify-center overflow-hidden",
                    avatarPreview
                      ? ""
                      : "bg-[var(--bg-elevated)] border-2 border-dashed border-[var(--border)]"
                  )}
                >
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Group avatar"
                      className="size-full object-cover"
                    />
                  ) : (
                    <Camera className="size-6 text-[var(--text-secondary)]" />
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarSelect}
                />
              </label>
            </div>

            {/* Group name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Group name
              </label>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Enter group name..."
                autoFocus
                maxLength={50}
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none input-focus transition-colors"
              />
            </div>

            {/* Members preview */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                {selected.length} members
              </p>
              <div className="flex -space-x-2">
                {selected.slice(0, 8).map((p) => (
                  <Avatar key={p.id} className="size-8 ring-2 ring-[var(--bg-surface)]">
                    {p.avatar_url ? (
                      <AvatarImage src={p.avatar_url} />
                    ) : null}
                    <AvatarFallback className="text-[10px] bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                      {(p.display_name ?? p.username)[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {selected.length > 8 && (
                  <div className="size-8 rounded-full bg-[var(--bg-elevated)] ring-2 ring-[var(--bg-surface)] flex items-center justify-center text-xs font-medium text-[var(--text-secondary)]">
                    +{selected.length - 8}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setStep("select")}
                className="flex-1 rounded-xl border-[var(--border)] text-[var(--text-primary)]"
              >
                Back
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!groupName.trim() || creating}
                className="flex-1 rounded-xl"
              >
                {creating ? (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                ) : (
                  <Users className="size-4 mr-1.5" />
                )}
                Create
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
