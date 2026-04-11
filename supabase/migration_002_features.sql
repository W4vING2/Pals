-- ── Migration 002: Forward messages, Pin messages, Mentions ──────────────────
-- Run this in Supabase SQL Editor

-- 1. Forward message origin (which message was this forwarded from)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forward_from_id uuid REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forward_from_sender text; -- snapshot of sender name at time of forwarding

-- 2. Pin a message in a conversation
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pinned_message_id uuid REFERENCES messages(id) ON DELETE SET NULL;

-- 3. Mentions table (for @username in posts AND messages)
CREATE TABLE IF NOT EXISTS mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_post_or_message CHECK (
    (post_id IS NOT NULL AND message_id IS NULL) OR
    (post_id IS NULL AND message_id IS NOT NULL)
  )
);

-- Enable RLS on mentions
ALTER TABLE mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read mentions" ON mentions;
CREATE POLICY "Users can read mentions" ON mentions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can create mentions" ON mentions;
CREATE POLICY "Authenticated users can create mentions" ON mentions
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Index for fast lookup of mentions for a user
CREATE INDEX IF NOT EXISTS mentions_mentioned_user_id_idx ON mentions (mentioned_user_id);
CREATE INDEX IF NOT EXISTS mentions_post_id_idx ON mentions (post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mentions_message_id_idx ON mentions (message_id) WHERE message_id IS NOT NULL;

-- 4. Grant access
GRANT SELECT, INSERT ON mentions TO authenticated;
GRANT SELECT, INSERT ON mentions TO anon;
