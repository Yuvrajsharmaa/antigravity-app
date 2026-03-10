import { supabase } from '../../services/supabase';
import { NudgeCooldownState } from '../models/types';

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
