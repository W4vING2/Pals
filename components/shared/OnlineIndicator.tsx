"use client";

import { cn } from "@/lib/utils";

interface OnlineIndicatorProps {
  isOnline: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "size-2.5",
  md: "size-3",
  lg: "size-3.5",
};

export function OnlineIndicator({
  isOnline,
  size = "md",
  className,
}: OnlineIndicatorProps) {
  if (!isOnline) return null;

  return (
    <span
      className={cn(
        "absolute bottom-0 right-0 rounded-full bg-emerald-500 ring-2 ring-[var(--bg-base)]",
        sizeClasses[size],
        className
      )}
    />
  );
}
