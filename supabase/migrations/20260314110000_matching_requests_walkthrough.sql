-- Care Space: therapist mutual-match requests + walkthrough completion flag

BEGIN;

ALTER TABLE IF EXISTS public.user_preferences
  ADD COLUMN IF NOT EXISTS walkthrough_completed BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS public.therapist_match_profile
  ADD COLUMN IF NOT EXISTS standout_quote TEXT,
  ADD COLUMN IF NOT EXISTS standout_prompt TEXT;

CREATE TABLE IF NOT EXISTS public.therapist_match_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  intro_question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  therapist_response_note TEXT,
  therapist_responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_therapist_match_requests_user
  ON public.therapist_match_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_therapist_match_requests_therapist
  ON public.therapist_match_requests (therapist_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_therapist_match_requests_pending_pair
  ON public.therapist_match_requests (user_id, therapist_id)
  WHERE status = 'pending';

ALTER TABLE public.therapist_match_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'therapist_match_requests'
      AND policyname = 'therapist_match_requests_select_client'
  ) THEN
    CREATE POLICY "therapist_match_requests_select_client" ON public.therapist_match_requests
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'therapist_match_requests'
      AND policyname = 'therapist_match_requests_insert_client'
  ) THEN
    CREATE POLICY "therapist_match_requests_insert_client" ON public.therapist_match_requests
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'therapist_match_requests'
      AND policyname = 'therapist_match_requests_update_client'
  ) THEN
    CREATE POLICY "therapist_match_requests_update_client" ON public.therapist_match_requests
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (
        auth.uid() = user_id
        AND status IN ('pending', 'withdrawn')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'therapist_match_requests'
      AND policyname = 'therapist_match_requests_select_therapist'
  ) THEN
    CREATE POLICY "therapist_match_requests_select_therapist" ON public.therapist_match_requests
      FOR SELECT USING (auth.uid() = therapist_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'therapist_match_requests'
      AND policyname = 'therapist_match_requests_update_therapist'
  ) THEN
    CREATE POLICY "therapist_match_requests_update_therapist" ON public.therapist_match_requests
      FOR UPDATE
      USING (
        auth.uid() = therapist_id
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
      )
      WITH CHECK (
        auth.uid() = therapist_id
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
      );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.respond_match_request(
  p_request_id UUID,
  p_status TEXT,
  p_switch_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_therapist_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  IF p_status NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  SELECT r.user_id, r.therapist_id
  INTO v_user_id, v_therapist_id
  FROM public.therapist_match_requests r
  WHERE r.id = p_request_id
    AND r.status = 'pending'
  FOR UPDATE;

  IF v_user_id IS NULL OR v_therapist_id IS NULL THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND_OR_CLOSED';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
  INTO v_is_admin;

  IF auth.uid() <> v_therapist_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  UPDATE public.therapist_match_requests
  SET status = p_status,
      therapist_responded_at = now(),
      updated_at = now()
  WHERE id = p_request_id;

  IF p_status = 'accepted' THEN
    UPDATE public.client_therapist_links
    SET state = 'switched',
        switch_reason = COALESCE(p_switch_reason, 'Switched after therapist acceptance'),
        ended_at = now(),
        updated_at = now()
    WHERE user_id = v_user_id
      AND state = 'locked'
      AND ended_at IS NULL;

    INSERT INTO public.client_therapist_links (
      user_id,
      therapist_id,
      state,
      started_at,
      updated_at
    ) VALUES (
      v_user_id,
      v_therapist_id,
      'locked',
      now(),
      now()
    );

    INSERT INTO public.conversations (
      user_id,
      therapist_id,
      last_message_at
    ) VALUES (
      v_user_id,
      v_therapist_id,
      now()
    )
    ON CONFLICT (user_id, therapist_id)
    DO UPDATE SET last_message_at = EXCLUDED.last_message_at;
  END IF;

  RETURN p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_match_request(UUID, TEXT, TEXT) TO authenticated;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.therapist_match_requests;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END
$$;

COMMIT;
