import { supabase } from '../../services/supabase';
import { localDateKey } from '../utils/date';
import { normalizeMoodLabel } from '../utils/mood';
import { calculateCareScore } from '../utils/careScore';
import {
  ActiveTherapistLock,
  JournalEntry,
  JournalEntryType,
  NudgeCooldownState,
  TherapistApplication,
  TherapistApprovalAction,
  TherapistLockAction,
  TherapistMatchRequest,
  TherapistMatchRequestStatus,
} from '../models/types';

interface EnsureConversationInput {
  userId: string;
  therapistId: string;
}

interface EnsureSessionInput {
  bookingId: string;
  videoCallId?: string | null;
}

interface ConfirmBookingInput {
  bookingId: string;
  slotId: string;
}

interface NudgeEventInput {
  userId: string;
  therapistId: string | null;
  triggerType: string;
  riskLevel: 'high' | 'medium' | 'stable';
  source: 'system_auto' | 'therapist_manual';
  messagePreview?: string | null;
}

interface UpsertDailyCheckInInput {
  userId: string;
  mood: string;
  stressLevel: number;
  sleepHours: number;
  energyLevel?: number | null;
  connectednessLevel?: number | null;
  copingHelpfulness?: number | null;
  note?: string | null;
  checkInDate?: string;
}

export const ensureConversation = async ({
  userId,
  therapistId,
}: EnsureConversationInput): Promise<string> => {
  const { data: existing, error: readError } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('therapist_id', therapistId)
    .maybeSingle();

  if (readError) throw readError;
  if (existing?.id) return existing.id;

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      therapist_id: therapistId,
      last_message_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (createError) throw createError;
  return created.id;
};

export const ensureSessionForBooking = async ({
  bookingId,
  videoCallId,
}: EnsureSessionInput): Promise<string> => {
  const { data: existingRows, error: readError } = await supabase
    .from('sessions')
    .select('id')
    .eq('booking_id', bookingId)
    .limit(1);

  if (readError) throw readError;
  if (existingRows?.[0]?.id) return existingRows[0].id;

  const { data: created, error: createError } = await supabase
    .from('sessions')
    .insert({
      booking_id: bookingId,
      status: 'scheduled',
      video_call_id: videoCallId || `call_${bookingId.slice(0, 8)}`,
    })
    .select('id')
    .single();

  if (createError) throw createError;
  return created.id;
};

export const confirmBookingAndEnsureSession = async ({
  bookingId,
  slotId,
}: ConfirmBookingInput) => {
  const { error } = await supabase.rpc('confirm_booking_atomic', {
    p_booking_id: bookingId,
    p_slot_id: slotId,
  });

  if (error) {
    const code = String(error.code || '').toUpperCase();
    const message = `${error.message || ''}`.toUpperCase();
    if (code === 'PGRST202') {
      throw new Error('Backend function missing. Run migration 20260311101500_flow_stabilization_policies_and_atomic_confirm.sql');
    }
    if (code === 'P0001' && message.includes('SLOT_UNAVAILABLE')) {
      throw new Error('This slot is no longer available.');
    }
    if (code === 'P0001' && message.includes('BOOKING_NOT_CONFIRMABLE')) {
      throw new Error('Booking could not be confirmed.');
    }
    throw error;
  }
};

export const createCareNudgeEvent = async ({
  userId,
  therapistId,
  triggerType,
  riskLevel,
  source,
  messagePreview,
}: NudgeEventInput) => {
  const { error } = await supabase.from('care_nudge_events').insert({
    user_id: userId,
    therapist_id: therapistId,
    trigger_type: triggerType,
    risk_level: riskLevel,
    source,
    message_preview: messagePreview || null,
  });

  if (error) throw error;
};

export const getNudgeCooldownState = async ({
  userId,
  source,
  therapistId,
  cooldownHours = 24,
}: {
  userId: string;
  source: 'system_auto' | 'therapist_manual';
  therapistId?: string | null;
  cooldownHours?: number;
}): Promise<NudgeCooldownState> => {
  const sinceIso = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('care_nudge_events')
    .select('created_at')
    .eq('user_id', userId)
    .eq('source', source)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1);

  if (source === 'therapist_manual' && therapistId) {
    query = query.eq('therapist_id', therapistId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;

  return {
    userId,
    source,
    cooldownHours,
    lastTriggeredAt: data?.created_at || null,
    isBlocked: Boolean(data?.created_at),
  };
};

export const completeSessionAndBooking = async ({
  sessionId,
  bookingId,
}: {
  sessionId?: string | null;
  bookingId?: string | null;
}) => {
  if (sessionId) {
    const { error: sessionError } = await supabase
      .from('sessions')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    if (sessionError) throw sessionError;
  }

  if (bookingId) {
    const { error: bookingError } = await supabase
      .from('bookings')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);
    if (bookingError) throw bookingError;
  }
};

