-- Therapist applications and Journal v2

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

ALTER TABLE public.therapist_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "therapist_applications_select_own"
ON public.therapist_applications
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "therapist_applications_insert_own"
ON public.therapist_applications
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "therapist_applications_update_own"
ON public.therapist_applications
FOR UPDATE
USING (
  auth.uid() = user_id
  AND status IN ('pending', 'rejected')
)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "therapist_applications_admin_select"
ON public.therapist_applications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

CREATE POLICY "therapist_applications_admin_update"
ON public.therapist_applications
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

CREATE POLICY "journal_entries_select_own"
ON public.journal_entries
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "journal_entries_insert_own"
ON public.journal_entries
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "journal_entries_update_own"
ON public.journal_entries
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "journal_entries_delete_own"
ON public.journal_entries
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "journal_entries_select_therapist"
ON public.journal_entries
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.user_id = journal_entries.user_id
      AND c.therapist_id = auth.uid()
  )
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.therapist_applications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_entries;
