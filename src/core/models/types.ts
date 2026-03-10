export type AppRole = 'user' | 'therapist' | 'admin';

export interface Profile {
  id: string;
  role: AppRole;
  first_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  language: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  intent_tags: string[];
  session_preference: 'chat' | 'video' | 'both';
  wellbeing_reminders_enabled: boolean;
  wellbeing_reminder_time: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  therapist_gender_preference?: 'no_preference' | 'female' | 'male' | 'non_binary';
  time_preference?: 'morning' | 'afternoon' | 'evening' | 'flexible';
  care_style_preference?: string | null;
  journal_enabled?: boolean;
  journal_sharing?: 'none' | 'summary' | 'entry_by_entry' | 'all';
  engagement_mode?: 'gentle' | 'balanced' | 'high';
  nudge_snooze_until?: string | null;
  care_buddy_enabled?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Therapist {
  id: string;
  headline: string;
  bio: string;
  years_experience: number;
  languages: string[];
  specialties: string[];
  session_fee_inr: number;
  chat_fee_inr: number | null;
  is_verified: boolean;
  is_active: boolean;
  featured_rank: number;
  rating: number | null;
  created_at: string;
  updated_at: string;
  // Joined from profiles
  display_name?: string;
  avatar_url?: string | null;
  first_name?: string;
}

export interface MatchReasonChip {
  id: string;
  label: string;
}

export interface MatchScoreBreakdown {
  intent: number;
  careStyle: number;
  language: number;
  availability: number;
  quality: number;
  total: number;
}

export interface MatchedTherapist {
  therapist: Therapist;
  score: number;
  scoreBreakdown: MatchScoreBreakdown;
  reasonChips: MatchReasonChip[];
  nextAvailableAt: string | null;
  availableSlots72h: number;
}

export interface OnboardingQuestion {
  id: string;
  title: string;
  helper?: string;
  required: boolean;
}

export interface OnboardingStepConfig {
  id: string;
  title: string;
  role: 'shared' | 'client' | 'therapist';
  questions: OnboardingQuestion[];
}

export interface OnboardingResponseDraft {
  firstName?: string;
  intentTags?: string[];
  language?: string;
  sessionPreference?: 'chat' | 'video' | 'both';
  timePreference?: 'morning' | 'afternoon' | 'evening' | 'flexible';
}

export interface AvailabilitySlot {
  id: string;
  therapist_id: string;
  start_at: string;
  end_at: string;
  slot_type: 'video' | 'chat';
  is_available: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  therapist_id: string;
  last_message_at: string | null;
  created_at: string;
  // Joined
  therapist_name?: string;
  therapist_avatar?: string | null;
  last_message?: string;
  unread_count?: number;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  message_type: string;
  is_blocked: boolean;
  blocked_reason: string | null;
  created_at: string;
  read_at: string | null;
}

export interface Booking {
  id: string;
  user_id: string;
  therapist_id: string;
  slot_id: string;
  session_type: 'video' | 'chat';
  status: 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'failed';
  scheduled_start_at: string;
  scheduled_end_at: string;
  amount_inr: number;
  payment_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  therapist_name?: string;
  therapist_avatar?: string | null;
  therapist_headline?: string;
}

export interface Session {
  id: string;
  booking_id: string;
  conversation_id: string | null;
  video_provider: string;
  video_call_id: string | null;
  video_room_token_hint: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  joined_user_at: string | null;
  joined_therapist_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined from booking
  booking?: Booking;
}

export interface ClientMetric {
  id: string;
  user_id: string;
  mood: string;
  stress_level: number;
  sleep_hours: number;
  journal_entry: string | null;
  care_score_snapshot: number;
  created_at: string;
}

export type RiskLevel = 'high' | 'medium' | 'stable';

export type DependencyStatus = 'ready' | 'missing' | 'recoverable';

export interface FlowDependencyState {
  key: string;
  label: string;
  status: DependencyStatus;
  detail?: string;
  actionHint?: string;
}

export interface CareJourneyGoal {
  key: 'check_in' | 'reflect' | 'connect';
  label: string;
  completed: boolean;
  helper: string;
}

export interface CareJourneyState {
  dateKey: string;
  completedCount: number;
  totalCount: number;
  rhythmDays: number;
  rhythm: CareRhythmState;
  goals: CareJourneyGoal[];
  nextActionLabel: string;
}

export interface CareRhythmMarker {
  dateKey: string;
  dayLabel: string;
  completed: boolean;
  isToday: boolean;
}

export interface CareRhythmState {
  currentStreak: number;
  highestStreak: number;
  repairsAvailable: number;
  weekMarkers: CareRhythmMarker[];
}

export interface ConversationHealthState {
  conversationId: string;
  awaitingReply: boolean;
  lastActivityAt: string | null;
  recentMood: string | null;
}

export interface RoleModeContract {
  role: AppRole;
  canUseTherapistMode: boolean;
  canAccessMatchFlow: boolean;
}

export interface NudgeCooldownState {
  userId: string;
  source: 'system_auto' | 'therapist_manual';
  lastTriggeredAt: string | null;
  cooldownHours: number;
  isBlocked: boolean;
}

export interface CareNudgeEvent {
  id: string;
  user_id: string;
  therapist_id: string | null;
  trigger_type: string;
  risk_level: RiskLevel;
  source: 'system_auto' | 'therapist_manual';
  message_preview: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  booking_reference: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  user_id: string;
  amount_inr: number;
  currency: string;
  status: 'created' | 'verified' | 'failed' | 'refunded';
  created_at: string;
  updated_at: string;
}
