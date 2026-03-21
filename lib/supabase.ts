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

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  image_url: string | null;
  is_read: boolean;
  created_at: string;
  profiles?: Profile;
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
        { user_id: string; content?: string | null; image_url?: string | null; likes_count?: number; comments_count?: number },
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
        { conversation_id: string; sender_id: string; content?: string | null; image_url?: string | null },
        Partial<{ content: string | null; image_url: string | null; is_read: boolean }>
      >;
      notifications: TableDef<
        Notification,
        { user_id: string; actor_id: string; type: "follow" | "like" | "comment" | "mention"; post_id?: string | null; comment_id?: string | null },
        Partial<{ is_read: boolean }>
      >;
      call_signals: TableDef<
        CallSignal,
        { conversation_id: string; caller_id: string; callee_id: string; type: "offer" | "answer" | "ice-candidate" | "hang-up"; call_type: "voice" | "video"; signal: string },
        Partial<CallSignal>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      increment_unread_counts: {
        Args: { p_conversation_id: string; p_sender_id: string };
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
        },
      }
    );
  }
  return globalThis.__supabaseBrowserClient;
}

// Single shared alias — always use this in client components
export const supabase = getSupabaseBrowserClient();

// Server client is in lib/supabase-server.ts to avoid importing next/headers at module level
