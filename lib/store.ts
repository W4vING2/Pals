import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "./supabase";

// ── Auth Store ─────────────────────────────────────────────

type AuthState = {
  user: User | null;
  profile: Profile | null;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  signOut: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  setUser: (user) => set({ user }),
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
  setIncomingCall: (call: CallInfo | null) => void;
  setActiveCall: (call: CallInfo | null) => void;
  endCall: () => void;
};

export const useCallStore = create<CallState>((set) => ({
  incomingCall: null,
  activeCall: null,
  setIncomingCall: (call) => set({ incomingCall: call }),
  setActiveCall: (call) => set({ activeCall: call }),
  endCall: () => set({ incomingCall: null, activeCall: null }),
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

// ── Messages Store ────────────────────────────────────────

type MessagesStoreState = {
  pendingConversationId: string | null;
  setPendingConversationId: (id: string | null) => void;
};

export const useMessagesStore = create<MessagesStoreState>((set) => ({
  pendingConversationId: null,
  setPendingConversationId: (id) => set({ pendingConversationId: id }),
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
