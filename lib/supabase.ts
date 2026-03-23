import { createClient } from "@supabase/supabase-js";

// ── Types ──────────────────────────────────────────────────

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  location: string | null;
  website: string | null;
  date_of_birth: string | null;
  followers_count: number;
  following_count: number;
  posts_count: number;
  is_online: boolean;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
};

export type Post = {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  image_urls: string[];
  likes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
};

export type Like = {
  id: string;
  user_id: string;
  post_id: string;
  created_at: string;
};

export type Comment = {
  id: string;
  user_id: string;
  post_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
};

export type Follow = {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
};

export type ProfileSummary = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online?: boolean;
};

export type Conversation = {
  id: string;
  created_at: string;
  updated_at: string;
  last_message: string | null;
  last_message_at: string | null;
  is_group: boolean;
  name: string | null;
  avatar_url: string | null;
  created_by: string | null;
};

export type ConversationParticipant = {
  id: string;
  conversation_id: string;
  user_id: string;
  unread_count: number;
  last_read_at: string | null;
  created_at: string;
  profiles?: ProfileSummary;
};

export type MessageReaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type MessageStatus = "sending" | "sent" | "failed";

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  image_url: string | null;
  audio_url: string | null;
  message_type: "text" | "system" | "voice";
  is_read: boolean;
  is_edited: boolean;
  created_at: string;
  profiles?: Profile;
  reactions?: MessageReaction[];
  /** Client-side delivery status (not stored in DB) */
  _status?: MessageStatus;
};

export type Notification = {
  id: string;
  user_id: string;
  actor_id: string;
  type: "follow" | "like" | "comment" | "mention";
  post_id: string | null;
  comment_id: string | null;
  is_read: boolean;
  created_at: string;
  profiles?: Profile;
};

export type Story = {
  id: string;
  user_id: string;
  image_url: string | null;
  text_content: string | null;
  bg_color: string;
  created_at: string;
  expires_at: string;
  profiles?: Profile;
};

export type StoryView = {
  id: string;
  story_id: string;
  viewer_id: string;
  viewed_at: string;
};

export type CallSignal = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  type: "offer" | "answer" | "ice-candidate" | "hang-up";
  call_type: "voice" | "video";
  signal: string;
  created_at: string;
};

type TableDef<R, I, U> = {
  Row: R;
  Insert: I;
  Update: U;
  Relationships: never[];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<
        Profile,
        { id: string; username: string; display_name?: string | null; bio?: string | null; avatar_url?: string | null; cover_url?: string | null; location?: string | null; website?: string | null; date_of_birth?: string | null; followers_count?: number; following_count?: number; posts_count?: number; is_online?: boolean; last_seen?: string | null },
        Partial<Omit<Profile, "id" | "created_at">>
      >;
      posts: TableDef<
        Post,
        { user_id: string; content?: string | null; image_url?: string | null; image_urls?: string[]; likes_count?: number; comments_count?: number },
        Partial<{ user_id: string; content: string | null; image_url: string | null; updated_at: string }>
      >;
      likes: TableDef<
        Like,
        { user_id: string; post_id: string },
        Partial<Like>
      >;
      comments: TableDef<
        Comment,
        { user_id: string; post_id: string; content: string },
        Partial<{ content: string; updated_at: string }>
      >;
      follows: TableDef<
        Follow,
        { follower_id: string; following_id: string },
        Partial<Follow>
      >;
      conversations: TableDef<
        Conversation,
        { last_message?: string | null; last_message_at?: string | null; is_group?: boolean; name?: string | null; avatar_url?: string | null; created_by?: string | null },
        Partial<{ last_message: string | null; last_message_at: string | null; updated_at: string; name: string | null; avatar_url: string | null }>
      >;
      conversation_participants: TableDef<
        ConversationParticipant,
        { conversation_id: string; user_id: string; unread_count?: number; last_read_at?: string | null },
        Partial<{ unread_count: number; last_read_at: string | null }>
      >;
      messages: TableDef<
        Message,
        { conversation_id: string; sender_id: string; content?: string | null; image_url?: string | null; message_type?: "text" | "system" | "voice"; audio_url?: string | null },
        Partial<{ content: string | null; image_url: string | null; is_read: boolean; audio_url: string | null }>
      >;
      notifications: TableDef<
        Notification,
        { user_id: string; actor_id: string; type: "follow" | "like" | "comment" | "mention"; post_id?: string | null; comment_id?: string | null },
        Partial<{ is_read: boolean }>
      >;
      message_reactions: TableDef<
        MessageReaction,
        { message_id: string; user_id: string; emoji: string },
        Partial<MessageReaction>
      >;
      call_signals: TableDef<
        CallSignal,
        { conversation_id: string; caller_id: string; callee_id: string; type: "offer" | "answer" | "ice-candidate" | "hang-up"; call_type: "voice" | "video"; signal: string },
        Partial<CallSignal>
      >;
      stories: TableDef<
        Story,
        { user_id: string; image_url?: string | null; text_content?: string | null; bg_color?: string },
        never
      >;
      story_views: TableDef<
        StoryView,
        { story_id: string; viewer_id: string },
        never
      >;
      blocked_users: TableDef<
        { id: string; blocker_id: string; blocked_id: string; created_at: string },
        { blocker_id: string; blocked_id: string },
        never
      >;
      push_subscriptions: TableDef<
        { id: string; user_id: string; endpoint: string; keys_p256dh: string; keys_auth: string; platform: string; created_at: string },
        { user_id: string; endpoint: string; keys_p256dh: string; keys_auth: string; platform?: string },
        never
      >;
    };
    Views: Record<string, never>;
    Functions: {
      increment_unread_counts: {
        Args: { p_conversation_id: string; p_sender_id: string };
        Returns: void;
      };
      mark_messages_read: {
        Args: { p_conversation_id: string };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// ── Environment ────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// ── Browser client singleton ──────────────────────────────────
// Uses createClient (not createBrowserClient from @supabase/ssr) to avoid
// NavigatorLockAcquireTimeoutError caused by concurrent auth requests.
// The instance is stored on globalThis so Next.js Fast Refresh doesn't
// recreate it and cause duplicate lock contenders.

declare global {
  // eslint-disable-next-line no-var
  var __supabaseBrowserClient: ReturnType<typeof createClient<Database>> | undefined;
}

export function getSupabaseBrowserClient() {
  if (!globalThis.__supabaseBrowserClient) {
    globalThis.__supabaseBrowserClient = createClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "pals-auth-token",
          flowType: "pkce",
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
        global: {
          fetch: (...args) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const [input, init] = args;
            return fetch(input, {
              ...(init as RequestInit),
              signal: controller.signal,
            })
              .catch((err) => {
                if (err.name === "AbortError") {
                  console.warn("Supabase fetch timeout (15s):", typeof input === "string" ? input.split("?")[0] : "");
                  throw new Error("Request timeout");
                }
                console.warn("Supabase fetch error:", err.message);
                throw err;
              })
              .finally(() => clearTimeout(timeout));
          },
        },
      }
    );
  }
  return globalThis.__supabaseBrowserClient;
}

// Single shared alias — always use this in client components
export const supabase = getSupabaseBrowserClient();

// Server client is in lib/supabase-server.ts to avoid importing next/headers at module level
