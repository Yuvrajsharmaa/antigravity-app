-- ============================================
-- Antigravity — Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'therapist', 'admin')),
  first_name TEXT,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT,
  language TEXT DEFAULT 'English',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. user_preferences
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  intent_tags TEXT[] DEFAULT '{}',
  session_preference TEXT DEFAULT 'both' CHECK (session_preference IN ('chat', 'video', 'both')),
  wellbeing_reminders_enabled BOOLEAN DEFAULT TRUE,
  wellbeing_reminder_time TIME DEFAULT '19:00:00',
  quiet_hours_start TIME DEFAULT '21:00:00',
  quiet_hours_end TIME DEFAULT '08:00:00',
  therapist_gender_preference TEXT DEFAULT 'no_preference' CHECK (therapist_gender_preference IN ('no_preference', 'female', 'male', 'non_binary')),
  time_preference TEXT DEFAULT 'evening' CHECK (time_preference IN ('morning', 'afternoon', 'evening', 'flexible')),
  care_style_preference TEXT,
  journal_enabled BOOLEAN DEFAULT FALSE,
  journal_sharing TEXT DEFAULT 'summary' CHECK (journal_sharing IN ('none', 'summary', 'entry_by_entry', 'all')),
  engagement_mode TEXT DEFAULT 'balanced' CHECK (engagement_mode IN ('gentle', 'balanced', 'high')),
  nudge_snooze_until TIMESTAMPTZ,
  care_buddy_enabled BOOLEAN DEFAULT TRUE,
  walkthrough_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. therapists
CREATE TABLE IF NOT EXISTS public.therapists (
  id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  headline TEXT NOT NULL,
  bio TEXT NOT NULL,
  years_experience INT DEFAULT 0,
  languages TEXT[] DEFAULT '{English}',
  specialties TEXT[] DEFAULT '{}',
  session_fee_inr INT NOT NULL DEFAULT 0,
  chat_fee_inr INT,
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  featured_rank INT DEFAULT 99,
  rating NUMERIC(2,1),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. availability_slots
CREATE TABLE IF NOT EXISTS public.availability_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  therapist_id UUID REFERENCES public.therapists(id) ON DELETE CASCADE NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  slot_type TEXT DEFAULT 'video' CHECK (slot_type IN ('video', 'chat')),
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. bookings
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  therapist_id UUID REFERENCES public.therapists(id) NOT NULL,
  slot_id UUID REFERENCES public.availability_slots(id),
  session_type TEXT DEFAULT 'video' CHECK (session_type IN ('video', 'chat')),
  status TEXT DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'confirmed', 'cancelled', 'completed', 'failed')),
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  amount_inr INT NOT NULL DEFAULT 0,
  payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. sessions
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) NOT NULL,
  conversation_id UUID,
  video_provider TEXT DEFAULT 'daily',
  video_call_id TEXT,
  video_room_token_hint TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  joined_user_at TIMESTAMPTZ,
  joined_therapist_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. conversations
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  therapist_id UUID REFERENCES public.therapists(id) NOT NULL,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, therapist_id)
);

-- 8. messages
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.profiles(id) NOT NULL,
  body TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  is_blocked BOOLEAN DEFAULT FALSE,
  blocked_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);

-- 9. crisis_flags
CREATE TABLE IF NOT EXISTS public.crisis_flags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id),
  keyword_hit TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. client_metrics
CREATE TABLE IF NOT EXISTS public.client_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  check_in_date DATE NOT NULL DEFAULT (timezone('utc', now()))::date,
  mood TEXT NOT NULL,
  stress_level INT NOT NULL,
  sleep_hours NUMERIC NOT NULL,
  energy_level INT,
  connectedness_level INT,
  coping_helpfulness INT,
  journal_entry TEXT,
  care_score_snapshot INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_metrics_user_checkin_date
  ON public.client_metrics (user_id, check_in_date);

-- 11. care_nudge_events
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

