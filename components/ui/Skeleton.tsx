"use client";

import React from "react";

interface SkeletonProps {
  className?: string;
}

function SkeletonBase({ className = "" }: SkeletonProps) {
  return <div className={`skeleton rounded-xl ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-[var(--bg-surface)] rounded-3xl p-4 border border-[var(--border)] space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SkeletonBase className="w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <SkeletonBase className="h-3.5 w-32" />
          <SkeletonBase className="h-3 w-20" />
        </div>
      </div>
      {/* Content */}
      <div className="space-y-2">
        <SkeletonBase className="h-4 w-full" />
        <SkeletonBase className="h-4 w-4/5" />
        <SkeletonBase className="h-4 w-3/5" />
      </div>
      {/* Image placeholder (sometimes) */}
      <SkeletonBase className="h-48 w-full rounded-2xl" />
      {/* Actions */}
      <div className="flex gap-4 pt-1">
        <SkeletonBase className="h-8 w-16 rounded-xl" />
        <SkeletonBase className="h-8 w-16 rounded-xl" />
        <SkeletonBase className="h-8 w-16 rounded-xl" />
      </div>
    </div>
  );
}

export function SkeletonProfile() {
  return (
    <div className="space-y-4">
      {/* Cover */}
      <SkeletonBase className="h-40 w-full rounded-3xl" />
      {/* Avatar + info */}
      <div className="px-4 space-y-3">
        <div className="flex items-end justify-between -mt-12">
          <SkeletonBase className="w-20 h-20 rounded-full border-4 border-[var(--bg-base)]" />
          <SkeletonBase className="h-9 w-24 rounded-2xl" />
        </div>
        <div className="space-y-2">
          <SkeletonBase className="h-5 w-40" />
          <SkeletonBase className="h-4 w-24" />
          <SkeletonBase className="h-4 w-full" />
          <SkeletonBase className="h-4 w-3/5" />
        </div>
        {/* Stats */}
        <div className="flex gap-6 pt-2">
          <div className="space-y-1">
            <SkeletonBase className="h-5 w-8" />
            <SkeletonBase className="h-3 w-12" />
          </div>
          <div className="space-y-1">
            <SkeletonBase className="h-5 w-8" />
            <SkeletonBase className="h-3 w-16" />
          </div>
          <div className="space-y-1">
            <SkeletonBase className="h-5 w-8" />
            <SkeletonBase className="h-3 w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonMessage() {
  return (
    <div className="space-y-4 px-4">
      {/* Incoming */}
      <div className="flex items-end gap-2">
        <SkeletonBase className="w-8 h-8 rounded-full shrink-0" />
        <SkeletonBase className="h-10 w-48 rounded-2xl rounded-bl-sm" />
      </div>
      {/* Outgoing */}
      <div className="flex items-end justify-end gap-2">
        <SkeletonBase className="h-10 w-56 rounded-2xl rounded-br-sm" />
      </div>
      {/* Incoming */}
      <div className="flex items-end gap-2">
        <SkeletonBase className="w-8 h-8 rounded-full shrink-0" />
        <SkeletonBase className="h-16 w-64 rounded-2xl rounded-bl-sm" />
      </div>
      {/* Outgoing */}
      <div className="flex items-end justify-end gap-2">
        <SkeletonBase className="h-10 w-40 rounded-2xl rounded-br-sm" />
      </div>
    </div>
  );
}

export function SkeletonConversation() {
  return (
    <div className="flex items-center gap-3 p-4">
      <SkeletonBase className="w-12 h-12 rounded-full shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <div className="flex justify-between">
          <SkeletonBase className="h-4 w-28" />
          <SkeletonBase className="h-3 w-10" />
        </div>
        <SkeletonBase className="h-3 w-full" />
      </div>
    </div>
  );
}

export function SkeletonUserResult() {
  return (
    <div className="flex items-center gap-3 p-4">
      <SkeletonBase className="w-11 h-11 rounded-full shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <SkeletonBase className="h-4 w-32" />
        <SkeletonBase className="h-3 w-20" />
      </div>
      <SkeletonBase className="h-8 w-20 rounded-2xl" />
    </div>
  );
}
