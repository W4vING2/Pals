-- Add E2E public key column used by lib/crypto + useMessages
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS public_key text;
