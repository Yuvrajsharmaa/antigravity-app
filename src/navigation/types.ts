import { AvailabilitySlot, MatchReasonChip, Therapist } from '../core/models/types';

export interface ChatRouteParams {
  conversationId: string;
  therapistName?: string;
  therapistAvatar?: string | null;
  therapistId?: string;
}

export interface TherapistProfileRouteParams {
  therapist: Therapist;
  matchReasonChips?: MatchReasonChip[];
  matchScore?: number;
  nextAvailableAt?: string | null;
}

export interface SlotSelectionRouteParams {
  therapist: Therapist;
  preselectedSlot?: AvailabilitySlot;
}

export interface VideoCallRouteSession {
  id: string | null;
  booking_id: string;
  scheduled_start_at: string;
  scheduled_end_at: string;
  participant_id?: string;
  participant_name?: string;
  participant_avatar?: string | null;
  therapist_name?: string;
  therapist_avatar?: string | null;
  status?: string;
  video_call_id?: string | null;
  booking_status?: 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'failed';
  session_type?: 'video' | 'chat';
}

