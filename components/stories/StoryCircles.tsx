"use client";

import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { CACHE_TTL, useAppDataStore, useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { dedupeRequest, getCachedQuery, isCacheFresh, setCachedQuery } from "@/lib/cache";
import type { Story, Profile } from "@/lib/supabase";

type StoryWithProfile = Story & { profiles: Profile };

type GroupedStories = {
  userId: string;
  profile: Profile;
  stories: StoryWithProfile[];
  hasUnseen: boolean;
};

type StoriesCacheValue = {
  groups: GroupedStories[];
  ownProfile: Profile | null;
  viewedIds: string[];
};

const STORIES_CACHE_KEY = "stories";

interface StoryCirclesProps {
  onOpenViewer: (userId: string, stories: Story[]) => void;
  onCreateStory: () => void;
}

export function StoryCircles({ onOpenViewer, onCreateStory }: StoryCirclesProps) {
  const { user } = useAuthStore();
  const cachedGroups = useAppDataStore((s) => s.storyGroups);
  const cachedOwnProfile = useAppDataStore((s) => s.ownStoryProfile);
  const cachedViewedStoryIds = useAppDataStore((s) => s.viewedStoryIds);
  const storiesLoadedAt = useAppDataStore((s) => s.storiesLoadedAt);
  const setCachedStories = useAppDataStore((s) => s.setStories);
  const [groups, setGroups] = useState<GroupedStories[]>(cachedGroups);
  const [ownProfile, setOwnProfile] = useState<Profile | null>(cachedOwnProfile);
  const [hasOwnStory, setHasOwnStory] = useState(false);
  const [viewedStoryIds, setViewedStoryIds] = useState<Set<string>>(
    () => new Set(cachedViewedStoryIds)
  );

  useEffect(() => {
    setGroups(cachedGroups);
    setOwnProfile(cachedOwnProfile);
    setViewedStoryIds(new Set(cachedViewedStoryIds));
    if (user) setHasOwnStory(cachedGroups.some((group) => group.userId === user.id));
  }, [cachedGroups, cachedOwnProfile, cachedViewedStoryIds, user]);

  const loadStories = useCallback(async (force = false) => {
    if (!user) return;

    const memoryFresh = Date.now() - storiesLoadedAt < CACHE_TTL.stories;
    if (!force && storiesLoadedAt > 0 && memoryFresh) return;

    if (!force && storiesLoadedAt === 0) {
      const cached = await getCachedQuery<StoriesCacheValue>(user.id, STORIES_CACHE_KEY);
      if (cached?.value) {
        setCachedStories(
          cached.value.groups,
          cached.value.ownProfile,
          cached.value.viewedIds,
          cached.updated_at
        );
        setGroups(cached.value.groups);
        setOwnProfile(cached.value.ownProfile);
        setViewedStoryIds(new Set(cached.value.viewedIds));
        setHasOwnStory(cached.value.groups.some((group) => group.userId === user.id));
        if (isCacheFresh(cached)) return;
      }
    }

    const supabase = getSupabaseBrowserClient();

    const result = await dedupeRequest(`${user.id}:${STORIES_CACHE_KEY}`, async () => {
      const { data: stories, error } = await supabase
        .from("stories")
        .select("*, profiles:user_id(id, username, display_name, avatar_url)")
        .gt("expires_at", new Date().toISOString())
        .order("created_at");

      if (error || !stories) return null;

      const storyIds = stories.map((s: StoryWithProfile) => s.id);
      const { data: views } = storyIds.length > 0
        ? await supabase
            .from("story_views")
            .select("story_id")
            .eq("viewer_id", user.id)
            .in("story_id", storyIds)
        : { data: [] };

      const nextViewedIds = views?.map((v: { story_id: string }) => v.story_id) ?? [];

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      const nextOwnProfile = (profile as Profile | null) ?? null;
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

      const viewedSet = new Set(nextViewedIds);
      const nextGroups = Array.from(groupMap.values()).map((group) => ({
        ...group,
        hasUnseen: group.stories.some((story) => !viewedSet.has(story.id)),
      }));

      return {
        groups: nextGroups,
        ownProfile: nextOwnProfile,
        viewedIds: nextViewedIds,
      };
    });

    if (!result) return;

    setCachedStories(result.groups, result.ownProfile, result.viewedIds);
    setGroups(result.groups);
    setOwnProfile(result.ownProfile);
    setViewedStoryIds(new Set(result.viewedIds));
    setHasOwnStory(result.groups.some((group) => group.userId === user.id));
    void setCachedQuery(user.id, STORIES_CACHE_KEY, result, CACHE_TTL.stories);
  }, [cachedGroups, setCachedStories, storiesLoadedAt, user]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

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
