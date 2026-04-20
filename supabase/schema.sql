-- ============================================================
-- Pals — Full Database Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── profiles ─────────────────────────────────────────────────
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  username          text unique not null,
  display_name      text,
  bio               text,
  avatar_url        text,
  cover_url         text,
  location          text,
  website           text,
  date_of_birth     date,
  followers_count   integer not null default 0,
  following_count   integer not null default 0,
  posts_count       integer not null default 0,
  is_online         boolean not null default false,
  last_seen         timestamptz,
  public_key        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_profiles_is_online
  on public.profiles(is_online) where is_online = true;

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can delete own profile"
  on public.profiles for delete using (auth.uid() = id);

-- ── posts ─────────────────────────────────────────────────────
create table if not exists public.posts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  content         text,
  image_url       text,
  likes_count     integer not null default 0,
  comments_count  integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_posts_user_id       on public.posts(user_id);
create index idx_posts_created_at    on public.posts(created_at desc);

alter table public.posts enable row level security;

create policy "Posts are viewable by everyone"
  on public.posts for select using (true);

create policy "Authenticated users can create posts"
  on public.posts for insert with check (auth.uid() = user_id);

create policy "Users can update own posts"
  on public.posts for update using (auth.uid() = user_id);

create policy "Users can delete own posts"
  on public.posts for delete using (auth.uid() = user_id);

-- ── likes ─────────────────────────────────────────────────────
create table if not exists public.likes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  post_id     uuid not null references public.posts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, post_id)
);

create index idx_likes_post_id on public.likes(post_id);
create index idx_likes_user_id on public.likes(user_id);

alter table public.likes enable row level security;

create policy "Likes are viewable by everyone"
  on public.likes for select using (true);

create policy "Authenticated users can like"
  on public.likes for insert with check (auth.uid() = user_id);

create policy "Users can unlike"
  on public.likes for delete using (auth.uid() = user_id);

