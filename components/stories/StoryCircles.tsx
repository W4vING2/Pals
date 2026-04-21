"use client";

import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Story, Profile } from "@/lib/supabase";

type StoryWithProfile = Story & { profiles: Profile };

type GroupedStories = {
  userId: string;
  profile: Profile;
  stories: StoryWithProfile[];
  hasUnseen: boolean;
};

interface StoryCirclesProps {
  onOpenViewer: (userId: string, stories: Story[]) => void;
  onCreateStory: () => void;
}

export function StoryCircles({ onOpenViewer, onCreateStory }: StoryCirclesProps) {
  const { user } = useAuthStore();
  const [groups, setGroups] = useState<GroupedStories[]>([]);
  const [ownProfile, setOwnProfile] = useState<Profile | null>(null);
  const [hasOwnStory, setHasOwnStory] = useState(false);
  const [viewedStoryIds, setViewedStoryIds] = useState<Set<string>>(new Set());

  const loadStories = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();

    const { data: stories, error } = await supabase
      .from("stories")
      .select("*, profiles:user_id(id, username, display_name, avatar_url)")
      .gt("expires_at", new Date().toISOString())
      .order("created_at");

    if (error || !stories) return;

    // Load viewed story ids
    const storyIds = stories.map((s: StoryWithProfile) => s.id);
    if (storyIds.length > 0) {
      const { data: views } = await supabase
        .from("story_views")
        .select("story_id")
        .eq("viewer_id", user.id)
        .in("story_id", storyIds);

      if (views) {
        setViewedStoryIds(new Set(views.map((v: { story_id: string }) => v.story_id)));
      }
    }

    // Load own profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profile) setOwnProfile(profile as Profile);

    // Group by user
    const groupMap = new Map<string, GroupedStories>();

    for (const story of stories as StoryWithProfile[]) {
      const existing = groupMap.get(story.user_id);
      if (existing) {
        existing.stories.push(story);
      } else {
        groupMap.set(story.user_id, {
          userId: story.user_id,
          profile: story.profiles,
          stories: [story],
          hasUnseen: false,
        });
      }
    }

    // Check unseen status (will be updated after viewedStoryIds is set)
    const grouped = Array.from(groupMap.values());
    setGroups(grouped);
    setHasOwnStory(groupMap.has(user.id));
  }, [user]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  // Update unseen status when viewedStoryIds changes
  useEffect(() => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        hasUnseen: g.stories.some((s) => !viewedStoryIds.has(s.id)),
      }))
    );
  }, [viewedStoryIds]);

  if (!user) return null;

  const ownGroup = groups.find((g) => g.userId === user.id);
  const otherGroups = groups.filter((g) => g.userId !== user.id);

  // Sort: unseen first
  otherGroups.sort((a, b) => {
    if (a.hasUnseen && !b.hasUnseen) return -1;
    if (!a.hasUnseen && b.hasUnseen) return 1;
    return 0;
  });

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="mb-4 -mx-4 px-4">
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {/* Own story circle */}
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          onClick={() => {
            if (hasOwnStory && ownGroup) {
              onOpenViewer(user.id, ownGroup.stories);
            } else {
              onCreateStory();
            }
          }}
          className="flex flex-col items-center gap-1 flex-shrink-0"
        >
          <div className="relative">
            <div
              className={cn(
                "w-16 h-16 rounded-full p-[2.5px]",
                hasOwnStory
                  ? "bg-gradient-to-br from-[var(--accent-blue)] via-purple-500 to-pink-500"
                  : "bg-[var(--border)]"
              )}
            >
              <div className="w-full h-full rounded-full bg-[var(--bg-surface)] p-[2px]">
                <div className="w-full h-full rounded-full overflow-hidden bg-[var(--bg-elevated)] flex items-center justify-center">
                  {(ownProfile?.avatar_url || ownGroup?.profile?.avatar_url) ? (
                    <img
                      src={ownProfile?.avatar_url || ownGroup?.profile?.avatar_url || ""}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-xs text-[var(--text-secondary)]">
                      {getInitials(ownProfile?.display_name || ownProfile?.username || "Вы")}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {!hasOwnStory && (
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[var(--accent-blue)] border-2 border-[var(--bg-surface)] flex items-center justify-center">
                <Plus className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
          <span className="text-[10px] text-[var(--text-secondary)] max-w-[64px] truncate">
            {hasOwnStory ? "Моя история" : "Добавить"}
          </span>
        </motion.button>

        {/* Other users' stories */}
        {otherGroups.map((group, i) => (
          <motion.button
            key={group.userId}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: (i + 1) * 0.05 }}
            onClick={() => onOpenViewer(group.userId, group.stories)}
            className="flex flex-col items-center gap-1 flex-shrink-0"
          >
            <div
              className={cn(
                "w-16 h-16 rounded-full p-[2.5px]",
                group.hasUnseen
                  ? "bg-gradient-to-br from-[var(--accent-blue)] via-purple-500 to-pink-500"
                  : "bg-[var(--text-secondary)]/30"
              )}
            >
              <div className="w-full h-full rounded-full bg-[var(--bg-surface)] p-[2px]">
                <div className="w-full h-full rounded-full overflow-hidden bg-[var(--bg-elevated)] flex items-center justify-center">
                  {group.profile?.avatar_url ? (
                    <img
                      src={group.profile.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-xs text-[var(--text-secondary)]">
                      {getInitials(group.profile?.display_name || group.profile?.username || "?")}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <span className="text-[10px] text-[var(--text-secondary)] max-w-[64px] truncate">
              {group.profile?.display_name || group.profile?.username || "?"}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