-- 12. therapist_applications
CREATE TABLE IF NOT EXISTS public.therapist_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  years_experience INT,
  specialties TEXT[] DEFAULT '{}',
  languages TEXT[] DEFAULT '{English}',
  communication_style TEXT,
  headline TEXT,
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 13. journal_entries
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('daily_reflection', 'post_session_reflection')),
  title TEXT,
  body TEXT NOT NULL,
  mood TEXT,
  stress_level INT,
  sleep_hours NUMERIC,
  care_score_snapshot INT,
  metric_id UUID REFERENCES public.client_metrics(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 14. client_match_profile
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

-- 15. therapist_match_profile
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
  standout_quote TEXT,
  standout_prompt TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 16. match_events
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

-- 17. therapist_match_requests
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

-- 18. client_therapist_links
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

-- ============================================
-- Enable Row Level Security
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crisis_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_nudge_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_match_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_match_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_match_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_therapist_links ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies
-- ============================================

-- Profiles: users can read all, update own
CREATE POLICY "profiles_read_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- User preferences: own only
CREATE POLICY "prefs_select_own" ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "prefs_insert_own" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "prefs_update_own" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);

-- Therapists: read all (verified)
CREATE POLICY "therapists_read_all" ON public.therapists FOR SELECT USING (true);

-- Availability: read all
CREATE POLICY "slots_read_all" ON public.availability_slots FOR SELECT USING (true);
CREATE POLICY "slots_update" ON public.availability_slots FOR UPDATE USING (true);

-- Bookings: user can manage own
CREATE POLICY "bookings_select_own" ON public.bookings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "bookings_insert_own" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bookings_update_own" ON public.bookings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "bookings_select_therapist" ON public.bookings FOR SELECT USING (auth.uid() = therapist_id);
CREATE POLICY "bookings_update_therapist" ON public.bookings FOR UPDATE USING (auth.uid() = therapist_id);

-- Sessions: via booking
CREATE POLICY "sessions_select" ON public.sessions FOR SELECT USING (true);
CREATE POLICY "sessions_insert" ON public.sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "sessions_update" ON public.sessions FOR UPDATE USING (true);

-- Conversations: participating
CREATE POLICY "conv_select_own" ON public.conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "conv_insert_own" ON public.conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "conv_update_own" ON public.conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "conv_select_therapist" ON public.conversations FOR SELECT USING (auth.uid() = therapist_id);
CREATE POLICY "conv_update_therapist" ON public.conversations FOR UPDATE USING (auth.uid() = therapist_id);
CREATE POLICY "conv_insert_therapist" ON public.conversations FOR INSERT WITH CHECK (
  auth.uid() = therapist_id
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = user_id
      AND p.role IN ('user', 'admin')
  )
);

-- Messages: participating
CREATE POLICY "msg_select_conv" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.user_id = auth.uid() OR c.therapist_id = auth.uid()))
);
CREATE POLICY "msg_insert" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Crisis flags: insert own
CREATE POLICY "crisis_insert_own" ON public.crisis_flags FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Client metrics: insert/read own, therapist read
CREATE POLICY "metrics_insert_own" ON public.client_metrics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "metrics_select_own" ON public.client_metrics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "metrics_update_own" ON public.client_metrics FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "metrics_select_therapist" ON public.client_metrics FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.user_id = client_metrics.user_id AND c.therapist_id = auth.uid())
);

-- Care nudge events: own + therapist visibility
CREATE POLICY "nudge_events_select_own" ON public.care_nudge_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "nudge_events_insert_own" ON public.care_nudge_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nudge_events_select_therapist" ON public.care_nudge_events FOR SELECT USING (auth.uid() = therapist_id);
CREATE POLICY "nudge_events_insert_therapist" ON public.care_nudge_events FOR INSERT WITH CHECK (auth.uid() = therapist_id);

-- Therapist applications
CREATE POLICY "therapist_applications_select_own" ON public.therapist_applications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "therapist_applications_insert_own" ON public.therapist_applications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "therapist_applications_update_own" ON public.therapist_applications FOR UPDATE
USING (auth.uid() = user_id AND status IN ('pending', 'rejected'))
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "therapist_applications_admin_select" ON public.therapist_applications FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);
CREATE POLICY "therapist_applications_admin_update" ON public.therapist_applications FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);

