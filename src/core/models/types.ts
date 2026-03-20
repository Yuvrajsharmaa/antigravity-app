export type AppRole = 'user' | 'therapist' | 'admin';

export type TherapistLockState = 'exploring' | 'locked' | 'switched';

export type TherapistLockAction = 'lock' | 'keep_exploring' | 'switch';

export type TherapistMatchRequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';

export interface Profile {
  id: string;
  role: AppRole;
  first_name: string | null;
  display_name: string | null;
  handle?: string | null;
  bio?: string | null;
  links?: string[];
  is_private?: boolean;
  avatar_url: string | null;
  email: string | null;
  language: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export type SignupRoleIntent = 'client' | 'therapist';

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
  walkthrough_completed?: boolean;
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
  allow_community_dm_requests?: boolean;
  featured_rank: number;
  rating: number | null;
  created_at: string;
  updated_at: string;
  // Joined from profiles
  display_name?: string;
  avatar_url?: string | null;
  first_name?: string;
  standout_quote?: string | null;
  standout_prompt?: string | null;
}

export interface MatchReasonChip {
  id: string;
  label: string;
}

export type MatchConfidenceLabel = 'excellent' | 'strong' | 'good';

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
  confidenceLabel: MatchConfidenceLabel;
  fitHighlights: string[];
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

export interface OnboardingStepV2 {
  id: string;
  title: string;
  role: 'shared' | 'client' | 'therapist';
  required: boolean;
  optional: boolean;
  resumeKey: string;
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
  check_in_date: string;
  mood: string;
  stress_level: number;
  sleep_hours: number;
  energy_level: number | null;
  connectedness_level: number | null;
  coping_helpfulness: number | null;
  journal_entry: string | null;
  care_score_snapshot: number;
  created_at: string;
  updated_at: string;
}

export type JournalEntryType = 'daily_reflection' | 'post_session_reflection';

export interface JournalEntry {
  id: string;
  user_id: string;
  entry_type: JournalEntryType;
  title: string | null;
  body: string;
  mood: string | null;
  stress_level: number | null;
  sleep_hours: number | null;
  care_score_snapshot: number | null;
  metric_id: string | null;
  session_id: string | null;
  created_at: string;
  updated_at: string;
}

