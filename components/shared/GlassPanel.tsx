"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  intensity?: "light" | "strong";
}

const styles = {
  light: {
    background: "rgba(15, 18, 25, 0.72)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    backdropFilter: "blur(16px) saturate(1.6)",
    WebkitBackdropFilter: "blur(16px) saturate(1.6)",
  },
  strong: {
    background: "rgba(15, 18, 25, 0.72)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    backdropFilter: "blur(24px) saturate(1.8)",
    WebkitBackdropFilter: "blur(24px) saturate(1.8)",
  },
} as const;

export function GlassPanel({ children, className, intensity = "light" }: GlassPanelProps) {
  return (
    <div className={cn("rounded-xl", className)} style={styles[intensity]}>
      {children}
    </div>
  );
}
