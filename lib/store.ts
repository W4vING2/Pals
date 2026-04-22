import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import type {
  Conversation,
  ConversationParticipant,
  Message,
  Notification,
  Post,
  Profile,
  ProfileSummary,
  Story,
} from "./supabase";

export const CACHE_TTL = {
  feed: 60_000,
  conversations: 45_000,
  messages: 45_000,
  notifications: 60_000,
  profile: 180_000,
  stories: 180_000,
  blockedUsers: 180_000,
} as const;

export type CachedConversation = Conversation & {
  participants: Array<ConversationParticipant & { profiles: ProfileSummary }>;
  unread_count: number;
};

export type CachedStoryGroup = {
  userId: string;
  profile: Profile;
  stories: Array<Story & { profiles: Profile }>;
  hasUnseen: boolean;
};

export type ProfileCacheEntry = {
  profile: Profile | null;
  posts: Post[];
  loadedAt: number;
};

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures in private mode / quota pressure
  }
}

// ── Auth Store ─────────────────────────────────────────────

type AuthState = {
  user: User | null;
  profile: Profile | null;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  signOut: () => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  setUser: (user) => {
    const current = get().user;
    // Skip update if it's the same user (prevents cascade on token refresh)
    if (current && user && current.id === user.id) return;
    set({ user });
  },
  setProfile: (profile) => set({ profile }),
  signOut: () => set({ user: null, profile: null }),
}));

// ── Theme Store ────────────────────────────────────────────

type Theme = "dark" | "light";

type ThemeState = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: "dark",
  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === "dark" ? "light" : "dark";
      if (typeof window !== "undefined") {
        localStorage.setItem("pals-theme", next);
        document.documentElement.setAttribute("data-theme", next);
      }
      return { theme: next };
    }),
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("pals-theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
    }
    set({ theme });
  },
}));

// ── Call Store ─────────────────────────────────────────────

export type CallStatus = "ringing" | "connected";

export type CallInfo = {
  callerId: string;
  callerProfile: Profile | null;
  remoteUserId: string;
  remoteProfile: Profile | null;
  conversationId: string;
  type: "voice" | "video";
  signal?: string;
};

type CallState = {
  incomingCall: CallInfo | null;
  activeCall: CallInfo | null;
  callStatus: CallStatus | null;
  callError: string | null;
  setIncomingCall: (call: CallInfo | null) => void;
  setActiveCall: (call: CallInfo | null, status?: CallStatus) => void;
  setCallStatus: (status: CallStatus | null) => void;
  setCallError: (error: string | null) => void;
  endCall: () => void;
};

export const useCallStore = create<CallState>((set) => ({
  incomingCall: null,
  activeCall: null,
  callStatus: null,
  callError: null,
  setIncomingCall: (call) => set({ incomingCall: call }),
  setActiveCall: (call, status) => set({ activeCall: call, callStatus: status ?? "connected", callError: null }),
  setCallStatus: (callStatus) => set({ callStatus }),
  setCallError: (callError) => set({ callError }),
  endCall: () => set({ incomingCall: null, activeCall: null, callStatus: null, callError: null }),
}));

// ── Create Post Store ─────────────────────────────────────

type CreatePostState = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const useCreatePostStore = create<CreatePostState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

// ── Quick Actions Store ────────────────────────────────────

type QuickActionState = {
  expanded: boolean;
  createStoryOpen: boolean;
  storyRefreshKey: number;
  setExpanded: (expanded: boolean) => void;
  toggleExpanded: () => void;
  setCreateStoryOpen: (open: boolean) => void;
  bumpStoryRefreshKey: () => void;
};

export const useQuickActionStore = create<QuickActionState>((set) => ({
  expanded: false,
  createStoryOpen: false,
  storyRefreshKey: 0,
  setExpanded: (expanded) => set({ expanded }),
  toggleExpanded: () => set((state) => ({ expanded: !state.expanded })),
  setCreateStoryOpen: (createStoryOpen) =>
    set((state) => ({
      createStoryOpen,
      expanded: createStoryOpen ? false : state.expanded,
    })),
  bumpStoryRefreshKey: () =>
    set((state) => ({ storyRefreshKey: state.storyRefreshKey + 1 })),
}));

