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
  mood TEXT NOT NULL,
  stress_level INT NOT NULL,
  sleep_hours NUMERIC NOT NULL,
  journal_entry TEXT,
  freud_score_snapshot INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

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
CREATE POLICY "metrics_select_therapist" ON public.client_metrics FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.user_id = client_metrics.user_id AND c.therapist_id = auth.uid())
);

-- ============================================
-- Enable Realtime on messages
-- ============================================
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_metrics;

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
