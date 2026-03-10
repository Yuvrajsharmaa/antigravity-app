-- Care Space migration: adaptive reminder preferences + therapist-visible care nudge events.
-- Run this in Supabase SQL Editor.

BEGIN;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS wellbeing_reminders_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS wellbeing_reminder_time TIME DEFAULT '19:00:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_start TIME DEFAULT '21:00:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end TIME DEFAULT '08:00:00';

CREATE TABLE IF NOT EXISTS public.care_nudge_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  therapist_id UUID REFERENCES public.therapists(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL DEFAULT 'care_score_high_risk',
  risk_level TEXT NOT NULL CHECK (risk_level IN ('high', 'medium', 'stable')),
  source TEXT NOT NULL DEFAULT 'system_auto' CHECK (source IN ('system_auto', 'therapist_manual')),
  message_preview TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.care_nudge_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'care_nudge_events'
      AND policyname = 'nudge_events_select_own'
  ) THEN
    CREATE POLICY "nudge_events_select_own" ON public.care_nudge_events
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'care_nudge_events'
      AND policyname = 'nudge_events_insert_own'
  ) THEN
    CREATE POLICY "nudge_events_insert_own" ON public.care_nudge_events
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'care_nudge_events'
      AND policyname = 'nudge_events_select_therapist'
  ) THEN
    CREATE POLICY "nudge_events_select_therapist" ON public.care_nudge_events
      FOR SELECT USING (auth.uid() = therapist_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'care_nudge_events'
      AND policyname = 'nudge_events_insert_therapist'
  ) THEN
    CREATE POLICY "nudge_events_insert_therapist" ON public.care_nudge_events
      FOR INSERT WITH CHECK (auth.uid() = therapist_id);
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
      AND tablename = 'care_nudge_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.care_nudge_events;
  END IF;
END $$;

COMMIT;
