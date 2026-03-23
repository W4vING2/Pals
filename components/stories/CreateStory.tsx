"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ImageIcon, Type, X, Loader2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface CreateStoryProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const BG_COLORS = [
  "#1a1a2e",
  "#e74c3c",
  "#2ecc71",
  "#3498db",
  "#9b59b6",
  "#f39c12",
  "#1abc9c",
  "#e91e63",
];

type Tab = "photo" | "text";

export function CreateStory({ open, onClose, onCreated }: CreateStoryProps) {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>("photo");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [textContent, setTextContent] = useState("");
  const [bgColor, setBgColor] = useState(BG_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("Изображение должно быть менее 10 МБ");
      return;
    }

    setError(null);
    setImageFile(file);

    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSubmit = async () => {
    if (!user) return;

    if (tab === "photo" && !imageFile) {
      setError("Выберите фото для истории");
      return;
    }
    if (tab === "text" && !textContent.trim()) {
      setError("Введите текст для истории");
      return;
    }

    setSubmitting(true);
    setError(null);
    const supabase = getSupabaseBrowserClient();

    try {
      let imageUrl: string | null = null;

      if (tab === "photo" && imageFile) {
        const timestamp = Date.now();
        const ext = imageFile.name.split(".").pop();
        const path = `stories/${user.id}/${timestamp}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("media")
          .upload(path, imageFile);

        if (uploadError) {
          setError("Не удалось загрузить изображение");
          setSubmitting(false);
          return;
        }

        const { data } = supabase.storage.from("media").getPublicUrl(path);
        imageUrl = data.publicUrl;
      }

      const { error: insertError } = await supabase.from("stories").insert({
        user_id: user.id,
        image_url: imageUrl,
        text_content: tab === "text" ? textContent.trim() : null,
        bg_color: tab === "text" ? bgColor : "#1a1a2e",
      });

      if (insertError) {
        setError("Не удалось создать историю");
      } else {
        // Reset state
        setImageFile(null);
        setImagePreview(null);
        setTextContent("");
        setBgColor(BG_COLORS[0]);
        setTab("photo");
        onCreated();
        onClose();
      }
    } catch {
      setError("Произошла ошибка");
    }

    setSubmitting(false);
  };

  const resetAndClose = () => {
    setImageFile(null);
    setImagePreview(null);
    setTextContent("");
    setBgColor(BG_COLORS[0]);
    setError(null);
    setTab("photo");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) resetAndClose(); }}>
      <DialogContent className="sm:max-w-md bg-[var(--bg-surface)] border-[var(--border)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-primary)]">
            Новая история
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex rounded-xl bg-[var(--bg-elevated)] p-1 gap-1">
          <button
            onClick={() => setTab("photo")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === "photo"
                ? "bg-[var(--accent-blue)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            <ImageIcon className="w-4 h-4" />
            Фото
          </button>
          <button
            onClick={() => setTab("text")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === "text"
                ? "bg-[var(--accent-blue)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            <Type className="w-4 h-4" />
            Текст
          </button>
        </div>

        <AnimatePresence mode="wait">
          {tab === "photo" ? (
            <motion.div
              key="photo"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
              className="space-y-3"
            >
              {imagePreview ? (
                <div className="relative rounded-xl overflow-hidden bg-[var(--bg-elevated)] aspect-[9/16] max-h-[300px]">
                  <Image
                    src={imagePreview}
                    alt="Превью"
                    fill
                    className="object-cover"
                  />
                  <button
                    onClick={removeImage}
                    className={cn(
                      "absolute top-2 right-2 w-7 h-7 rounded-full",
                      "bg-black/60 text-white flex items-center justify-center",
                      "hover:bg-black/80 transition-colors"
                    )}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "w-full aspect-[9/16] max-h-[300px] rounded-xl border-2 border-dashed",
                    "border-[var(--border)] bg-[var(--bg-elevated)]",
                    "flex flex-col items-center justify-center gap-2",
                    "text-[var(--text-secondary)] hover:border-[var(--accent-blue)]",
                    "hover:text-[var(--accent-blue)] transition-colors cursor-pointer"
                  )}
                >
                  <ImageIcon className="w-8 h-8" />
                  <span className="text-sm">Выбрать фото</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
            </motion.div>
          ) : (
            <motion.div
              key="text"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-3"
            >
              {/* Preview */}
              <div
                className="rounded-xl aspect-[9/16] max-h-[200px] flex items-center justify-center p-6 overflow-hidden"
                style={{ backgroundColor: bgColor }}
              >
                <p className="text-white text-sm font-semibold text-center leading-relaxed">
                  {textContent || "Введите текст..."}
                </p>
              </div>

              {/* Text input */}
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Введите текст для истории..."
                maxLength={200}
                rows={3}
                className={cn(
                  "w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-4 py-3",
                  "text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]",
                  "resize-none outline-none input-focus transition-all duration-150"
                )}
              />

              {/* Color palette */}
              <div>
                <p className="text-xs text-[var(--text-secondary)] mb-2">Цвет фона</p>
                <div className="flex gap-2 flex-wrap">
                  {BG_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setBgColor(color)}
                      className={cn(
                        "w-8 h-8 rounded-full transition-transform flex items-center justify-center",
                        bgColor === color && "scale-110 ring-2 ring-white/50"
                      )}
                      style={{ backgroundColor: color }}
                    >
                      {bgColor === color && (
                        <Check className="w-4 h-4 text-white" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Char count */}
              <div className="flex justify-end">
                <span
                  className={cn(
                    "text-xs",
                    textContent.length > 180
                      ? "text-amber-400"
                      : "text-[var(--text-secondary)]"
                  )}
                >
                  {textContent.length}/200
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 rounded-xl px-3 py-2">{error}</p>
        )}

        <DialogFooter className="flex-row items-center justify-end">
          <Button onClick={handleSubmit} disabled={submitting} size="default">
            {submitting && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            Опубликовать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
