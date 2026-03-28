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

// ── Messages Store ────────────────────────────────────────

type MessagesStoreState = {
  pendingConversationId: string | null;
  setPendingConversationId: (id: string | null) => void;
};

export const useMessagesStore = create<MessagesStoreState>((set) => ({
  pendingConversationId: null,
  setPendingConversationId: (id) => set({ pendingConversationId: id }),
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
