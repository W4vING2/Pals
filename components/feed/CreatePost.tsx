"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  AtSign,
  Globe,
  ImageIcon,
  Loader2,
  Lock,
  Sparkles,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/Avatar";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  useAuthStore,
  useFeedPreferencesStore,
  type PostVisibility,
} from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/supabase";
import { compressImage } from "@/lib/compress";

interface CreatePostProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const MAX_IMAGES = 6;
const DRAFT_VERSION = 1;

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

/** Extract @username mentions from text */
function parseMentions(text: string): string[] {
  const matches = text.match(/@(\w+)/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

export function CreatePost({ open, onClose, onCreated }: CreatePostProps) {
  const { user, profile } = useAuthStore();
  const { preferredPostVisibility, setPreferredPostVisibility } =
    useFeedPreferencesStore();
  const [content, setContent] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [visibility, setVisibility] =
    useState<PostVisibility>(preferredPostVisibility);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    tone: "muted" | "success" | "danger";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<Profile[]>([]);
  const mentionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchMentions = useCallback(async (query: string) => {
    if (!query) { setMentionResults([]); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .ilike("username", `${query}%`)
      .limit(6);
    setMentionResults((data ?? []) as Profile[]);
  }, []);

  const handleTextChange = (val: string) => {
    setContent(val);
    // Detect @mention at cursor
    const ta = textareaRef.current;
    if (!ta) { setMentionQuery(null); return; }
    const cursor = ta.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const match = before.match(/@(\w*)$/);
    if (match) {
      const q = match[1];
      setMentionQuery(q);
      if (mentionDebounceRef.current) clearTimeout(mentionDebounceRef.current);
      mentionDebounceRef.current = setTimeout(() => searchMentions(q), 200);
    } else {
      setMentionQuery(null);
      setMentionResults([]);
    }
  };

  const insertMention = (username: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? content.length;
    const before = content.slice(0, cursor);
    const after = content.slice(cursor);
    const replaced = before.replace(/@\w*$/, `@${username} `);
    const newContent = replaced + after;
    setContent(newContent);
    setMentionQuery(null);
    setMentionResults([]);
    setTimeout(() => {
      ta.focus();
      const pos = replaced.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  };

  const resetComposer = useCallback(() => {
    setContent("");
    setImageFiles([]);
    setImagePreviews([]);
    setMentionQuery(null);
    setMentionResults([]);
    setError(null);
    setStatus(null);
    setVisibility(preferredPostVisibility);
  }, [preferredPostVisibility]);

  const getDraftKey = useCallback(() => {
    if (!user) return null;
    return `pals:create-post-draft:${user.id}`;
  }, [user]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const remaining = MAX_IMAGES - imageFiles.length;
    if (remaining <= 0) { setError(`Максимум ${MAX_IMAGES} фото`); return; }
    const selected = files.slice(0, remaining);
    const oversized = selected.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized) { setError("Каждое изображение должно быть менее 10 МБ"); return; }
    setError(null);
    selected.forEach(async (file) => {
      const compressed = await compressImage(file);
      setImageFiles((prev) => [...prev, compressed]);
      const reader = new FileReader();
      reader.onload = () => setImagePreviews((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(compressed);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (idx: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== idx));
    setImagePreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!user || (!content.trim() && imageFiles.length === 0)) return;
    setSubmitting(true);
    setError(null);
    setStatus({ tone: "muted", text: "Публикуем пост..." });
    setPreferredPostVisibility(visibility);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let imageUrls: string[] = [];

    if (imageFiles.length > 0) {
      setUploading(true);
      const timestamp = Date.now();
      const uploadResults = await Promise.all(
        imageFiles.map(async (file, i) => {
          const ext = file.name.split(".").pop();
          const path = `posts/${user.id}/${timestamp}_${i}.${ext}`;
          const { error: uploadError } = await supabase.storage.from("media").upload(path, file);
          if (uploadError) return null;
          const { data } = supabase.storage.from("media").getPublicUrl(path);
          return data.publicUrl;
        })
      );
      const failed = uploadResults.some((r) => r === null);
      if (failed) {
        setError("Не удалось загрузить некоторые изображения");
        setUploading(false);
        setSubmitting(false);
        return;
      }
      imageUrls = uploadResults as string[];
      setUploading(false);
    }

    const { data: newPost, error: insertError } = await supabase
      .from("posts")
      .insert({
        user_id: user.id,
        content: content.trim() || null,
        image_url: imageUrls.length > 0 ? imageUrls[0] : null,
        image_urls: imageUrls,
        visibility,
      })
      .select()
      .single();

    if (insertError || !newPost) {
      setError("Не удалось создать пост");
      setStatus({ tone: "danger", text: "Публикация не удалась. Черновик сохранён." });
    } else {
      // Handle @mentions
      const mentions = parseMentions(content);
      if (mentions.length > 0 && newPost) {
        // Lookup mentioned users
        const { data: mentionedProfiles } = await supabase
          .from("profiles")
          .select("id, username")
          .in("username", mentions);

        if (mentionedProfiles && mentionedProfiles.length > 0) {
          // Create mention records
          await supabase.from("mentions" as any).insert(
            mentionedProfiles
              .filter((p) => p.id !== user.id) // don't mention yourself
              .map((p) => ({
                post_id: newPost.id,
                mentioned_user_id: p.id,
                created_by: user.id,
              }))
          );

          // Create notifications
          await supabase.from("notifications").insert(
            mentionedProfiles
              .filter((p) => p.id !== user.id)
              .map((p) => ({
                user_id: p.id,
                actor_id: user.id,
                type: "mention" as const,
                post_id: newPost.id,
              }))
          );
        }
      }

      const draftKey = getDraftKey();
      if (draftKey && typeof window !== "undefined") {
        window.localStorage.removeItem(draftKey);
      }
      resetComposer();
      setStatus({ tone: "success", text: "Пост опубликован" });
      onCreated?.();
      onClose();
    }
    setSubmitting(false);
  };

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  }, [content]);

  useEffect(() => {
    setVisibility(preferredPostVisibility);
  }, [preferredPostVisibility]);

  useEffect(() => {
    if (!open || !user || typeof window === "undefined") return;
    const draftKey = getDraftKey();
    if (!draftKey) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        version: number;
        content?: string;
        visibility?: PostVisibility;
      };
      if (draft.version !== DRAFT_VERSION) return;
      if (draft.content) {
        setContent(draft.content);
        setStatus({ tone: "muted", text: "Черновик восстановлен" });
      }
      if (draft.visibility) {
        setVisibility(draft.visibility);
      }
    } catch {
      // Ignore broken draft payloads
    }
  }, [open, user, getDraftKey]);

  useEffect(() => {
    if (!open || !user || typeof window === "undefined") return;
    const draftKey = getDraftKey();
    if (!draftKey) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);

    draftTimerRef.current = setTimeout(() => {
      if (!content.trim()) {
        window.localStorage.removeItem(draftKey);
        return;
      }
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({
          version: DRAFT_VERSION,
          content,
          visibility,
        })
      );
      setStatus((current) =>
        current?.tone === "success"
          ? current
          : { tone: "muted", text: "Черновик сохранён на этом устройстве" }
      );
    }, 320);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [open, user, content, visibility, getDraftKey]);

  const name = profile?.display_name ?? profile?.username ?? "Вы";
  const canSubmit = (content.trim().length > 0 || imageFiles.length > 0) && !submitting;

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-lg bg-[var(--bg-surface)] border-[var(--border)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-primary)]">Новый пост</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Author */}
          <div className="flex items-center gap-3">
            <Avatar size="default">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} /> : null}
              <AvatarFallback>{getInitials(name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{name}</p>
              {profile?.username && <p className="text-xs text-[var(--text-secondary)]">@{profile.username}</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Кто увидит пост
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Этот выбор сохранится как ваш дефолт.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility("public")}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors",
                    visibility === "public"
                      ? "bg-[var(--accent-blue)] text-white"
                      : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <Globe className="h-3.5 w-3.5" />
                  Публично
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility("followers")}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors",
                    visibility === "followers"
                      ? "bg-[var(--accent-blue)] text-white"
                      : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <Lock className="h-3.5 w-3.5" />
                  Подписчики
                </button>
              </div>
            </div>
          </div>

          {/* Textarea with mentions autocomplete */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="Что у вас нового? Используйте @username для упоминаний"
              rows={3}
              maxLength={500}
              className={cn(
                "w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-4 py-3",
                "text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]",
                "resize-none outline-none input-focus transition-all duration-150 overflow-hidden"
              )}
            />

            {/* Mentions autocomplete */}
            <AnimatePresence>
              {mentionQuery !== null && mentionResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute bottom-full mb-1 left-0 right-0 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden z-50 max-h-48 overflow-y-auto"
                >
                  {mentionResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => insertMention(p.username)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left hover:bg-[var(--bg-surface)] transition-colors"
                    >
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-emerald-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                          {p.username[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[var(--text-primary)] truncate">
                          {p.display_name ?? p.username}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">@{p.username}</p>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Char count */}
          <div className="flex justify-end -mt-2">
            <span className={cn("text-xs", content.length > 450 ? "text-amber-400" : "text-[var(--text-secondary)]")}>
              {content.length}/500
            </span>
          </div>

          {/* Image previews */}
          {imagePreviews.length > 0 && (
            <div className={cn("grid gap-2", imagePreviews.length === 1 && "grid-cols-1", imagePreviews.length === 2 && "grid-cols-2", imagePreviews.length >= 3 && "grid-cols-3")}>
              {imagePreviews.map((src, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden bg-[var(--bg-elevated)] aspect-square">
                  <Image src={src} alt={`Превью ${i + 1}`} fill className="object-cover" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-red-400 bg-red-400/10 rounded-xl px-3 py-2">{error}</p>}
          {status && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
                status.tone === "success" &&
                  "bg-emerald-500/10 text-emerald-300",
                status.tone === "danger" && "bg-red-500/10 text-red-300",
                status.tone === "muted" &&
                  "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
              )}
            >
              <Sparkles className="h-4 w-4" />
              <span>{status.text}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={imageFiles.length >= MAX_IMAGES}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm",
                "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)] transition-colors",
                imageFiles.length >= MAX_IMAGES && "opacity-50 cursor-not-allowed"
              )}
            >
              <ImageIcon className="w-5 h-5" />
              Фото
            </button>
            {imageFiles.length > 0 && (
              <span className="text-xs text-[var(--text-secondary)]">{imageFiles.length}/{MAX_IMAGES}</span>
            )}
            {(content.trim().length > 0 || imageFiles.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  const draftKey = getDraftKey();
                  if (draftKey && typeof window !== "undefined") {
                    window.localStorage.removeItem(draftKey);
                  }
                  resetComposer();
                }}
                className="rounded-xl px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              >
                Очистить
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
          <Button onClick={handleSubmit} disabled={!canSubmit} size="default">
            {(submitting || uploading) && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            Опубликовать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
