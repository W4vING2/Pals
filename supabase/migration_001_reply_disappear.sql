-- Migration: reply to messages + disappearing messages
-- Run this in Supabase SQL Editor

-- ── Reply to messages ────────────────────────────────────────

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_preview JSONB DEFAULT NULL;
  -- reply_preview format:
  --   { "sender_name": "...", "content": "...", "message_type": "text", "image_url": null }

CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages(reply_to_id);

-- ── Disappearing messages ────────────────────────────────────

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS disappear_after INTEGER DEFAULT NULL;
  -- NULL = off, value = seconds (30, 300, 3600, 86400, 604800)

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;

-- Trigger: auto-set expires_at based on conversation.disappear_after
CREATE OR REPLACE FUNCTION set_message_expiry()
RETURNS TRIGGER AS $$
DECLARE
  v_disappear_after INTEGER;
BEGIN
  SELECT disappear_after INTO v_disappear_after
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  IF v_disappear_after IS NOT NULL THEN
    NEW.expires_at := NOW() + (v_disappear_after || ' seconds')::INTERVAL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS set_message_expiry_trigger ON public.messages;
CREATE TRIGGER set_message_expiry_trigger
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION set_message_expiry();

-- Cleanup function: delete expired messages (call via pg_cron or manually)
CREATE OR REPLACE FUNCTION delete_expired_messages()
RETURNS void AS $$
BEGIN
  DELETE FROM public.messages WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
