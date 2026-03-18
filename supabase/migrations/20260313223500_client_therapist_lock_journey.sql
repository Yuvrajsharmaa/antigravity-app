-- Care Space UX cleanup: therapist lock journey

CREATE TABLE IF NOT EXISTS public.client_therapist_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('exploring', 'locked', 'switched')),
  switch_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_therapist_links_user
  ON public.client_therapist_links (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_therapist_links_therapist
  ON public.client_therapist_links (therapist_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_therapist_links_active_lock
  ON public.client_therapist_links (user_id)
  WHERE state = 'locked' AND ended_at IS NULL;

ALTER TABLE public.client_therapist_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_therapist_links'
      AND policyname = 'client_therapist_links_select_own'
  ) THEN
    CREATE POLICY "client_therapist_links_select_own" ON public.client_therapist_links
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_therapist_links'
      AND policyname = 'client_therapist_links_insert_own'
  ) THEN
    CREATE POLICY "client_therapist_links_insert_own" ON public.client_therapist_links
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_therapist_links'
      AND policyname = 'client_therapist_links_update_own'
  ) THEN
    CREATE POLICY "client_therapist_links_update_own" ON public.client_therapist_links
      FOR UPDATE USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_therapist_links'
      AND policyname = 'client_therapist_links_select_therapist'
  ) THEN
    CREATE POLICY "client_therapist_links_select_therapist" ON public.client_therapist_links
      FOR SELECT USING (auth.uid() = therapist_id);
  END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_therapist_links;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END
$$;
