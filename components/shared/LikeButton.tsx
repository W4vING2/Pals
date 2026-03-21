"use client";

import React, { useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface LikeButtonProps {
  liked: boolean;
  count: number;
  onToggle: () => void;
  className?: string;
}

function Particle({ index, total }: { index: number; total: number }) {
  const angle = (index / total) * 360;
  const rad = (angle * Math.PI) / 180;
  const distance = 16 + Math.random() * 8;

  return (
    <motion.span
      className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
      style={{
        backgroundColor: index % 2 === 0 ? "hsl(0 72% 51%)" : "hsl(340 80% 60%)",
      }}
      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
      animate={{
        x: Math.cos(rad) * distance,
        y: Math.sin(rad) * distance,
        scale: 0,
        opacity: 0,
      }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    />
  );
}

export function LikeButton({ liked, count, onToggle, className }: LikeButtonProps) {
  const particleKey = useRef(0);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      particleKey.current += 1;
      onToggle();
    },
    [onToggle]
  );

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex items-center gap-1.5 text-sm transition-colors",
        liked
          ? "text-red-500"
          : "text-[var(--text-secondary)] hover:text-red-400",
        className
      )}
      aria-label={liked ? "Unlike" : "Like"}
    >
      <span className="relative flex items-center justify-center">
        <AnimatePresence mode="wait">
          {liked ? (
            <motion.span
              key="filled"
              initial={{ scale: 0.5 }}
              animate={{ scale: [1.3, 1] }}
              exit={{ scale: 0.5 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
            >
              <Heart className="h-[18px] w-[18px] fill-current" />
            </motion.span>
          ) : (
            <motion.span
              key="outline"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              transition={{ duration: 0.15 }}
            >
              <Heart className="h-[18px] w-[18px]" />
            </motion.span>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {liked && (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <Particle key={`${particleKey.current}-${i}`} index={i} total={6} />
              ))}
            </>
          )}
        </AnimatePresence>
      </span>

      {count > 0 && (
        <motion.span
          key={count}
          initial={{ y: -4, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="tabular-nums"
        >
          {count}
        </motion.span>
      )}
    </button>
  );
}
