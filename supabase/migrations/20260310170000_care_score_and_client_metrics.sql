-- Care Space migration: ensure client_metrics exists and migrate Freud score to CareScore.
-- Run this in Supabase SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  mood TEXT NOT NULL,
  stress_level INT NOT NULL,
  sleep_hours NUMERIC NOT NULL,
  journal_entry TEXT,
  care_score_snapshot INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_metrics'
      AND column_name = 'freud_score_snapshot'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_metrics'
      AND column_name = 'care_score_snapshot'
  ) THEN
    ALTER TABLE public.client_metrics
      RENAME COLUMN freud_score_snapshot TO care_score_snapshot;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_metrics'
      AND column_name = 'freud_score_snapshot'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_metrics'
      AND column_name = 'care_score_snapshot'
  ) THEN
    UPDATE public.client_metrics
      SET care_score_snapshot = COALESCE(care_score_snapshot, freud_score_snapshot)
      WHERE care_score_snapshot IS NULL;

    ALTER TABLE public.client_metrics
      DROP COLUMN freud_score_snapshot;
  END IF;
END $$;

ALTER TABLE public.client_metrics
  ALTER COLUMN care_score_snapshot SET NOT NULL;

ALTER TABLE public.client_metrics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_metrics'
      AND policyname = 'metrics_insert_own'
  ) THEN
    CREATE POLICY "metrics_insert_own" ON public.client_metrics
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_metrics'
      AND policyname = 'metrics_select_own'
  ) THEN
    CREATE POLICY "metrics_select_own" ON public.client_metrics
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_metrics'
      AND policyname = 'metrics_select_therapist'
  ) THEN
    CREATE POLICY "metrics_select_therapist" ON public.client_metrics
      FOR SELECT USING (
        EXISTS (
          SELECT 1
          FROM public.conversations c
          WHERE c.user_id = client_metrics.user_id
            AND c.therapist_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'client_metrics'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_metrics;
  END IF;
END $$;

COMMIT;