-- Journal entries
CREATE POLICY "journal_entries_select_own" ON public.journal_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "journal_entries_insert_own" ON public.journal_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "journal_entries_update_own" ON public.journal_entries FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "journal_entries_delete_own" ON public.journal_entries FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "journal_entries_select_therapist" ON public.journal_entries FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.user_id = journal_entries.user_id
      AND c.therapist_id = auth.uid()
  )
);

-- Client match profile
CREATE POLICY "client_match_profile_select_own" ON public.client_match_profile FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "client_match_profile_insert_own" ON public.client_match_profile FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "client_match_profile_update_own" ON public.client_match_profile FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Therapist match profile
CREATE POLICY "therapist_match_profile_select_all" ON public.therapist_match_profile FOR SELECT USING (true);
CREATE POLICY "therapist_match_profile_insert_own" ON public.therapist_match_profile FOR INSERT
WITH CHECK (
  auth.uid() = therapist_id
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);
CREATE POLICY "therapist_match_profile_update_own" ON public.therapist_match_profile FOR UPDATE
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

-- Match events
CREATE POLICY "match_events_select_own" ON public.match_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "match_events_insert_own" ON public.match_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "match_events_select_therapist" ON public.match_events FOR SELECT USING (auth.uid() = therapist_id);

-- Therapist match requests
CREATE POLICY "therapist_match_requests_select_client" ON public.therapist_match_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "therapist_match_requests_insert_client" ON public.therapist_match_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "therapist_match_requests_update_client" ON public.therapist_match_requests FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND status IN ('pending', 'withdrawn')
);
CREATE POLICY "therapist_match_requests_select_therapist" ON public.therapist_match_requests FOR SELECT USING (auth.uid() = therapist_id);
CREATE POLICY "therapist_match_requests_update_therapist" ON public.therapist_match_requests FOR UPDATE
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

-- Client therapist links
CREATE POLICY "client_therapist_links_select_own" ON public.client_therapist_links FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "client_therapist_links_insert_own" ON public.client_therapist_links FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "client_therapist_links_update_own" ON public.client_therapist_links FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "client_therapist_links_select_therapist" ON public.client_therapist_links FOR SELECT USING (auth.uid() = therapist_id);

-- Atomic booking confirmation RPC: lock slot + confirm booking + ensure session
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

-- Therapist response to match request: accept/decline and lock on acceptance
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

-- ============================================
-- Storage: Avatar Bucket + Policies
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'avatar_objects_insert_own'
  ) THEN
    CREATE POLICY "avatar_objects_insert_own" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'avatars'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'avatar_objects_update_own'
  ) THEN
    CREATE POLICY "avatar_objects_update_own" ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'avatars'
        AND auth.uid()::text = (storage.foldername(name))[1]
      )
      WITH CHECK (
        bucket_id = 'avatars'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'avatar_objects_delete_own'
  ) THEN
    CREATE POLICY "avatar_objects_delete_own" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'avatars'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'avatar_objects_select_public'
  ) THEN
    CREATE POLICY "avatar_objects_select_public" ON storage.objects
      FOR SELECT TO public
      USING (bucket_id = 'avatars');
  END IF;
END $$;

-- ============================================
-- Enable Realtime on messages
-- ============================================
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.care_nudge_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.therapist_applications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_match_profile;
ALTER PUBLICATION supabase_realtime ADD TABLE public.therapist_match_profile;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.therapist_match_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_therapist_links;

-- ============================================
-- Seed Data: Demo Therapists
-- ============================================

