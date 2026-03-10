import { supabase } from '../../services/supabase';

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
  const { data: existing, error: readError } = await supabase
    .from('sessions')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (readError) throw readError;
  if (existing?.id) return existing.id;

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
  const { data: slotLock, error: slotError } = await supabase
    .from('availability_slots')
    .update({ is_available: false })
    .eq('id', slotId)
    .eq('is_available', true)
    .select('id')
    .maybeSingle();

  if (slotError) throw slotError;
  if (!slotLock) throw new Error('This slot is no longer available.');

  const { data: bookingUpdate, error: bookingError } = await supabase
    .from('bookings')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('status', 'pending_payment')
    .select('id')
    .maybeSingle();

  if (bookingError) throw bookingError;
  if (!bookingUpdate) throw new Error('Booking could not be confirmed.');

  await ensureSessionForBooking({ bookingId });
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

