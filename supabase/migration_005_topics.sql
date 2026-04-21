-- Topics table
CREATE TABLE IF NOT EXISTS public.topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  participant_count integer NOT NULL DEFAULT 0,
  message_count integer NOT NULL DEFAULT 0,
  tags text[] DEFAULT '{}'
);

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active topics" ON public.topics;
CREATE POLICY "Anyone can read active topics" ON public.topics
  FOR SELECT USING (expires_at > now());

DROP POLICY IF EXISTS "Auth users can create topics" ON public.topics;
CREATE POLICY "Auth users can create topics" ON public.topics
  FOR INSERT WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Auth users can update active topics" ON public.topics;
CREATE POLICY "Auth users can update active topics" ON public.topics
  FOR UPDATE USING (auth.uid() IS NOT NULL AND expires_at > now())
  WITH CHECK (auth.uid() IS NOT NULL AND expires_at > now());

-- Topic messages table
CREATE TABLE IF NOT EXISTS public.topic_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.topic_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read topic messages" ON public.topic_messages;
CREATE POLICY "Anyone can read topic messages" ON public.topic_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.topics WHERE id = topic_id AND expires_at > now())
);

DROP POLICY IF EXISTS "Auth users can send messages" ON public.topic_messages;
CREATE POLICY "Auth users can send messages" ON public.topic_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.topics
      WHERE topics.id = topic_messages.topic_id
        AND topics.expires_at > now()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS topics_expires_at_idx ON public.topics(expires_at DESC);
CREATE INDEX IF NOT EXISTS topic_messages_topic_id_idx ON public.topic_messages(topic_id, created_at ASC);

ALTER TABLE public.topic_messages REPLICA IDENTITY FULL;

-- Function to increment counters
CREATE OR REPLACE FUNCTION increment_topic_message_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.topics SET message_count = message_count + 1 WHERE id = NEW.topic_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_topic_message_insert ON public.topic_messages;
CREATE TRIGGER on_topic_message_insert
  AFTER INSERT ON public.topic_messages
  FOR EACH ROW EXECUTE FUNCTION increment_topic_message_count();