// ── Messages Store ────────────────────────────────────────

type MessagesStoreState = {
  pendingConversationId: string | null;
  setPendingConversationId: (id: string | null) => void;
};

export const useMessagesStore = create<MessagesStoreState>((set) => ({
  pendingConversationId: null,
  setPendingConversationId: (id) => set({ pendingConversationId: id }),
}));

// ── App Data Cache Store ────────────────────────────────────

type AppDataState = {
  followingPosts: Post[];
  trendingPosts: Post[];
  recommendedUsers: Profile[];
  likedPostIds: string[];
  feedLoadedAt: number;
  trendingLoadedAt: number;
  conversations: CachedConversation[];
  conversationsLoadedAt: number;
  messagesByConversation: Record<string, Message[]>;
  messagesLoadedAt: Record<string, number>;
  notifications: Notification[];
  notificationsLoadedAt: number;
  profilesByUsername: Record<string, ProfileCacheEntry>;
  storyGroups: CachedStoryGroup[];
  ownStoryProfile: Profile | null;
  viewedStoryIds: string[];
  storiesLoadedAt: number;
  blockedIds: string[];
  blockedLoadedAt: number;
  refreshingKeys: Record<string, boolean>;
  setFollowingPosts: (posts: Post[], loadedAt?: number) => void;
  setTrendingData: (posts: Post[], users: Profile[], loadedAt?: number) => void;
  setLikedPostIds: (ids: Iterable<string>, merge?: boolean) => void;
  removeLikedPostId: (id: string) => void;
  upsertFollowingPost: (post: Post) => void;
  patchPostCounts: (post: Pick<Post, "id"> & Partial<Post>) => void;
  removePost: (id: string) => void;
  setConversations: (conversations: CachedConversation[], loadedAt?: number) => void;
  patchConversation: (id: string, updater: (conversation: CachedConversation) => CachedConversation) => void;
  removeConversation: (id: string) => void;
  setMessagesForConversation: (conversationId: string, messages: Message[], loadedAt?: number) => void;
  appendMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updater: (message: Message) => Message) => void;
  removeMessage: (conversationId: string, messageId: string) => void;
  setNotifications: (notifications: Notification[], loadedAt?: number) => void;
  upsertNotification: (notification: Notification) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  setProfileCache: (username: string, entry: ProfileCacheEntry) => void;
  setStories: (groups: CachedStoryGroup[], ownProfile: Profile | null, viewedIds: Iterable<string>, loadedAt?: number) => void;
  setBlockedIds: (ids: Iterable<string>, loadedAt?: number) => void;
  setRefreshing: (key: string, refreshing: boolean) => void;
  clearAll: () => void;
};

const initialAppData = {
  followingPosts: [],
  trendingPosts: [],
  recommendedUsers: [],
  likedPostIds: [],
  feedLoadedAt: 0,
  trendingLoadedAt: 0,
  conversations: [],
  conversationsLoadedAt: 0,
  messagesByConversation: {},
  messagesLoadedAt: {},
  notifications: [],
  notificationsLoadedAt: 0,
  profilesByUsername: {},
  storyGroups: [],
  ownStoryProfile: null,
  viewedStoryIds: [],
  storiesLoadedAt: 0,
  blockedIds: [],
  blockedLoadedAt: 0,
  refreshingKeys: {},
};

function sameIdList<T extends { id: string }>(a: T[], b: T[]) {
  return a.length === b.length && a.every((item, index) => item.id === b[index]?.id);
}

