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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10MB");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    setError(null);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!user || (!content.trim() && !imageFile)) return;
    setSubmitting(true);
    setError(null);
    const supabase = getSupabaseBrowserClient();

    let imageUrl: string | null = null;

    if (imageFile) {
      setUploading(true);
      const ext = imageFile.name.split(".").pop();
      const path = `posts/${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(path, imageFile);

      if (uploadError) {
        setError("Failed to upload image");
        setUploading(false);
        setSubmitting(false);
        return;
      }

      const { data } = supabase.storage.from("media").getPublicUrl(path);
      imageUrl = data.publicUrl;
      setUploading(false);
    }

    const { error: insertError } = await supabase.from("posts").insert({
      user_id: user.id,
      content: content.trim() || null,
      image_url: imageUrl,
    });

    if (insertError) {
      setError("Failed to create post");
    } else {
      setContent("");
      setImageFile(null);
      setImagePreview(null);
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

  const name = profile?.display_name ?? profile?.username ?? "You";
  const canSubmit = (content.trim().length > 0 || imageFile !== null) && !submitting;

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-lg bg-[var(--bg-surface)] border-[var(--border)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-primary)]">New post</DialogTitle>
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
            placeholder="What's on your mind?"
            rows={3}
            maxLength={500}
            className={cn(
              "w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-4 py-3",
              "text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]",
              "resize-none focus:outline-none focus:border-[var(--accent-blue)]",
              "focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-all duration-150",
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

          {/* Image preview */}
          {imagePreview && (
            <div className="relative rounded-xl overflow-hidden bg-[var(--bg-elevated)]">
              <Image
                src={imagePreview}
                alt="Preview"
                width={600}
                height={400}
                className="w-full object-cover max-h-64"
              />
              <button
                onClick={removeImage}
                className={cn(
                  "absolute top-2 right-2 w-7 h-7 rounded-full",
                  "bg-black/60 text-white flex items-center justify-center",
                  "hover:bg-black/80 transition-colors"
                )}
                aria-label="Remove image"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between">
          <button
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-xl text-sm",
              "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)]",
              "transition-colors"
            )}
          >
            <ImageIcon className="w-5 h-5" />
            Photo
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
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
            Post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
