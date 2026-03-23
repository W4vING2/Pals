"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Eye } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Story } from "@/lib/supabase";

interface StoryViewerProps {
  stories: Story[];
  startIndex?: number;
  onClose: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  return `${Math.floor(hours / 24)} дн. назад`;
}

const STORY_DURATION = 5000;

export function StoryViewer({ stories, startIndex = 0, onClose }: StoryViewerProps) {
  const { user } = useAuthStore();
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());
  const elapsedRef = useRef(0);
  const touchStartY = useRef(0);

  const currentStory = stories[currentIndex];
  const isOwnStory = user?.id === currentStory?.user_id;

  const goNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((i) => i + 1);
      setProgress(0);
      elapsedRef.current = 0;
    } else {
      onClose();
    }
  }, [currentIndex, stories.length, onClose]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setProgress(0);
      elapsedRef.current = 0;
    }
  }, [currentIndex]);

  // Mark story as viewed
  useEffect(() => {
    if (!user || !currentStory || isOwnStory) return;
    const supabase = getSupabaseBrowserClient();
    supabase
      .from("story_views")
      .upsert({ story_id: currentStory.id, viewer_id: user.id })
      .then(() => {});
  }, [currentStory?.id, user, isOwnStory, currentStory]);

  // Load view counts for own stories
  useEffect(() => {
    if (!isOwnStory || !currentStory) return;
    const supabase = getSupabaseBrowserClient();
    supabase
      .from("story_views")
      .select("id", { count: "exact" })
      .eq("story_id", currentStory.id)
      .then(({ count }) => {
        if (count !== null) {
          setViewCounts((prev) => ({ ...prev, [currentStory.id]: count }));
        }
      });
  }, [currentStory?.id, isOwnStory, currentStory]);

  // Timer for auto-advance
  useEffect(() => {
    if (paused) return;

    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = elapsedRef.current + (Date.now() - startTimeRef.current);
      const p = Math.min(elapsed / STORY_DURATION, 1);
      setProgress(p);

      if (p >= 1) {
        goNext();
      }
    }, 50);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, paused, goNext]);

  // Pause/resume handling
  const handlePause = () => {
    elapsedRef.current += Date.now() - startTimeRef.current;
    setPaused(true);
  };

  const handleResume = () => {
    startTimeRef.current = Date.now();
    setPaused(false);
  };

  // Touch/click handlers
  const handleTapArea = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 3) {
      goPrev();
    } else {
      goNext();
    }
  };

  // Swipe down to close
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientY - touchStartY.current;
    if (diff > 100) {
      onClose();
    }
  };

  // Keyboard support
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev, onClose]);

  if (!currentStory) return null;

  const profile = currentStory.profiles;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 px-2 pt-2">
          {stories.map((_, i) => (
            <div
              key={i}
              className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden"
            >
              <motion.div
                className="h-full bg-white rounded-full"
                style={{
                  width:
                    i < currentIndex
                      ? "100%"
                      : i === currentIndex
                      ? `${progress * 100}%`
                      : "0%",
                }}
              />
            </div>
          ))}
        </div>

        {/* User info */}
        <div className="absolute top-6 left-0 right-0 z-10 flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-white/20 flex items-center justify-center">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs text-white">
                  {(profile?.display_name || profile?.username || "?")[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                {profile?.display_name || profile?.username || "?"}
              </p>
              <p className="text-[10px] text-white/60">
                {timeAgo(currentStory.created_at)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Story content */}
        <div
          className="absolute inset-0 flex items-center justify-center cursor-pointer"
          onClick={handleTapArea}
          onMouseDown={handlePause}
          onMouseUp={handleResume}
          onMouseLeave={handleResume}
          onTouchStart={(e) => {
            handlePause();
            handleTouchStart(e);
          }}
          onTouchEnd={(e) => {
            handleResume();
            handleTouchEnd(e);
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStory.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="w-full h-full"
            >
              {currentStory.image_url ? (
                <img
                  src={currentStory.image_url}
                  alt=""
                  className="w-full h-full object-contain"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center p-8"
                  style={{ backgroundColor: currentStory.bg_color || "#1a1a2e" }}
                >
                  <p className="text-white text-xl sm:text-2xl font-semibold text-center leading-relaxed max-w-md">
                    {currentStory.text_content}
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* View count for own stories */}
        {isOwnStory && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-8 left-0 right-0 z-10 flex justify-center"
          >
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm">
              <Eye className="w-4 h-4 text-white/70" />
              <span className="text-sm text-white/70">
                {viewCounts[currentStory.id] ?? 0}
              </span>
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