-- Trigger: update posts.likes_count on like insert/delete
create or replace function update_post_likes_count()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set likes_count = likes_count + 1 where id = new.post_id;
    -- Notify post author
    insert into public.notifications(user_id, actor_id, type, post_id)
    select p.user_id, new.user_id, 'like', new.post_id
    from public.posts p where p.id = new.post_id and p.user_id <> new.user_id;
  elsif tg_op = 'DELETE' then
    update public.posts set likes_count = greatest(0, likes_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger trg_post_likes_count
after insert or delete on public.likes
for each row execute function update_post_likes_count();

-- ── comments ──────────────────────────────────────────────────
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  post_id     uuid not null references public.posts(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_comments_post_id on public.comments(post_id);

alter table public.comments enable row level security;

create policy "Comments are viewable by everyone"
  on public.comments for select using (true);

create policy "Authenticated users can comment"
  on public.comments for insert with check (auth.uid() = user_id);

create policy "Users can update own comments"
  on public.comments for update using (auth.uid() = user_id);

create policy "Users can delete own comments"
  on public.comments for delete using (auth.uid() = user_id);

-- Trigger: update posts.comments_count
create or replace function update_post_comments_count()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comments_count = comments_count + 1 where id = new.post_id;
    insert into public.notifications(user_id, actor_id, type, post_id, comment_id)
    select p.user_id, new.user_id, 'comment', new.post_id, new.id
    from public.posts p where p.id = new.post_id and p.user_id <> new.user_id;
  elsif tg_op = 'DELETE' then
    update public.posts set comments_count = greatest(0, comments_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger trg_post_comments_count
after insert or delete on public.comments
for each row execute function update_post_comments_count();

-- ── follows ───────────────────────────────────────────────────
create table if not exists public.follows (
  id            uuid primary key default gen_random_uuid(),
  follower_id   uuid not null references public.profiles(id) on delete cascade,
  following_id  uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (follower_id, following_id)
);

create index idx_follows_follower  on public.follows(follower_id);
create index idx_follows_following on public.follows(following_id);

alter table public.follows enable row level security;

create policy "Follows are viewable by everyone"
  on public.follows for select using (true);

create policy "Authenticated users can follow"
  on public.follows for insert with check (auth.uid() = follower_id);

create policy "Users can unfollow"
  on public.follows for delete using (auth.uid() = follower_id);

-- Trigger: update followers_count / following_count
create or replace function update_follow_counts()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
    insert into public.notifications(user_id, actor_id, type)
    values (new.following_id, new.follower_id, 'follow');
  elsif tg_op = 'DELETE' then
    update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    update public.profiles set followers_count = greatest(0, followers_count - 1) where id = old.following_id;
  end if;
  return null;
end;
$$;

create trigger trg_follow_counts
after insert or delete on public.follows
for each row execute function update_follow_counts();

-- Trigger: update posts_count
create or replace function update_posts_count()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set posts_count = posts_count + 1 where id = new.user_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set posts_count = greatest(0, posts_count - 1) where id = old.user_id;
  end if;
  return null;
end;
$$;

create trigger trg_posts_count
after insert or delete on public.posts
for each row execute function update_posts_count();

-- ── conversations ─────────────────────────────────────────────
create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  last_message     text,
  last_message_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  is_group         boolean not null default false,
  name             text,
  avatar_url       text,
  created_by       uuid references public.profiles(id) on delete set null,
  disappear_after  integer default null
);

alter table public.conversations enable row level security;

create policy "Authenticated users can create conversations"
  on public.conversations for insert with check (auth.uid() is not null);

-- ── conversation_participants ─────────────────────────────────
create table if not exists public.conversation_participants (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  unread_count     integer not null default 0,
  last_read_at     timestamptz,
  created_at       timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create index idx_conv_participants_conv   on public.conversation_participants(conversation_id);
create index idx_conv_participants_user   on public.conversation_participants(user_id);

alter table public.conversation_participants enable row level security;

create policy "Users can view own participations"
  on public.conversation_participants for select
  using (user_id = auth.uid());

create policy "Users can view co-participants"
  on public.conversation_participants for select
  using (conversation_id in (select get_my_conversation_ids()));

create policy "Authenticated users can join conversations"
  on public.conversation_participants for insert with check (auth.uid() is not null);

create policy "Users can update own participation"
  on public.conversation_participants for update using (user_id = auth.uid());

-- ── Helper: get current user's conversation IDs (security definer) ──
create or replace function public.get_my_conversation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select conversation_id
  from public.conversation_participants
  where user_id = auth.uid();
$$;

-- RLS policies for conversations (use get_my_conversation_ids for performance)
create policy "Participants can view conversations"
  on public.conversations for select
  using (id in (select get_my_conversation_ids()));

create policy "Participants can update conversations"
  on public.conversations for update
  using (id in (select get_my_conversation_ids()));

-- ── messages ──────────────────────────────────────────────────
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null references public.profiles(id) on delete cascade,
  content          text,
  image_url        text,
  audio_url        text,
  message_type     text not null default 'text',
  is_read          boolean not null default false,
  is_edited        boolean not null default false,
  created_at       timestamptz not null default now(),
  reply_to_id      uuid references public.messages(id) on delete set null,
  reply_preview    jsonb default null,
  expires_at       timestamptz default null
);

create index idx_messages_conversation on public.messages(conversation_id, created_at);
create index idx_messages_sender      on public.messages(sender_id);

alter table public.messages replica identity full;

alter table public.messages enable row level security;

create policy "Participants can view messages"
  on public.messages for select
  using (conversation_id in (select get_my_conversation_ids()));

create policy "Participants can send messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and conversation_id in (select get_my_conversation_ids())
  );

create policy "Users can update own messages"
  on public.messages for update
  using (sender_id = auth.uid());

create policy "Users can delete own messages"
  on public.messages for delete
  using (sender_id = auth.uid());

-- ── message_reactions ─────────────────────────────────────────
create table if not exists public.message_reactions (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  unique(message_id, user_id, emoji)
);

create index idx_message_reactions_message on public.message_reactions(message_id);
create index idx_message_reactions_user    on public.message_reactions(user_id);

alter table public.message_reactions enable row level security;

create policy "Users can view reactions"
  on public.message_reactions for select
  using (
    message_id in (
      select m.id from public.messages m
      where m.conversation_id in (select get_my_conversation_ids())
    )
  );

create policy "Users can add reactions"
  on public.message_reactions for insert
  with check (auth.uid() = user_id);

create policy "Users can remove reactions"
  on public.message_reactions for delete
  using (auth.uid() = user_id);

-- Helper function: mark messages as read (security definer bypasses sender-only RLS)
create or replace function mark_messages_read(
  p_conversation_id uuid
) returns void language plpgsql security definer as $$
begin
  if exists (
    select 1 from public.conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid()
  ) then
    update public.messages
    set is_read = true
    where conversation_id = p_conversation_id
      and sender_id <> auth.uid()
      and is_read = false;
  end if;
end;
$$;

-- Helper function: increment unread counts for all participants except sender
create or replace function increment_unread_counts(
  p_conversation_id uuid,
  p_sender_id uuid
) returns void language plpgsql security definer as $$
begin
  update public.conversation_participants
  set unread_count = unread_count + 1
  where conversation_id = p_conversation_id
    and user_id <> p_sender_id;
end;
$$;

-- ── notifications ─────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  actor_id    uuid not null references public.profiles(id) on delete cascade,
  type        text not null check (type in ('follow', 'like', 'comment', 'mention')),
  post_id     uuid references public.posts(id) on delete cascade,
  comment_id  uuid references public.comments(id) on delete cascade,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index idx_notifications_user on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Users can view own notifications"
  on public.notifications for select using (user_id = auth.uid());

create policy "System can insert notifications"
  on public.notifications for insert with check (true);

create policy "Users can update own notifications"
  on public.notifications for update using (user_id = auth.uid());

-- ── call_signals ──────────────────────────────────────────────
create table if not exists public.call_signals (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  caller_id        uuid not null references public.profiles(id) on delete cascade,
  callee_id        uuid not null references public.profiles(id) on delete cascade,
  type             text not null check (type in ('offer', 'answer', 'ice-candidate', 'hang-up')),
  call_type        text not null check (call_type in ('voice', 'video')) default 'voice',
  signal           text not null,
  created_at       timestamptz not null default now()
);

create index idx_call_signals_callee on public.call_signals(callee_id, created_at desc);
create index idx_call_signals_conv   on public.call_signals(conversation_id, created_at desc);

alter table public.call_signals enable row level security;

create policy "Participants can view call signals"
  on public.call_signals for select
  using (caller_id = auth.uid() or callee_id = auth.uid());

create policy "Authenticated users can send call signals"
  on public.call_signals for insert with check (auth.uid() = caller_id);

-- Auto-cleanup: delete stale call signals (older than 5 min) on each insert
create or replace function public.cleanup_old_call_signals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.call_signals
  where created_at < now() - interval '5 minutes';
  return new;
end;
$$;

create trigger trg_cleanup_call_signals
before insert on public.call_signals
for each row execute function cleanup_old_call_signals();

-- ── Realtime: enable tables ───────────────────────────────────
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
-- call_signals removed from realtime (using Broadcast instead)
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.follows;
alter publication supabase_realtime add table public.likes;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.conversation_participants;

-- ── Storage buckets ───────────────────────────────────────────
-- Create a "media" bucket in Supabase Storage with public access
-- and the following RLS:
-- INSERT: authenticated users only
-- SELECT: public
-- UPDATE/DELETE: own files only (using storage.foldername(name)[1] = auth.uid()::text)

-- ── Auto-create profile on auth.users insert (handles OAuth) ─
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _username text;
begin
  _username := coalesce(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'user_name',
    split_part(new.email, '@', 1)
  );
  -- Sanitize and truncate
  _username := lower(regexp_replace(_username, '[^a-z0-9_]', '', 'g'));
  _username := left(_username, 30);
  if _username = '' then
    _username := 'user_' || left(new.id::text, 8);
  end if;
  -- Ensure uniqueness
  while exists (select 1 from public.profiles where username = _username) loop
    _username := _username || '_' || floor(random() * 1000)::text;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url, date_of_birth)
  values (
    new.id,
    _username,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    (new.raw_user_meta_data->>'date_of_birth')::date
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace trigger trg_create_profile_on_signup
after insert on auth.users
for each row execute function handle_new_user();

-- ── Auto-update updated_at ────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function set_updated_at();

create trigger trg_posts_updated_at
before update on public.posts
for each row execute function set_updated_at();

create trigger trg_comments_updated_at
before update on public.comments
for each row execute function set_updated_at();

create trigger trg_conversations_updated_at
before update on public.conversations
for each row execute function set_updated_at();

-- ── blocked_users ────────────────────────────────────────────
create table if not exists public.blocked_users (
  id          uuid primary key default gen_random_uuid(),
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (blocker_id, blocked_id)
);

create index if not exists idx_blocked_blocker on public.blocked_users(blocker_id);
create index if not exists idx_blocked_blocked on public.blocked_users(blocked_id);

alter table public.blocked_users enable row level security;

create policy "Users can view own blocks"
  on public.blocked_users for select using (blocker_id = auth.uid());

create policy "Users can block"
  on public.blocked_users for insert with check (auth.uid() = blocker_id);

create policy "Users can unblock"
  on public.blocked_users for delete using (auth.uid() = blocker_id);

-- ── stories ─────────────────────────────────────────────────
create table if not exists public.stories (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  image_url     text,
  text_content  text,
  bg_color      text default '#1a1a2e',
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '24 hours')
);

