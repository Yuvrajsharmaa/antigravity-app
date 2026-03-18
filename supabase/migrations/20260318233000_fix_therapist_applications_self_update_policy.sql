-- Fix: prevent applicants from self-approving by updating status.

BEGIN;

DROP POLICY IF EXISTS "therapist_applications_update_own" ON public.therapist_applications;

CREATE POLICY "therapist_applications_update_own"
ON public.therapist_applications
FOR UPDATE
USING (
  auth.uid() = user_id
  AND status IN ('pending', 'rejected')
)
WITH CHECK (
  auth.uid() = user_id
  AND status IN ('pending', 'rejected')
);

COMMIT;

