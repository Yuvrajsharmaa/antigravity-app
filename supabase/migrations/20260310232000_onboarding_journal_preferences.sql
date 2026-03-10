-- Care Space migration: richer onboarding preferences + journal sharing controls.

BEGIN;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS therapist_gender_preference TEXT DEFAULT 'no_preference',
  ADD COLUMN IF NOT EXISTS time_preference TEXT DEFAULT 'evening',
  ADD COLUMN IF NOT EXISTS care_style_preference TEXT,
  ADD COLUMN IF NOT EXISTS journal_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS journal_sharing TEXT DEFAULT 'summary';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_preferences_therapist_gender_preference_check'
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_therapist_gender_preference_check
      CHECK (therapist_gender_preference IN ('no_preference', 'female', 'male', 'non_binary'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_preferences_time_preference_check'
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_time_preference_check
      CHECK (time_preference IN ('morning', 'afternoon', 'evening', 'flexible'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_preferences_journal_sharing_check'
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_journal_sharing_check
      CHECK (journal_sharing IN ('none', 'summary', 'entry_by_entry', 'all'));
  END IF;
END $$;

COMMIT;
