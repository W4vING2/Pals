"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Hash, Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";

interface CreateTopicModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (topic: any) => void;
}

export function CreateTopicModal({ open, onClose, onCreated }: CreateTopicModalProps) {
  const { user } = useAuthStore();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setTagsInput("");
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;

    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data, error: insertError } = await (supabase as any)
      .from("topics")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        created_by: user.id,
        expires_at: expiresAt,
        tags,
      })
      .select()
      .single();

    setLoading(false);

    if (insertError) {
      setError("Не удалось создать топик. Попробуйте ещё раз.");
      return;
    }

    onCreated(data);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Bottom sheet */}
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 35, mass: 0.9 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-surface)] rounded-t-3xl border-t border-[var(--border)] shadow-2xl pb-safe"
          >
            <div className="max-w-lg mx-auto px-5 pt-5 pb-8">
              {/* Handle */}
              <div className="w-10 h-1 rounded-full bg-[var(--border)] mx-auto mb-5" />

              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Hash className="w-5 h-5 text-[var(--accent-blue)]" />
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">Новый топик</h2>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center hover:opacity-70 transition-opacity text-[var(--text-secondary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Название <span className="text-[var(--accent-blue)]">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, 50))}
                    placeholder="музыка, кино, помощь с учёбой..."
                    maxLength={50}
                    required
                    className="w-full bg-[var(--bg-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] rounded-xl px-4 py-3 text-sm outline-none border border-[var(--border)] focus:border-[var(--accent-blue)] transition-colors"
                  />
                  <p className="text-xs text-[var(--text-secondary)] text-right mt-1">
                    {title.length}/50
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Описание <span className="opacity-50">(необязательно)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                    placeholder="О чём этот топик?"
                    maxLength={200}
                    className="w-full resize-none bg-[var(--bg-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] rounded-xl px-4 py-3 text-sm outline-none border border-[var(--border)] focus:border-[var(--accent-blue)] transition-colors"
                  />
                  <p className="text-xs text-[var(--text-secondary)] text-right mt-1">
                    {description.length}/200
                  </p>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Теги <span className="opacity-50">(через запятую)</span>
                  </label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="музыка, джаз, классика"
                    className="w-full bg-[var(--bg-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] rounded-xl px-4 py-3 text-sm outline-none border border-[var(--border)] focus:border-[var(--accent-blue)] transition-colors"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-500 text-center">{error}</p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={!title.trim() || loading}
                  className="w-full py-3.5 rounded-2xl bg-[var(--accent-blue)] text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Создаём...
                    </>
                  ) : (
                    "Создать топик"
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