create index if not exists idx_stories_user on public.stories(user_id);
create index if not exists idx_stories_expires on public.stories(expires_at);

alter table public.stories enable row level security;

create policy "Active stories are viewable by everyone"
  on public.stories for select using (expires_at > now());

create policy "Users can create stories"
  on public.stories for insert with check (auth.uid() = user_id);

create policy "Users can delete own stories"
  on public.stories for delete using (auth.uid() = user_id);

-- ── story_views ─────────────────────────────────────────────
create table if not exists public.story_views (
  id         uuid primary key default gen_random_uuid(),
  story_id   uuid not null references public.stories(id) on delete cascade,
  viewer_id  uuid not null references public.profiles(id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  unique (story_id, viewer_id)
);

alter table public.story_views enable row level security;

create policy "Story authors can view their story views"
  on public.story_views for select
  using (story_id in (select id from public.stories where user_id = auth.uid()));

create policy "Users can mark stories as viewed"
  on public.story_views for insert with check (auth.uid() = viewer_id);

-- ── push_subscriptions ──────────────────────────────────────
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null,
  keys_p256dh text not null,
  keys_auth  text not null,
  platform   text not null default 'web',
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index idx_push_subs_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

create policy "Users can view own subscriptions"
  on public.push_subscriptions for select using (user_id = auth.uid());
create policy "Users can create subscriptions"
  on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "Users can delete subscriptions"
  on public.push_subscriptions for delete using (auth.uid() = user_id);
