-- Care Buddy preference controls for personality-driven UX

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS engagement_mode TEXT;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS nudge_snooze_until TIMESTAMPTZ;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS care_buddy_enabled BOOLEAN DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_preferences_engagement_mode_check'
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_engagement_mode_check
      CHECK (engagement_mode IN ('gentle', 'balanced', 'high'));
  END IF;
END $$;

UPDATE public.user_preferences
SET engagement_mode = COALESCE(engagement_mode, 'balanced'),
    care_buddy_enabled = COALESCE(care_buddy_enabled, TRUE)
WHERE engagement_mode IS NULL OR care_buddy_enabled IS NULL;