export const upsertTherapistApplication = async ({
  userId,
  yearsExperience,
  specialties,
  languages,
  communicationStyle,
  headline,
}: {
  userId: string;
  yearsExperience?: number | null;
  specialties?: string[] | null;
  languages?: string[] | null;
  communicationStyle?: string | null;
  headline?: string | null;
}) => {
  const { error } = await supabase
    .from('therapist_applications')
    .upsert(
      {
        user_id: userId,
        status: 'pending',
        years_experience: yearsExperience ?? null,
        specialties: specialties ?? [],
        languages: languages ?? ['English'],
        communication_style: communicationStyle ?? null,
        headline: headline ?? null,
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) throw error;
};

export const fetchTherapistApplicationByUser = async (
  userId: string,
): Promise<TherapistApplication | null> => {
  const { data, error } = await supabase
    .from('therapist_applications')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as TherapistApplication | null;
};

export const fetchTherapistApplications = async ({
  status,
}: {
  status?: 'pending' | 'approved' | 'rejected';
} = {}): Promise<TherapistApplication[]> => {
  let query = supabase
    .from('therapist_applications')
    .select('*')
    .order('created_at', { ascending: true });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as TherapistApplication[];
};

export const reviewTherapistApplication = async ({
  applicationId,
  reviewerId,
  status,
  rejectionReason,
}: TherapistApprovalAction) => {
  const now = new Date().toISOString();
  const { data: application, error: readError } = await supabase
    .from('therapist_applications')
    .select('id,user_id,headline,communication_style,specialties,languages')
    .eq('id', applicationId)
    .maybeSingle();

  if (readError) throw readError;
  if (!application?.user_id) throw new Error('Therapist application not found.');

  const { error: appError } = await supabase
    .from('therapist_applications')
    .update({
      status,
      rejection_reason: status === 'rejected' ? rejectionReason || 'Needs more application details.' : null,
      reviewed_by: reviewerId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('id', applicationId);

  if (appError) throw appError;

  if (status === 'approved') {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        role: 'therapist',
        onboarding_completed: true,
        updated_at: now,
      })
      .eq('id', application.user_id);
    if (profileError) throw profileError;

    const { error: therapistError } = await supabase
      .from('therapists')
      .upsert({
        id: application.user_id,
        headline: application.headline || 'Psychologist',
        bio: application.communication_style
          ? `${application.communication_style}. Focused on collaborative and evidence-based care.`
          : 'Collaborative and evidence-based care.',
        specialties: application.specialties || [],
        languages: application.languages || ['English'],
        is_verified: true,
        is_active: true,
        updated_at: now,
      }, { onConflict: 'id' });
    if (therapistError) throw therapistError;
  }
};

export const createJournalEntry = async ({
  userId,
  entryType,
  body,
  title,
  mood,
  stressLevel,
  sleepHours,
  careScoreSnapshot,
  metricId,
  sessionId,
}: {
  userId: string;
  entryType: JournalEntryType;
  body: string;
  title?: string | null;
  mood?: string | null;
  stressLevel?: number | null;
  sleepHours?: number | null;
  careScoreSnapshot?: number | null;
  metricId?: string | null;
  sessionId?: string | null;
}) => {
  const trimmedBody = body.trim();
  if (!trimmedBody) {
    throw new Error('Journal entry cannot be empty.');
  }

  const { error } = await supabase.from('journal_entries').insert({
    user_id: userId,
    entry_type: entryType,
    title: title || null,
    body: trimmedBody,
    mood: mood || null,
    stress_level: stressLevel ?? null,
    sleep_hours: sleepHours ?? null,
    care_score_snapshot: careScoreSnapshot ?? null,
    metric_id: metricId ?? null,
    session_id: sessionId ?? null,
  });

  if (error) throw error;
};

export const upsertDailyCheckIn = async ({
  userId,
  mood,
  stressLevel,
  sleepHours,
  energyLevel = null,
  connectednessLevel = null,
  copingHelpfulness = null,
  note = null,
  checkInDate,
}: UpsertDailyCheckInInput): Promise<{ metricId: string; score: number; isEditingToday: boolean }> => {
  const normalizedMood = normalizeMoodLabel(mood);
  if (!normalizedMood) {
    throw new Error('Mood is required for check-in.');
  }
  if (!Number.isFinite(sleepHours) || sleepHours <= 0 || sleepHours > 24) {
    throw new Error('Sleep hours must be between 0 and 24.');
  }

  const today = checkInDate || localDateKey();
  const score = calculateCareScore({
    mood: normalizedMood,
    stressLevel,
    sleepHours,
    energyLevel: energyLevel ?? undefined,
    connectednessLevel: connectednessLevel ?? undefined,
    copingHelpfulness: copingHelpfulness ?? undefined,
  });
  const dayStart = `${today}T00:00:00.000Z`;
  const dayEndDate = new Date(`${today}T00:00:00.000Z`);
  dayEndDate.setUTCDate(dayEndDate.getUTCDate() + 1);
  const dayEnd = dayEndDate.toISOString();

  const isMissingColumnError = (error: any, columnName: string) => {
    const code = `${error?.code || ''}`.toUpperCase();
    const message = `${error?.message || ''}`.toLowerCase();
    return code === '42703' || message.includes(columnName.toLowerCase());
  };

  let existingMetric: { id: string } | null = null;
  let metricRow: { id: string } | null = null;

  const modernLookup = await supabase
    .from('client_metrics')
    .select('id')
    .eq('user_id', userId)
    .eq('check_in_date', today)
    .maybeSingle();

  if (modernLookup.error && !isMissingColumnError(modernLookup.error, 'check_in_date')) {
    throw modernLookup.error;
  }

  const useLegacyPath = Boolean(modernLookup.error && isMissingColumnError(modernLookup.error, 'check_in_date'));

  if (!useLegacyPath) {
    existingMetric = modernLookup.data || null;

    const modernPayload = {
      user_id: userId,
      check_in_date: today,
      mood: normalizedMood,
      stress_level: stressLevel,
      sleep_hours: sleepHours,
      energy_level: energyLevel,
      connectedness_level: connectednessLevel,
      coping_helpfulness: copingHelpfulness,
      journal_entry: null,
      care_score_snapshot: score,
      updated_at: new Date().toISOString(),
    };

    const modernUpsert = await supabase
      .from('client_metrics')
      .upsert(modernPayload, { onConflict: 'user_id,check_in_date' })
      .select('id')
      .single();

    if (modernUpsert.error) {
      const code = `${modernUpsert.error?.code || ''}`.toUpperCase();
      const message = `${modernUpsert.error?.message || ''}`.toLowerCase();
      const missingNewColumns =
        isMissingColumnError(modernUpsert.error, 'energy_level')
        || isMissingColumnError(modernUpsert.error, 'connectedness_level')
        || isMissingColumnError(modernUpsert.error, 'coping_helpfulness')
        || isMissingColumnError(modernUpsert.error, 'updated_at');
      const missingCareScoreColumn = isMissingColumnError(modernUpsert.error, 'care_score_snapshot');
      const missingUpsertConstraint =
        code === '42P10'
        || message.includes('no unique or exclusion constraint')
        || message.includes('on conflict specification');

      if (!missingNewColumns && !missingCareScoreColumn && !missingUpsertConstraint) {
        throw modernUpsert.error;
      }

      const legacyCompatiblePayload: Record<string, any> = {
        user_id: userId,
        check_in_date: today,
        mood: normalizedMood,
        stress_level: stressLevel,
        sleep_hours: sleepHours,
        journal_entry: null,
        ...(missingCareScoreColumn ? { freud_score_snapshot: score } : { care_score_snapshot: score }),
      };
      if (!missingNewColumns) {
        legacyCompatiblePayload.energy_level = energyLevel;
        legacyCompatiblePayload.connectedness_level = connectednessLevel;
        legacyCompatiblePayload.coping_helpfulness = copingHelpfulness;
        legacyCompatiblePayload.updated_at = new Date().toISOString();
      }

      if (missingUpsertConstraint) {
        const manualWrite = existingMetric?.id
          ? await supabase
              .from('client_metrics')
              .update(legacyCompatiblePayload)
              .eq('id', existingMetric.id)
              .select('id')
              .single()
          : await supabase
              .from('client_metrics')
              .insert(legacyCompatiblePayload)
              .select('id')
              .single();

        if (manualWrite.error) throw manualWrite.error;
        metricRow = manualWrite.data as { id: string };
      } else {
        const fallbackUpsert = await supabase
          .from('client_metrics')
          .upsert(legacyCompatiblePayload, { onConflict: 'user_id,check_in_date' })
          .select('id')
          .single();

        if (fallbackUpsert.error) throw fallbackUpsert.error;
        metricRow = fallbackUpsert.data as { id: string };
      }
    } else {
      metricRow = modernUpsert.data as { id: string };
    }
  } else {
    const legacyLookup = await supabase
      .from('client_metrics')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', dayStart)
      .lt('created_at', dayEnd)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (legacyLookup.error) throw legacyLookup.error;
    existingMetric = legacyLookup.data || null;

    const baseLegacyPayload = {
      mood: normalizedMood,
      stress_level: stressLevel,
      sleep_hours: sleepHours,
      journal_entry: null,
      care_score_snapshot: score,
      updated_at: new Date().toISOString(),
    };

    if (existingMetric?.id) {
      const updateResult = await supabase
        .from('client_metrics')
        .update(baseLegacyPayload)
        .eq('id', existingMetric.id)
        .select('id')
        .single();

      if (updateResult.error) {
        const careScoreMissing = isMissingColumnError(updateResult.error, 'care_score_snapshot');
        if (!careScoreMissing) throw updateResult.error;

        const freudFallbackUpdate = await supabase
          .from('client_metrics')
          .update({
            mood: normalizedMood,
            stress_level: stressLevel,
            sleep_hours: sleepHours,
            journal_entry: null,
            freud_score_snapshot: score,
          } as any)
          .eq('id', existingMetric.id)
          .select('id')
          .single();

        if (freudFallbackUpdate.error) throw freudFallbackUpdate.error;
        metricRow = freudFallbackUpdate.data as { id: string };
      } else {
        metricRow = updateResult.data as { id: string };
      }
    } else {
      const insertResult = await supabase
        .from('client_metrics')
        .insert({
          user_id: userId,
          mood: normalizedMood,
          stress_level: stressLevel,
          sleep_hours: sleepHours,
          journal_entry: null,
          care_score_snapshot: score,
        })
        .select('id')
        .single();

      if (insertResult.error) {
        const careScoreMissing = isMissingColumnError(insertResult.error, 'care_score_snapshot');
        if (!careScoreMissing) throw insertResult.error;

        const freudFallbackInsert = await supabase
          .from('client_metrics')
          .insert({
            user_id: userId,
            mood: normalizedMood,
            stress_level: stressLevel,
            sleep_hours: sleepHours,
            journal_entry: null,
            freud_score_snapshot: score,
          } as any)
          .select('id')
          .single();

        if (freudFallbackInsert.error) throw freudFallbackInsert.error;
        metricRow = freudFallbackInsert.data as { id: string };
      } else {
        metricRow = insertResult.data as { id: string };
      }
    }
  }

  if (!metricRow?.id) {
    throw new Error('Unable to save today\'s check-in.');
  }

  const trimmedNote = note?.trim() || '';
  if (trimmedNote.length) {
    const { data: existingJournal } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('user_id', userId)
      .eq('entry_type', 'daily_reflection')
      .gte('created_at', dayStart)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingJournal?.id) {
      const { error: updateError } = await supabase
        .from('journal_entries')
        .update({
          body: trimmedNote,
          metric_id: metricRow.id,
          mood: normalizedMood,
          stress_level: stressLevel,
          sleep_hours: sleepHours,
          care_score_snapshot: score,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingJournal.id);
      if (updateError) throw updateError;
    } else {
      await createJournalEntry({
        userId,
        entryType: 'daily_reflection',
        title: 'Daily journal',
        body: trimmedNote,
        mood: normalizedMood,
        stressLevel,
        sleepHours,
        careScoreSnapshot: score,
        metricId: metricRow.id,
      });
    }
  }

  return {
    metricId: metricRow.id,
    score,
    isEditingToday: Boolean(existingMetric?.id),
  };
};

export const fetchJournalEntries = async (userId: string): Promise<JournalEntry[]> => {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as JournalEntry[];
};

export const fetchActiveTherapistLock = async (userId: string): Promise<ActiveTherapistLock | null> => {
  const { data, error } = await supabase
    .from('client_therapist_links')
    .select(`
      id, user_id, therapist_id, started_at,
      therapists:therapist_id (
        headline,
        profiles!inner (display_name, first_name, avatar_url)
      )
    `)
    .eq('user_id', userId)
    .eq('state', 'locked')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const therapist = Array.isArray((data as any).therapists)
    ? (data as any).therapists[0]
    : (data as any).therapists;
  const profile = Array.isArray(therapist?.profiles) ? therapist?.profiles[0] : therapist?.profiles;

  return {
    id: data.id,
    user_id: data.user_id,
    therapist_id: data.therapist_id,
    therapist_name: profile?.display_name || profile?.first_name || 'Therapist',
    therapist_avatar: profile?.avatar_url || null,
    therapist_headline: therapist?.headline || null,
    started_at: data.started_at,
  };
};

export const setTherapistLockAction = async ({
  userId,
  therapistId,
  action,
  switchReason,
}: {
  userId: string;
  therapistId: string;
  action: TherapistLockAction;
  switchReason?: string | null;
}) => {
  const now = new Date().toISOString();

  const { error: closeLockedError } = await supabase
    .from('client_therapist_links')
    .update({
      state: 'switched',
      switch_reason: switchReason || null,
      ended_at: now,
      updated_at: now,
    })
    .eq('user_id', userId)
    .eq('state', 'locked')
    .is('ended_at', null);

  if (closeLockedError) throw closeLockedError;

  const { error: closeExploringError } = await supabase
    .from('client_therapist_links')
    .update({
      ended_at: now,
      updated_at: now,
    })
    .eq('user_id', userId)
    .eq('state', 'exploring')
    .is('ended_at', null);

  if (closeExploringError) throw closeExploringError;

  const nextState = action === 'keep_exploring' ? 'exploring' : 'locked';
  const { error: insertError } = await supabase
    .from('client_therapist_links')
    .insert({
      user_id: userId,
      therapist_id: therapistId,
      state: nextState,
      switch_reason: action === 'switch' ? (switchReason || 'User switched therapist') : null,
      started_at: now,
      updated_at: now,
    });

  if (insertError) throw insertError;
};

export const createTherapistMatchRequest = async ({
  userId,
  therapistId,
  introQuestion,
}: {
  userId: string;
  therapistId: string;
  introQuestion: string;
}) => {
  const normalizeMatchRequestError = (err: any) => {
    const code = `${err?.code || ''}`.toUpperCase();
    const message = `${err?.message || ''}`.toLowerCase();

    if (code === '42P01' || message.includes('therapist_match_requests')) {
      return new Error(
        'Match requests backend is missing. Apply Supabase migration 20260314110000_matching_requests_walkthrough.sql and try again.',
      );
    }
    if (code === '42501' || message.includes('row-level security') || message.includes('permission denied')) {
      return new Error(
        'Permission denied sending intro. Ensure you are signed in as the client and the therapist_match_requests RLS policies are applied.',
      );
    }
    if (message.includes('jwt') || message.includes('refresh token') || message.includes('not authenticated')) {
      return new Error('Session expired. Please sign in again and retry.');
    }

    return err instanceof Error ? err : new Error('Unable to send intro right now. Please try again.');
  };

  const trimmedQuestion = introQuestion.trim();
  if (!trimmedQuestion.length) {
    throw new Error('Please add a short intro question.');
  }

  const now = new Date().toISOString();

  const { data: existingPending, error: existingError } = await supabase
    .from('therapist_match_requests')
    .select('id')
    .eq('user_id', userId)
    .eq('therapist_id', therapistId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingError) throw normalizeMatchRequestError(existingError);

  if (existingPending?.id) {
    const { error: updateError } = await supabase
      .from('therapist_match_requests')
      .update({
        intro_question: trimmedQuestion,
        updated_at: now,
      })
      .eq('id', existingPending.id);
    if (updateError) throw normalizeMatchRequestError(updateError);
    return existingPending.id;
  }

  const { data, error } = await supabase
    .from('therapist_match_requests')
    .insert({
      user_id: userId,
      therapist_id: therapistId,
      intro_question: trimmedQuestion,
      status: 'pending',
      updated_at: now,
    })
    .select('id')
    .single();

  if (error) {
    const code = `${error?.code || ''}`.toUpperCase();
    // Race / double-tap safety: if another pending row was created between the select and insert,
    // fall back to "update existing" instead of failing.
    if (code === '23505') {
      const { data: pendingAgain } = await supabase
        .from('therapist_match_requests')
        .select('id')
        .eq('user_id', userId)
        .eq('therapist_id', therapistId)
        .eq('status', 'pending')
        .maybeSingle();
      if (pendingAgain?.id) {
        const { error: updateError } = await supabase
          .from('therapist_match_requests')
          .update({ intro_question: trimmedQuestion, updated_at: now })
          .eq('id', pendingAgain.id);
        if (updateError) throw normalizeMatchRequestError(updateError);
        return pendingAgain.id;
      }
    }
    throw normalizeMatchRequestError(error);
  }
  return data.id as string;
};

export const fetchTherapistMatchRequestsForClient = async (
  userId: string,
): Promise<TherapistMatchRequest[]> => {
  const { data, error } = await supabase
    .from('therapist_match_requests')
    .select(`
      *,
      therapists:therapist_id (
        profiles!inner (display_name, first_name, avatar_url)
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data || []) as any[]).map((row) => {
    const therapist = Array.isArray(row.therapists) ? row.therapists[0] : row.therapists;
    const therapistProfile = Array.isArray(therapist?.profiles) ? therapist.profiles[0] : therapist?.profiles;
    return {
      ...row,
      therapist_name: therapistProfile?.display_name || therapistProfile?.first_name || null,
    } as TherapistMatchRequest;
  });
};

export const fetchTherapistMatchRequestsForTherapist = async ({
  therapistId,
  status = 'pending',
}: {
  therapistId: string;
  status?: TherapistMatchRequestStatus;
}): Promise<TherapistMatchRequest[]> => {
  const { data, error } = await supabase
    .from('therapist_match_requests')
    .select(`
      *,
      users:user_id (display_name, first_name, avatar_url)
    `)
    .eq('therapist_id', therapistId)
    .eq('status', status)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return ((data || []) as any[]).map((row) => {
    const userProfile = Array.isArray(row.users) ? row.users[0] : row.users;
    return {
      ...row,
      client_name: userProfile?.display_name || userProfile?.first_name || 'Client',
      client_avatar: userProfile?.avatar_url || null,
    } as TherapistMatchRequest;
  });
};

export const respondTherapistMatchRequest = async ({
  requestId,
  status,
  switchReason,
}: {
  requestId: string;
  status: 'accepted' | 'declined';
  switchReason?: string | null;
}) => {
  // Use direct update so acceptance does not auto-lock before intro call.
  const { data: requestRow, error: fetchError } = await supabase
    .from('therapist_match_requests')
    .select('id,user_id,therapist_id,status')
    .eq('id', requestId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!requestRow || requestRow.status !== 'pending') {
    throw new Error('Request is no longer pending.');
  }

  const { error: updateError } = await supabase
    .from('therapist_match_requests')
    .update({
      status,
      therapist_response_note: switchReason || null,
      therapist_responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateError) throw updateError;

  if (status === 'accepted') {
    const { error: conversationError } = await supabase
      .from('conversations')
      .upsert(
        {
          user_id: requestRow.user_id,
          therapist_id: requestRow.therapist_id,
          last_message_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,therapist_id' },
      );

    if (conversationError) throw conversationError;
  }
};

export const setWalkthroughCompleted = async ({
  userId,
  completed,
}: {
  userId: string;
  completed: boolean;
}) => {
  const { error } = await supabase
    .from('user_preferences')
    .upsert(
      {
        user_id: userId,
        walkthrough_completed: completed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    const code = `${(error as any)?.code || ''}`.toUpperCase();
    const message = `${(error as any)?.message || ''}`.toLowerCase();
    const missingColumn = code === '42703' || message.includes('walkthrough_completed');
    if (!missingColumn) {
      throw error;
    }
  }
};

export const getWalkthroughCompleted = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('walkthrough_completed')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    const code = `${(error as any)?.code || ''}`.toUpperCase();
    const message = `${(error as any)?.message || ''}`.toLowerCase();
    const missingColumn = code === '42703' || message.includes('walkthrough_completed');
    if (!missingColumn) {
      throw error;
    }
    return false;
  }

  return Boolean((data as any)?.walkthrough_completed);
};
