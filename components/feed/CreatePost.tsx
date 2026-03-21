"use client";

import React, { useState, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import Image from "next/image";

interface CreatePostProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
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

  const name = profile?.display_name ?? profile?.username ?? "You";
  const canSubmit = (content.trim().length > 0 || imageFile !== null) && !submitting;

  return (
    <Modal open={open} onClose={onClose} title="New post" maxWidth="lg">
      <div className="space-y-4">
        {/* Author */}
        <div className="flex items-center gap-3">
          <Avatar src={profile?.avatar_url} name={name} size="md" />
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{name}</p>
            {profile?.username && (
              <p className="text-xs text-[var(--text-secondary)]">@{profile.username}</p>
            )}
          </div>
        </div>

        {/* Textarea */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind?"
          rows={4}
          maxLength={500}
          className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-2xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] resize-none focus:outline-none focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 transition-all duration-150"
        />

        {/* Char count */}
        <div className="flex justify-end">
          <span className={`text-xs ${content.length > 450 ? "text-amber-400" : "text-[var(--text-secondary)]"}`}>
            {content.length}/500
          </span>
        </div>

        {/* Image preview */}
        {imagePreview && (
          <div className="relative rounded-2xl overflow-hidden bg-[var(--bg-elevated)]">
            <Image
              src={imagePreview}
              alt="Preview"
              width={600}
              height={400}
              className="w-full object-cover max-h-64"
            />
            <button
              onClick={removeImage}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-[var(--overlay)] text-white flex items-center justify-center hover:bg-black/80 transition-colors"
              aria-label="Remove image"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 2l12 12M14 2L2 14" />
              </svg>
            </button>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 rounded-xl px-3 py-2">{error}</p>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent-blue)] transition-all duration-150"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
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
            loading={submitting || uploading}
            size="md"
          >
            Post
          </Button>
        </div>
      </div>
    </Modal>
  );
}