function sameStringList(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export const useAppDataStore = create<AppDataState>((set) => ({
  ...initialAppData,
  setFollowingPosts: (followingPosts, loadedAt = Date.now()) =>
    set((state) =>
      sameIdList(state.followingPosts, followingPosts) && state.feedLoadedAt === loadedAt
        ? state
        : { followingPosts, feedLoadedAt: loadedAt }
    ),
  setTrendingData: (trendingPosts, recommendedUsers, loadedAt = Date.now()) =>
    set((state) =>
      sameIdList(state.trendingPosts, trendingPosts) &&
      sameIdList(state.recommendedUsers, recommendedUsers) &&
      state.trendingLoadedAt === loadedAt
        ? state
        : { trendingPosts, recommendedUsers, trendingLoadedAt: loadedAt }
    ),
  setLikedPostIds: (ids, merge = false) =>
    set((state) => {
      const next = new Set(merge ? state.likedPostIds : []);
      for (const id of ids) next.add(id);
      const likedPostIds = [...next];
      return sameStringList(state.likedPostIds, likedPostIds) ? state : { likedPostIds };
    }),
  removeLikedPostId: (id) =>
    set((state) => {
      if (!state.likedPostIds.includes(id)) return state;
      return { likedPostIds: state.likedPostIds.filter((item) => item !== id) };
    }),
  upsertFollowingPost: (post) =>
    set((state) => {
      const exists = state.followingPosts.some((item) => item.id === post.id);
      return {
        followingPosts: exists
          ? state.followingPosts.map((item) => (item.id === post.id ? { ...item, ...post } : item))
          : [post, ...state.followingPosts],
      };
    }),
  patchPostCounts: (post) =>
    set((state) => ({
      followingPosts: state.followingPosts.map((item) =>
        item.id === post.id ? { ...item, ...post } : item
      ),
      trendingPosts: state.trendingPosts.map((item) =>
        item.id === post.id ? { ...item, ...post } : item
      ),
    })),
  removePost: (id) =>
    set((state) => ({
      followingPosts: state.followingPosts.filter((post) => post.id !== id),
      trendingPosts: state.trendingPosts.filter((post) => post.id !== id),
    })),
  setConversations: (conversations, loadedAt = Date.now()) =>
    set((state) =>
      sameIdList(state.conversations, conversations) && state.conversationsLoadedAt === loadedAt
        ? state
        : { conversations, conversationsLoadedAt: loadedAt }
    ),
  patchConversation: (id, updater) =>
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === id ? updater(conversation) : conversation
      ),
    })),
  removeConversation: (id) =>
    set((state) => {
      if (!state.conversations.some((c) => c.id === id)) return state;
      return { conversations: state.conversations.filter((c) => c.id !== id) };
    }),
  setMessagesForConversation: (conversationId, messages, loadedAt = Date.now()) =>
    set((state) => {
      const current = state.messagesByConversation[conversationId] ?? [];
      if (sameIdList(current, messages) && state.messagesLoadedAt[conversationId] === loadedAt) {
        return state;
      }
      return {
        messagesByConversation: { ...state.messagesByConversation, [conversationId]: messages },
        messagesLoadedAt: { ...state.messagesLoadedAt, [conversationId]: loadedAt },
      };
    }),
  appendMessage: (conversationId, message) =>
    set((state) => {
      const current = state.messagesByConversation[conversationId] ?? [];
      if (current.some((item) => item.id === message.id)) return state;
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [...current, message],
        },
      };
    }),
  updateMessage: (conversationId, messageId, updater) =>
    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: (state.messagesByConversation[conversationId] ?? []).map((message) =>
          message.id === messageId ? updater(message) : message
        ),
      },
    })),
  removeMessage: (conversationId, messageId) =>
    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: (state.messagesByConversation[conversationId] ?? []).filter(
          (message) => message.id !== messageId
        ),
      },
    })),
  setNotifications: (notifications, loadedAt = Date.now()) =>
    set((state) =>
      sameIdList(state.notifications, notifications) && state.notificationsLoadedAt === loadedAt
        ? state
        : { notifications, notificationsLoadedAt: loadedAt }
    ),
  upsertNotification: (notification) =>
    set((state) => ({
      notifications: [
        notification,
        ...state.notifications.filter((item) => item.id !== notification.id),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    })),
  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((item) =>
        item.id === id ? { ...item, is_read: true } : item
      ),
    })),
  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((item) => ({ ...item, is_read: true })),
    })),
  setProfileCache: (username, entry) =>
    set((state) => ({
      profilesByUsername: { ...state.profilesByUsername, [username]: entry },
    })),
  setStories: (storyGroups, ownStoryProfile, viewedIds, loadedAt = Date.now()) =>
    set((state) => {
      const viewedStoryIds = [...viewedIds];
      if (
        sameIdList(state.storyGroups.map((group) => ({ id: group.userId })), storyGroups.map((group) => ({ id: group.userId }))) &&
        state.ownStoryProfile?.id === ownStoryProfile?.id &&
        sameStringList(state.viewedStoryIds, viewedStoryIds) &&
        state.storiesLoadedAt === loadedAt
      ) {
        return state;
      }
      return { storyGroups, ownStoryProfile, viewedStoryIds, storiesLoadedAt: loadedAt };
    }),
  setBlockedIds: (ids, loadedAt = Date.now()) =>
    set((state) => {
      const blockedIds = [...ids];
      return sameStringList(state.blockedIds, blockedIds) && state.blockedLoadedAt === loadedAt
        ? state
        : { blockedIds, blockedLoadedAt: loadedAt };
    }),
  setRefreshing: (key, refreshing) =>
    set((state) => ({
      refreshingKeys: { ...state.refreshingKeys, [key]: refreshing },
    })),
  clearAll: () => set({ ...initialAppData }),
}));

