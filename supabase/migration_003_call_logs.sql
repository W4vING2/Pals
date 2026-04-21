CREATE TABLE IF NOT EXISTS public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  callee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_type text NOT NULL CHECK (call_type IN ('voice', 'video')),
  status text NOT NULL CHECK (status IN ('completed', 'missed', 'declined', 'failed')),
  duration_seconds integer DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS call_logs_caller_id_idx ON public.call_logs(caller_id, started_at DESC);
CREATE INDEX IF NOT EXISTS call_logs_callee_id_idx ON public.call_logs(callee_id, started_at DESC);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own call logs" ON public.call_logs;
CREATE POLICY "Users see own call logs" ON public.call_logs
  FOR SELECT USING (caller_id = auth.uid() OR callee_id = auth.uid());

DROP POLICY IF EXISTS "Caller can insert" ON public.call_logs;
CREATE POLICY "Caller can insert" ON public.call_logs
  FOR INSERT WITH CHECK (caller_id = auth.uid());

DROP POLICY IF EXISTS "Caller can update" ON public.call_logs;
CREATE POLICY "Caller can update" ON public.call_logs
  FOR UPDATE USING (caller_id = auth.uid());
