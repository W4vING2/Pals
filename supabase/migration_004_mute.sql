ALTER TABLE public.conversation_participants
ADD COLUMN IF NOT EXISTS is_muted boolean NOT NULL DEFAULT false;
