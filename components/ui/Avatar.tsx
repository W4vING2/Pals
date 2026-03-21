"use client";

import React from "react";
import Image from "next/image";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: AvatarSize;
  online?: boolean;
  className?: string;
}

const sizeMap: Record<AvatarSize, { px: number; text: string; indicator: string }> = {
  xs: { px: 24, text: "text-[10px]", indicator: "w-2 h-2 border" },
  sm: { px: 32, text: "text-xs", indicator: "w-2.5 h-2.5 border" },
  md: { px: 40, text: "text-sm", indicator: "w-3 h-3 border-2" },
  lg: { px: 56, text: "text-base", indicator: "w-3.5 h-3.5 border-2" },
  xl: { px: 80, text: "text-xl", indicator: "w-4 h-4 border-2" },
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function nameToColor(name: string): string {
  const colors = [
    "from-blue-500 to-violet-500",
    "from-emerald-500 to-teal-400",
    "from-pink-500 to-rose-400",
    "from-amber-400 to-orange-500",
    "from-cyan-400 to-blue-500",
    "from-violet-500 to-purple-600",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ src, name, size = "md", online, className = "" }: AvatarProps) {
  const { px, text, indicator } = sizeMap[size];
  const dim = `${px}px`;
  const initials = name ? getInitials(name) : "?";
  const gradient = name ? nameToColor(name) : "from-gray-500 to-gray-600";

  return (
    <div
      className={`relative shrink-0 rounded-full ${className}`}
      style={{ width: dim, height: dim }}
    >
      {src ? (
        <Image
          src={src}
          alt={name ?? "avatar"}
          width={px}
          height={px}
          className="rounded-full object-cover w-full h-full"
        />
      ) : (
        <div
          className={`w-full h-full rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center font-semibold text-white ${text} select-none`}
        >
          {initials}
        </div>
      )}

      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 rounded-full ${indicator} border-[var(--bg-base)] ${
            online ? "bg-[var(--accent-mint)]" : "bg-[var(--text-secondary)]"
          }`}
        />
      )}
    </div>
  );
}