export type TherapistApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface TherapistApplication {
  id: string;
  user_id: string;
  status: TherapistApplicationStatus;
  years_experience: number | null;
  specialties: string[] | null;
  languages: string[] | null;
  communication_style: string | null;
  headline: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TherapistApprovalAction {
  applicationId: string;
  status: Exclude<TherapistApplicationStatus, 'pending'>;
  reviewerId: string;
  rejectionReason?: string | null;
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
  key: 'check_in' | 'journal' | 'connect';
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
  journalWeekMarkers?: CareRhythmMarker[];
}

export interface CareCalendarDay {
  date: string;
  hasActivity: boolean;
  hasCheckIn: boolean;
  hasJournal: boolean;
  hasSession: boolean;
}

export interface CareCalendarMonth {
  monthKey: string;
  monthLabel: string;
  days: CareCalendarDay[];
}

export interface CareCalendarDayDetail {
  date: string;
  hasActivity: boolean;
  checkIn: {
    mood: string | null;
    stressLevel: number | null;
    sleepHours: number | null;
  } | null;
  journalSnippets: string[];
  sessions: Array<{
    timeLabel: string;
    status: Booking['status'];
    sessionType: Booking['session_type'] | null;
    therapistName: string | null;
  }>;
}

export interface CareRhythmVisualState {
  streakCount: number;
  weekMarkers: CareRhythmMarker[];
  bounceBackEligible: boolean;
  rewardState: 'idle' | 'earned' | 'milestone';
}

export type CareFeedbackVariant = 'celebrate' | 'coach' | 'rebound' | 'reassure' | 'reflect';

export interface CarePersonalityState {
  variant: CareFeedbackVariant;
  title: string;
  subtitle: string;
  ctaLabel?: string;
}

export interface ConversationHealthState {
  conversationId: string;
  awaitingReply: boolean;
  lastActivityAt: string | null;
  recentMood: string | null;
}

export type HomePrimaryGoal =
  | 'book_intro'
  | 'join_session'
  | 'check_in'
  | 'message_therapist'
  | 'journal'
  | 'open_community'
  | 'find_match';

export interface CommunityPulseItem {
  id: string;
  topicTitle: string;
  authorAlias: string;
  bodyPreview: string;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
}

export interface HomePersonalizationState {
  primaryGoal: HomePrimaryGoal;
  reason: string;
  cta: string;
  sessionWindow: {
    open: boolean;
    startsAt: string | null;
    minutesUntilOpen: number | null;
  } | null;
  communityPulse: CommunityPulseItem[];
}

export type CommunityModerationState = 'approved' | 'blocked' | 'pending_review';

export interface CommunityTopic {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CommunityPost {
  id: string;
  author_id: string;
  author_alias: string;
  role_badge: 'member' | 'therapist' | 'admin';
  topic_id: string;
  body: string;
  moderation_state: CommunityModerationState;
  moderation_reason: string | null;
  crisis_flag: boolean;
  likes_count: number;
  comments_count: number;
  reposts_count: number;
  shares_count: number;
  created_at: string;
  updated_at: string;
}

export interface CommunityPostMedia {
  id: string;
  post_id: string | null;
  comment_id: string | null;
  media_type: 'image' | 'gif';
  media_url: string;
  media_thumb_url: string | null;
  width: number | null;
  height: number | null;
  sort_index: number;
  created_by: string;
  created_at: string;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  author_id: string;
  author_alias: string;
  role_badge: 'member' | 'therapist' | 'admin';
  body: string;
  moderation_state: CommunityModerationState;
  moderation_reason: string | null;
  crisis_flag: boolean;
  created_at: string;
}

export interface CommunityReaction {
  post_id: string;
  user_id: string;
  reaction_type: 'like';
  created_at: string;
}

export interface CommunityFeedItem {
  post: CommunityPost;
  topic: Pick<CommunityTopic, 'id' | 'slug' | 'title'>;
  viewerLiked: boolean;
  viewerFollowingAuthor?: boolean;
  authorProfile?: Pick<Profile, 'id' | 'display_name' | 'first_name' | 'avatar_url' | 'handle' | 'role'> | null;
  media?: CommunityPostMedia[];
  rankScore: number;
}

export type CommunityFeedSort = 'top' | 'recent';

export interface CommunityDmThread {
  id: string;
  user_a: string;
  user_b: string;
  initiator_id: string;
  receiver_id: string;
  request_status: 'pending' | 'accepted' | 'declined';
  status_reason: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  other_profile?: Pick<Profile, 'id' | 'display_name' | 'first_name' | 'avatar_url' | 'role'>;
  last_message?: CommunityDmMessage | null;
}

export interface CommunityDmMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  media_url: string | null;
  media_type: 'image' | 'gif' | null;
  moderation_state: CommunityModerationState;
  moderation_reason: string | null;
  crisis_flag: boolean;
  created_at: string;
  read_at: string | null;
}

export interface RoleModeContract {
  role: AppRole;
  canUseTherapistMode: boolean;
  canAccessMatchFlow: boolean;
  isAdminClientPreview: boolean;
}

export interface CareScoreFactor {
  id: 'mood' | 'stress' | 'sleep' | 'energy' | 'connectedness' | 'coping';
  label: string;
  weight: number;
  value: number;
  summary: string;
}

export interface CareScoreBreakdown {
  score: number;
  factors: CareScoreFactor[];
}

export interface CarePatternState {
  label: 'steady' | 'watchful' | 'support-needed';
  trend: 'improving' | 'stable' | 'needs-support';
  guidance: string;
}

export interface TherapistLink {
  id: string;
  user_id: string;
  therapist_id: string;
  state: TherapistLockState;
  switch_reason: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActiveTherapistLock {
  id: string;
  user_id: string;
  therapist_id: string;
  therapist_name: string;
  therapist_avatar: string | null;
  therapist_headline: string | null;
  started_at: string;
}

export interface TherapistMatchRequest {
  id: string;
  user_id: string;
  therapist_id: string;
  intro_question: string;
  status: TherapistMatchRequestStatus;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string | null;
  client_avatar?: string | null;
  therapist_name?: string | null;
}

export type MatchRequestConversationState = 'pending' | 'accepted' | 'declined' | 'booked' | null;

export interface IntroBookingEligibility {
  state: MatchRequestConversationState;
  requestId: string | null;
  introQuestion: string | null;
  canBookIntro: boolean;
}

export interface HomeUpdateItem {
  id: string;
  kind: 'session' | 'message' | 'wellbeing' | 'match';
  title: string;
  body: string;
  timestamp: string;
  route?: {
    name: string;
    params?: Record<string, any>;
  };
}

export interface CarePatternExplanation {
  title: string;
  description: string;
  factors: Array<{
    id: CareScoreFactor['id'];
    title: string;
    summary: string;
  }>;
}

export interface DailyCheckInDraftV2 {
  mood: string | null;
  stressLevel: number;
  sleepHours: number | null;
  energyLevel: number;
  connectednessLevel: number;
  copingHelpfulness: number;
  note: string;
}

export type CoveModalVariant = 'confirm' | 'success' | 'error' | 'info' | 'blocking';

export interface CoveModalAction {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
}

export interface CareScoreRangeMeaning {
  label: string;
  description: string;
  color: string;
}

export interface NudgeCooldownState {
  userId: string;
  source: 'system_auto' | 'therapist_manual';
  lastTriggeredAt: string | null;
  cooldownHours: number;
  isBlocked: boolean;
}

export interface AppBootState {
  booting: boolean;
  splashVisible: boolean;
  ready: boolean;
}

export interface ThemeV2Tokens {
  semantic: {
    success: string;
    effort: string;
    streak: string;
    warning: string;
    insight: string;
    calm: string;
    reflect: string;
  };
  semanticSoft: {
    success: string;
    effort: string;
    streak: string;
    warning: string;
    insight: string;
    calm: string;
    reflect: string;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
}

export interface ThemeV3Tokens {
  semantic: {
    success: string;
    effort: string;
    streak: string;
    warning: string;
    insight: string;
    calm: string;
    reflect: string;
  };
  semanticSoft: {
    success: string;
    effort: string;
    streak: string;
    warning: string;
    insight: string;
    calm: string;
    reflect: string;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  color: {
    primary: string;
    cream: string;
    ink: string;
    mist: string;
  };
}

export type CoveVariant =
  | 'default'
  | 'welcome'
  | 'listening'
  | 'thinking'
  | 'celebration'
  | 'tiny';

export type CompanionTone = 'celebrate' | 'coach' | 'reassure' | 'reflect';

export type LottieSceneVariant = 'mascot_idle' | 'step_pop' | 'loading' | 'success_pulse' | 'confetti_lite';
export type MotionPreset = 'loop' | 'oneShot' | 'successPulse' | 'loading';
export type ReducedMotionMode = 'system' | 'always' | 'never';

export interface OnboardingVisualStep {
  heroVariant: LottieSceneVariant;
  ctaStyle: 'primary' | 'secondary';
  progressMode: 'linear' | 'dots';
}

export type AvatarAssetState = 'uploading' | 'ready' | 'failed' | 'fallback';
export type TherapistCardVariant = 'top_match' | 'standard' | 'limited_slots';

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