-- First create auth users for therapists (you'll need to create these via Supabase Auth)
-- For demo purposes, insert profiles directly:

-- NOTE: Run these AFTER creating corresponding auth users, OR
-- temporarily disable the foreign key to profiles:
-- ALTER TABLE public.therapists DROP CONSTRAINT therapists_id_fkey;

-- Demo therapist profiles (use fixed UUIDs for reproducibility)
INSERT INTO public.profiles (id, role, first_name, display_name, email, language, onboarding_completed, avatar_url) VALUES
  ('11111111-1111-1111-1111-111111111111', 'therapist', 'Ananya', 'Dr. Ananya Sharma', 'ananya@demo.test', 'English', true, 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200&h=200&fit=crop&crop=face'),
  ('22222222-2222-2222-2222-222222222222', 'therapist', 'Rohan', 'Rohan Mehta', 'rohan@demo.test', 'English', true, 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=200&h=200&fit=crop&crop=face'),
  ('33333333-3333-3333-3333-333333333333', 'therapist', 'Priya', 'Dr. Priya Desai', 'priya@demo.test', 'English', true, 'https://images.unsplash.com/photo-1614608682850-e0d6ed316d47?w=200&h=200&fit=crop&crop=face'),
  ('44444444-4444-4444-4444-444444444444', 'therapist', 'Kabir', 'Kabir Singh', 'kabir@demo.test', 'English', true, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face'),
  ('55555555-5555-5555-5555-555555555555', 'therapist', 'Meera', 'Dr. Meera Patel', 'meera@demo.test', 'English', true, 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&h=200&fit=crop&crop=face'),
  ('66666666-6666-6666-6666-666666666666', 'therapist', 'Arjun', 'Arjun Kapoor', 'arjun@demo.test', 'English', true, 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.therapists (id, headline, bio, years_experience, languages, specialties, session_fee_inr, chat_fee_inr, is_verified, is_active, featured_rank, rating) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Clinical Psychologist · CBT Specialist',
   'With 8 years of clinical experience, I help people navigate anxiety, stress, and life transitions using Cognitive Behavioural Therapy. My approach is warm, structured, and evidence-based.',
   8, '{English,Hindi}', '{anxiety,stress,cbt,self-esteem,work-stress}', 800, 400, true, true, 1, 4.9),

  ('22222222-2222-2222-2222-222222222222', 'Counselling Psychologist · Relationships',
   'I specialise in relationship dynamics, family concerns, and interpersonal challenges. I believe in creating a safe, non-judgmental space where you can explore your feelings freely.',
   5, '{English,Hindi}', '{relationships,family,loneliness,communication}', 600, 300, true, true, 2, 4.7),

  ('33333333-3333-3333-3333-333333333333', 'Child & Adolescent Psychologist',
   'I work with young adults and teenagers dealing with academic pressure, identity questions, and emotional challenges. My sessions are interactive and engaging.',
   6, '{English,Marathi}', '{anxiety,self-esteem,academic-stress,adolescent}', 700, 350, true, true, 3, 4.8),

  ('44444444-4444-4444-4444-444444444444', 'Mindfulness-Based Therapist',
   'I integrate mindfulness practices with talk therapy to help you develop awareness, calm, and resilience. Specialising in stress management and burnout.',
   4, '{English}', '{stress,mindfulness,burnout,work-stress,anxiety}', 500, 250, true, true, 4, 4.6),

  ('55555555-5555-5555-5555-555555555555', 'Trauma-Informed Therapist',
   'I provide compassionate, trauma-informed care for individuals dealing with grief, loss, and difficult life experiences. Your healing journey matters.',
   10, '{English,Hindi,Gujarati}', '{grief,trauma,ptsd,self-esteem,relationships}', 900, 450, true, true, 5, 4.9),

  ('66666666-6666-6666-6666-666666666666', 'Career & Life Coach',
   'Feeling stuck in your career? I help professionals find clarity, purpose, and direction through structured coaching and supportive counselling.',
   3, '{English,Hindi}', '{work-stress,career,motivation,self-esteem}', 500, 250, true, true, 6, 4.5)
ON CONFLICT (id) DO NOTHING;

-- Generate availability slots for next 7 days
DO $$
DECLARE
  therapist_uuid UUID;
  day_offset INT;
  slot_hour INT;
  slot_start TIMESTAMPTZ;
  slot_end TIMESTAMPTZ;
BEGIN
  FOR therapist_uuid IN SELECT id FROM public.therapists LOOP
    FOR day_offset IN 0..6 LOOP
      FOR slot_hour IN 9..18 LOOP
        -- Skip some slots randomly for realism
        IF random() > 0.3 THEN
          slot_start := (CURRENT_DATE + day_offset * INTERVAL '1 day' + slot_hour * INTERVAL '1 hour')::TIMESTAMPTZ;
          slot_end := slot_start + INTERVAL '45 minutes';
          INSERT INTO public.availability_slots (therapist_id, start_at, end_at, slot_type, is_available)
          VALUES (therapist_uuid, slot_start, slot_end, 'video', true)
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
