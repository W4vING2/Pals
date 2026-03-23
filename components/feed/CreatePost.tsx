"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { ImageIcon, X, Loader2 } from "lucide-react";
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
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface CreatePostProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const MAX_IMAGES = 6;

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function CreatePost({ open, onClose, onCreated }: CreatePostProps) {
  const { user, profile } = useAuthStore();
  const [content, setContent] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const remaining = MAX_IMAGES - imageFiles.length;
    if (remaining <= 0) {
      setError(`Максимум ${MAX_IMAGES} фото`);
      return;
    }

    const selected = files.slice(0, remaining);
    const oversized = selected.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized) {
      setError("Каждое изображение должно быть менее 10 МБ");
      return;
    }

    setError(null);
    setImageFiles((prev) => [...prev, ...selected]);

    selected.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () =>
        setImagePreviews((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });

    // Reset input so re-selecting same files works
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
    const supabase = getSupabaseBrowserClient();

    let imageUrls: string[] = [];

    if (imageFiles.length > 0) {
      setUploading(true);
      const timestamp = Date.now();

      const uploadResults = await Promise.all(
        imageFiles.map(async (file, i) => {
          const ext = file.name.split(".").pop();
          const path = `posts/${user.id}/${timestamp}_${i}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("media")
            .upload(path, file);

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

    const { error: insertError } = await supabase.from("posts").insert({
      user_id: user.id,
      content: content.trim() || null,
      image_url: imageUrls.length > 0 ? imageUrls[0] : null,
      image_urls: imageUrls,
    });

    if (insertError) {
      setError("Не удалось создать пост");
    } else {
      setContent("");
      setImageFiles([]);
      setImagePreviews([]);
      onCreated?.();
      onClose();
    }
    setSubmitting(false);
  };

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [content]);

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
              {profile?.avatar_url ? (
                <AvatarImage src={profile.avatar_url} />
              ) : null}
              <AvatarFallback>{getInitials(name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{name}</p>
              {profile?.username && (
                <p className="text-xs text-[var(--text-secondary)]">@{profile.username}</p>
              )}
            </div>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Что у вас нового?"
            rows={3}
            maxLength={500}
            className={cn(
              "w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-4 py-3",
              "text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]",
              "resize-none outline-none input-focus transition-all duration-150",
              "overflow-hidden"
            )}
          />

          {/* Char count */}
          <div className="flex justify-end">
            <span
              className={cn(
                "text-xs",
                content.length > 450
                  ? "text-amber-400"
                  : "text-[var(--text-secondary)]"
              )}
            >
              {content.length}/500
            </span>
          </div>

          {/* Image previews grid */}
          {imagePreviews.length > 0 && (
            <div className={cn(
              "grid gap-2",
              imagePreviews.length === 1 && "grid-cols-1",
              imagePreviews.length === 2 && "grid-cols-2",
              imagePreviews.length >= 3 && "grid-cols-3"
            )}>
              {imagePreviews.map((src, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden bg-[var(--bg-elevated)] aspect-square">
                  <Image
                    src={src}
                    alt={`Превью ${i + 1}`}
                    fill
                    className="object-cover"
                  />
                  <button
                    onClick={() => removeImage(i)}
                    className={cn(
                      "absolute top-1.5 right-1.5 w-6 h-6 rounded-full",
                      "bg-black/60 text-white flex items-center justify-center",
                      "hover:bg-black/80 transition-colors"
                    )}
                    aria-label="Удалить фото"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={imageFiles.length >= MAX_IMAGES}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-sm",
                "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)]",
                "transition-colors",
                imageFiles.length >= MAX_IMAGES && "opacity-50 cursor-not-allowed"
              )}
            >
              <ImageIcon className="w-5 h-5" />
              Фото
            </button>
            {imageFiles.length > 0 && (
              <span className="text-xs text-[var(--text-secondary)]">
                {imageFiles.length}/{MAX_IMAGES}
              </span>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageSelect}
          />

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            size="default"
          >
            {(submitting || uploading) && (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            )}
            Опубликовать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
