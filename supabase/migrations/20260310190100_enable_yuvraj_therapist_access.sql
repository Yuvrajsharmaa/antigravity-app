-- Promote existing account to therapist and seed availability slots.
-- Target email: yuvrajsharma6367@gmail.com

DO $$
DECLARE
  therapist_uuid UUID;
  day_offset INT;
  slot_hour INT;
  slot_start TIMESTAMPTZ;
  slot_end TIMESTAMPTZ;
BEGIN
  SELECT id
  INTO therapist_uuid
  FROM public.profiles
  WHERE lower(email) = 'yuvrajsharma6367@gmail.com'
  LIMIT 1;

  IF therapist_uuid IS NULL THEN
    RAISE EXCEPTION 'No profile found for yuvrajsharma6367@gmail.com. Sign in once first to create profile row.';
  END IF;

  UPDATE public.profiles
  SET role = 'therapist',
      first_name = COALESCE(first_name, 'Yuvraj'),
      display_name = COALESCE(display_name, 'Dr. Yuvraj Sharma'),
      onboarding_completed = true,
      updated_at = now()
  WHERE id = therapist_uuid;

  INSERT INTO public.therapists (
    id,
    headline,
    bio,
    years_experience,
    languages,
    specialties,
    session_fee_inr,
    chat_fee_inr,
    is_verified,
    is_active,
    featured_rank,
    rating,
    updated_at
  ) VALUES (
    therapist_uuid,
    'Clinical Psychologist · Care Space Test Profile',
    'Test therapist account configured for end-to-end platform validation and demos.',
    5,
    '{English,Hindi}',
    '{anxiety,stress,relationships,work-stress}',
    700,
    350,
    true,
    true,
    99,
    4.8,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET headline = EXCLUDED.headline,
      bio = EXCLUDED.bio,
      years_experience = EXCLUDED.years_experience,
      languages = EXCLUDED.languages,
      specialties = EXCLUDED.specialties,
      session_fee_inr = EXCLUDED.session_fee_inr,
      chat_fee_inr = EXCLUDED.chat_fee_inr,
      is_verified = EXCLUDED.is_verified,
      is_active = EXCLUDED.is_active,
      updated_at = now();

  FOR day_offset IN 0..6 LOOP
    FOREACH slot_hour IN ARRAY ARRAY[10, 12, 16, 18] LOOP
      slot_start := (CURRENT_DATE + day_offset * INTERVAL '1 day' + slot_hour * INTERVAL '1 hour')::TIMESTAMPTZ;
      slot_end := slot_start + INTERVAL '45 minutes';

      IF NOT EXISTS (
        SELECT 1
        FROM public.availability_slots
        WHERE therapist_id = therapist_uuid
          AND start_at = slot_start
      ) THEN
        INSERT INTO public.availability_slots (therapist_id, start_at, end_at, slot_type, is_available)
        VALUES (therapist_uuid, slot_start, slot_end, 'video', true);
      END IF;
    END LOOP;
  END LOOP;
END $$;
