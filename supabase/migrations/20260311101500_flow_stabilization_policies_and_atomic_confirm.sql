-- Care Space flow stabilization: therapist conversation policies + atomic booking confirmation RPC

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND policyname = 'conv_select_therapist'
  ) THEN
    CREATE POLICY "conv_select_therapist" ON public.conversations
      FOR SELECT USING (auth.uid() = therapist_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND policyname = 'conv_update_therapist'
  ) THEN
    CREATE POLICY "conv_update_therapist" ON public.conversations
      FOR UPDATE USING (auth.uid() = therapist_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'conversations'
      AND policyname = 'conv_insert_therapist'
  ) THEN
    CREATE POLICY "conv_insert_therapist" ON public.conversations
      FOR INSERT WITH CHECK (
        auth.uid() = therapist_id
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = user_id
            AND p.role IN ('user', 'admin')
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_booking_atomic(
  p_booking_id UUID,
  p_slot_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id UUID;
  v_existing_session_id UUID;
BEGIN
  SELECT b.id
  INTO v_booking_id
  FROM public.bookings b
  WHERE b.id = p_booking_id
    AND b.slot_id = p_slot_id
    AND b.status = 'pending_payment'
    AND (
      b.therapist_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
      )
    )
  FOR UPDATE;

  IF v_booking_id IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_CONFIRMABLE';
  END IF;

  PERFORM 1
  FROM public.availability_slots s
  WHERE s.id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLOT_NOT_FOUND';
  END IF;

  UPDATE public.availability_slots
  SET is_available = false
  WHERE id = p_slot_id
    AND is_available = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLOT_UNAVAILABLE';
  END IF;

  UPDATE public.bookings
  SET status = 'confirmed',
      updated_at = now()
  WHERE id = p_booking_id;

  SELECT s.id
  INTO v_existing_session_id
  FROM public.sessions s
  WHERE s.booking_id = p_booking_id
  ORDER BY s.created_at ASC
  LIMIT 1;

  IF v_existing_session_id IS NULL THEN
    INSERT INTO public.sessions (
      booking_id,
      status,
      video_call_id
    ) VALUES (
      p_booking_id,
      'scheduled',
      'call_' || substring(replace(p_booking_id::text, '-', '') from 1 for 8)
    );
  END IF;

  RETURN p_booking_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_booking_atomic(UUID, UUID) TO authenticated;

COMMIT;
