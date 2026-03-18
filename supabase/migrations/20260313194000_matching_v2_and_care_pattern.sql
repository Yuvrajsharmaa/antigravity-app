-- Care Space UX Tightening v3
-- Matching v2 tables + care pattern daily-checkin extensions

ALTER TABLE IF EXISTS public.client_metrics
  ADD COLUMN IF NOT EXISTS check_in_date DATE;

ALTER TABLE IF EXISTS public.client_metrics
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE IF EXISTS public.client_metrics
  ADD COLUMN IF NOT EXISTS energy_level INT;

ALTER TABLE IF EXISTS public.client_metrics
  ADD COLUMN IF NOT EXISTS connectedness_level INT;

ALTER TABLE IF EXISTS public.client_metrics
  ADD COLUMN IF NOT EXISTS coping_helpfulness INT;

UPDATE public.client_metrics
SET check_in_date = COALESCE(check_in_date, (timezone('utc', created_at))::date)
WHERE check_in_date IS NULL;

ALTER TABLE IF EXISTS public.client_metrics
  ALTER COLUMN check_in_date SET DEFAULT (timezone('utc', now()))::date;

ALTER TABLE IF EXISTS public.client_metrics
  ALTER COLUMN check_in_date SET NOT NULL;

-- Keep only the latest check-in row for each user/day before enforcing uniqueness.
WITH ranked_metrics AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, check_in_date
      ORDER BY created_at DESC, id DESC
    ) AS row_num
  FROM public.client_metrics
)
DELETE FROM public.client_metrics cm
USING ranked_metrics rm
WHERE cm.id = rm.id
  AND rm.row_num > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_metrics_user_checkin_date
  ON public.client_metrics(user_id, check_in_date);

CREATE TABLE IF NOT EXISTS public.client_match_profile (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  concern_tags TEXT[] NOT NULL DEFAULT '{}',
  goal_tags TEXT[] NOT NULL DEFAULT '{}',
  style_preference TEXT,
  session_preference TEXT NOT NULL DEFAULT 'both',
  language_preference TEXT,
  availability_windows JSONB NOT NULL DEFAULT '[]'::jsonb,
  gender_preference TEXT DEFAULT 'no_preference',
  identity_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  modality_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  urgency_level INT DEFAULT 2,
  first_session_sla_hours INT DEFAULT 72,
  budget_min_inr INT,
  budget_max_inr INT,
  risk_flag BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.therapist_match_profile (
  therapist_id UUID PRIMARY KEY REFERENCES public.therapists(id) ON DELETE CASCADE,
  treats_tags TEXT[] NOT NULL DEFAULT '{}',
  not_fit_tags TEXT[] NOT NULL DEFAULT '{}',
  modalities TEXT[] NOT NULL DEFAULT '{}',
  style_tags TEXT[] NOT NULL DEFAULT '{}',
  population_tags TEXT[] NOT NULL DEFAULT '{}',
  session_modes TEXT[] NOT NULL DEFAULT '{video}',
  languages TEXT[] NOT NULL DEFAULT '{English}',
  intake_windows JSONB NOT NULL DEFAULT '[]'::jsonb,
  new_client_capacity INT DEFAULT 5,
  identity_tags JSONB NOT NULL DEFAULT '{}'::jsonb,
  accepts_new_clients BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  therapist_id UUID NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  match_score NUMERIC NOT NULL,
  rank_position INT NOT NULL,
  score_breakdown JSONB NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'v2',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tmp_treats_tags_gin ON public.therapist_match_profile USING gin (treats_tags);
CREATE INDEX IF NOT EXISTS idx_tmp_not_fit_tags_gin ON public.therapist_match_profile USING gin (not_fit_tags);
CREATE INDEX IF NOT EXISTS idx_tmp_languages_gin ON public.therapist_match_profile USING gin (languages);
CREATE INDEX IF NOT EXISTS idx_tmp_session_modes_gin ON public.therapist_match_profile USING gin (session_modes);

ALTER TABLE public.client_match_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_match_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_metrics'
      AND policyname = 'metrics_update_own'
  ) THEN
    CREATE POLICY "metrics_update_own" ON public.client_metrics
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_match_profile'
      AND policyname = 'client_match_profile_select_own'
  ) THEN
    CREATE POLICY "client_match_profile_select_own" ON public.client_match_profile
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_match_profile'
      AND policyname = 'client_match_profile_insert_own'
  ) THEN
    CREATE POLICY "client_match_profile_insert_own" ON public.client_match_profile
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_match_profile'
      AND policyname = 'client_match_profile_update_own'
  ) THEN
    CREATE POLICY "client_match_profile_update_own" ON public.client_match_profile
      FOR UPDATE USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'therapist_match_profile'
      AND policyname = 'therapist_match_profile_select_all'
  ) THEN
    CREATE POLICY "therapist_match_profile_select_all" ON public.therapist_match_profile
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'therapist_match_profile'
      AND policyname = 'therapist_match_profile_insert_own'
  ) THEN
    CREATE POLICY "therapist_match_profile_insert_own" ON public.therapist_match_profile
      FOR INSERT
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'therapist_match_profile'
      AND policyname = 'therapist_match_profile_update_own'
  ) THEN
    CREATE POLICY "therapist_match_profile_update_own" ON public.therapist_match_profile
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'match_events'
      AND policyname = 'match_events_select_own'
  ) THEN
    CREATE POLICY "match_events_select_own" ON public.match_events
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'match_events'
      AND policyname = 'match_events_insert_own'
  ) THEN
    CREATE POLICY "match_events_insert_own" ON public.match_events
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'match_events'
      AND policyname = 'match_events_select_therapist'
  ) THEN
    CREATE POLICY "match_events_select_therapist" ON public.match_events
      FOR SELECT USING (auth.uid() = therapist_id);
  END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_match_profile;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.therapist_match_profile;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END
$$;