// ── Unread Messages Store ─────────────────────────────────

type UnreadMessagesState = {
  unreadMessagesCount: number;
  setUnreadMessagesCount: (n: number) => void;
  incrementUnreadMessages: () => void;
};

export const useUnreadMessagesStore = create<UnreadMessagesState>((set) => ({
  unreadMessagesCount: 0,
  setUnreadMessagesCount: (n) => {
    set({ unreadMessagesCount: n });
    // Update macOS dock badge if running in Electron
    if (typeof window !== "undefined" && window.palsDesktop?.setBadge) {
      window.palsDesktop.setBadge(n);
    }
  },
  incrementUnreadMessages: () =>
    set((s) => {
      const next = s.unreadMessagesCount + 1;
      if (typeof window !== "undefined" && window.palsDesktop?.setBadge) {
        window.palsDesktop.setBadge(next);
      }
      return { unreadMessagesCount: next };
    }),
}));

// ── Notification Store ─────────────────────────────────────

type NotificationState = {
  unreadCount: number;
  setUnreadCount: (n: number) => void;
  incrementUnread: () => void;
  clearUnread: () => void;
};

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  setUnreadCount: (n) => set({ unreadCount: n }),
  incrementUnread: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  clearUnread: () => set({ unreadCount: 0 }),
}));

// ── Product Preferences ────────────────────────────────────

export type FeedDensity = "cozy" | "compact";
export type PostVisibility = "public" | "followers";
export type NotificationView =
  | "important"
  | "conversations"
  | "activity"
  | "all";

type FeedPreferencesState = {
  density: FeedDensity;
  preferredPostVisibility: PostVisibility;
  setDensity: (density: FeedDensity) => void;
  setPreferredPostVisibility: (visibility: PostVisibility) => void;
};

export const useFeedPreferencesStore = create<FeedPreferencesState>((set) => ({
  density: readStorage<FeedDensity>("pals-feed-density", "cozy"),
  preferredPostVisibility: readStorage<PostVisibility>(
    "pals-post-visibility",
    "public"
  ),
  setDensity: (density) => {
    writeStorage("pals-feed-density", density);
    set({ density });
  },
  setPreferredPostVisibility: (preferredPostVisibility) => {
    writeStorage("pals-post-visibility", preferredPostVisibility);
    set({ preferredPostVisibility });
  },
}));

type NotificationPreferencesState = {
  view: NotificationView;
  setView: (view: NotificationView) => void;
};

export const useNotificationPreferencesStore =
  create<NotificationPreferencesState>((set) => ({
    view: readStorage<NotificationView>("pals-notification-view", "important"),
    setView: (view) => {
      writeStorage("pals-notification-view", view);
      set({ view });
    },
  }));
