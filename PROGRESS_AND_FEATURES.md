# 🎉 Care Space: Progress & Features

> **AI HANDOVER PROTOCOL (For Antigravity, Cursor, Codex, etc.)**
> 1. **Read this file first** when starting a new session to understand the current state.
> 2. **Update this file last** when finishing a task. Add your completed features to the `Recent Updates` log.
> 3. **Sync your context** by viewing this file before overriding existing patterns.

---

## 🚀 Overall Goal
Build **"Care Space"**, a comprehensive psychological consultation platform where users can book therapists, join 1:1 video sessions, and actively track their mental health. Specifically designed to handle the dual journey for **Clients** (Care Plan, Metric logs) and **Therapists** (Dashboard, Client notes, Real-time nudges).

---

## 🛠️ Current Implemented Features
*As of March 2026*

### 1. The Dual-Role App Architecture
- Universal iOS-style Navigation (`AppNavigator.tsx`) with dynamic tabs.
- `AuthContext` provides a global `isTherapistMode` toggle. The app UI fundamentally transforms whether you are in Client Mode or Therapist Mode.
- Supabase Authentication and Profile management linked.

### 2. Client Journey: Care Plan & Mental Health Tracking
- **Mental Health Dashboard:** 
  - Tracks and calculates a dynamic "CareScore".
  - Interactive Daily Check-in Modal (`DailyCheckInModal.tsx`) capturing Mood, Stress, Sleep, and Journal data.
  - Interactive "Mindful Tracker" widgets.
- **Messages & Nudges:** Care Plan check-ins have actionable "Reply" buttons taking users straight to their active Therapist chat.

### 3. Therapist Journey: Practice Dashboard
- **Real-Time Client Roster:** Fetches live clients from the `conversations` table linked to the Therapist.
- **Alert Triaging:** Automatically scans client metric logs and pushes clients with "High Stress (4+)" or "Low CareScore (<50)" to the top of the "Needs Attention" list.
- **Client Detail Screen:** (`ClientDetailScreen.tsx`) allowing therapists to read deep into a client's historical daily metrics and journal entries.
- **One-Tap Check-in Nudges:** Therapists can tap "Send Check-in" from the dashboard, which dynamically fires a message directly into the client's inbox via Supabase.

### 4. Real-Time Capabilities
- Supabase Realtime logic implemented on the `messages` and `client_metrics` tables.
- Chat interactions and Nudge alerts sync instantly without refreshing via WebSocket channels.

---

## 📈 Recent Updates Log (Changelog)

- **[Codex AGENT] - March 10, 2026 (Personality-Rich UX + Dependency Hardening Sprint)**
  - Added shared reliability layer:
    - New `src/core/services/careFlowService.ts` with reusable actions:
      - `ensureConversation`
      - `ensureSessionForBooking`
      - `confirmBookingAndEnsureSession`
      - `createCareNudgeEvent`
      - `completeSessionAndBooking`
    - New `src/core/utils/flowDependencies.ts` for dependency gating (`ready/missing/recoverable`) and actionable blocker messaging.
  - Added personality/engagement system primitives:
    - New `src/core/utils/careBuddy.ts` with voice packs (`celebrate`, `coach`, `reassure`, `reflect`) and context helpers.
    - New `src/core/hooks/useCareJourney.ts` for daily journey progress (`Check-in`, `Reflect`, `Connect`) and weekly rhythm scoring.
  - Extended frontend contracts in `src/core/models/types.ts`:
    - `CareJourneyState`, `FlowDependencyState`, `ConversationHealthState`.
    - `UserPreferences` additions: `engagement_mode`, `nudge_snooze_until`, `care_buddy_enabled`.
  - Added Supabase migration + schema sync for personality preferences:
    - `supabase/migrations/20260310235500_care_buddy_preferences.sql`
    - Synced `supabase/schema.sql` `user_preferences` with `engagement_mode`, `nudge_snooze_until`, `care_buddy_enabled`.
  - Home/client experience upgrade (`src/features/home/HomeScreen.tsx`):
    - Added dynamic **Daily Care Journey** card with Care Buddy voice, goal chips, and next-best-action CTA.
    - Added check-in trigger bridge into dashboard modal (`openSignal`) and haptic feedback for goal taps.
    - Added canonical therapist discovery error/retry state (`ErrorState`) instead of silent failures.
  - Check-in/dashboard UX improvements:
    - `src/features/home/components/MentalHealthDashboard.tsx`: external quick-open signal support for check-in modal.
    - `src/features/home/components/DailyCheckInModal.tsx`:
      - Care Buddy coaching copy.
      - Sleep preset chips + optional custom input.
      - Success haptics and celebratory copy.
      - Migrated auto-risk nudge event writes to shared `createCareNudgeEvent`.
  - Reliability integration in booking/session flows:
    - `src/features/booking/SlotSelectionScreen.tsx`: dependency guard messaging + shared `ensureConversation`.
    - `src/features/sessions/SessionsScreen.tsx`: shared confirm chain via `confirmBookingAndEnsureSession` + explicit load error/retry state.
    - `src/features/video/VideoCallScreen.tsx`: dependency checks before join, shared completion sync via `completeSessionAndBooking`, and fallback recovery UI.
    - `src/features/sessions/SessionPrepScreen.tsx`: session prep state persistence (agenda/feeling) using AsyncStorage + explicit readiness card.
    - `src/features/sessions/PostSessionReflectionScreen.tsx`: shared conversation/nudge services + reflective Care Buddy prompt + success haptics.
  - Therapist and messaging UX refinements:
    - `src/features/therapist-dashboard/TherapistDashboardScreen.tsx`:
      - Uses shared booking confirm chain.
      - Nudge template now prefills from Care Buddy risk-aware copy.
      - Manual nudge actions now persist `care_nudge_events` via shared service.
    - `src/features/messages/MessagesListScreen.tsx`:
      - Added canonical load error/retry.
      - Added conversation health hints (`Awaiting your reply`, therapist-side recent mood label).
    - `src/features/messages/ChatScreen.tsx`:
      - Added route dependency guard for missing conversation payload.
      - Added load error/retry state.
      - Added subtle Care Buddy reflection coach banner.
  - Discovery/profile and notification refinement:
    - `src/features/therapist/TherapistProfileScreen.tsx`:
      - Added availability loading/error states.
      - Added “What working together feels like” expectation-setting section.
    - `src/features/profile/NotificationsScreen.tsx`:
      - Added Care Buddy toggle and engagement mode control.
      - Added nudge snooze actions (`Today`, `48h`, `This week`, `Resume now`).
      - Persists `care_buddy_enabled`, `engagement_mode`, `nudge_snooze_until` to `user_preferences`.
    - `src/core/utils/wellbeingNotifications.ts` updated to:
      - Respect `nudge_snooze_until`.
      - Personalize reminder copy with Care Buddy voice.
  - Onboarding refinement:
    - `src/features/onboarding/OnboardingScreen.tsx`:
      - Added local onboarding resume (`step` restore/save via AsyncStorage by user+role).
      - Added Care Buddy settings in onboarding (`care_buddy_enabled`, `engagement_mode`) and persists to preferences.

- **[Codex AGENT] - March 10, 2026 (Onboarding Reachability + Full-Screen Welcome Pass)**
  - Updated `src/features/onboarding/OnboardingScreen.tsx` to improve first-run usability and one-hand reach:
    - Made onboarding step 1 (welcome) full-screen-style with dynamic viewport height sizing.
    - Applied leaf app mark + `Care Space` brand treatment consistently on both client and therapist welcome steps.
    - Centered non-welcome step content vertically for easier thumb access on smaller devices.
    - Switched onboarding scroll behavior to `keyboardShouldPersistTaps="always"` so chip/select controls remain instantly tappable while keyboard is open.
    - Converted onboarding checkbox rows to full-row press targets (`Pressable`) so users can toggle without precision taps.
  - Preserved all existing onboarding validation, Supabase writes, role branching, and navigation behavior.

- **[Codex AGENT] - March 10, 2026 (UX Cleanup: Onboarding + Profile Scroll)**
  - Simplified onboarding header in `src/features/onboarding/OnboardingScreen.tsx`:
    - Removed heavy step summary card and removed `Client Setup`/`Therapist Setup` label text.
    - Replaced segmented top indicator with a minimal single progress track.
  - Kept onboarding content style soft but less noisy while preserving all existing onboarding logic and data writes.
  - Fixed `ProfileScreen` accessibility issue by wrapping content in `ScrollView` so users can always reach `Sign out` on smaller screens.

- **[Codex AGENT] - March 10, 2026 (Onboarding UI Interaction Polish)**
  - Refined `src/features/onboarding/OnboardingScreen.tsx` to feel more interactive while preserving existing Care Space earth-tone design tokens and component system.
  - Added contextual onboarding step header (`Step x of y`, flow badge, step title/hint) for better progression clarity.
  - Improved visual hierarchy with card-based step sections (without changing onboarding logic/dependencies).
  - Added subtle decorative hero background blobs and minimal mood/style emoji labeling for friendlier tone without over-styling.
  - Upgraded checkbox visuals to match the app’s soft-card interaction style.
  - Preserved all functional behavior, validation, data persistence, and route flow exactly as-is.

- **[Codex AGENT] - March 10, 2026 (Profile UX Utility)**
  - Added `View onboarding again` action in `src/features/profile/ProfileScreen.tsx`.
  - Action resets `profiles.onboarding_completed = false` for current user and refreshes auth profile state.
  - App now routes the user back into onboarding immediately after triggering restart.

- **[Codex AGENT] - March 10, 2026 (Onboarding UX Refinement + Therapist Snapshot Upgrade)**
  - Added and applied migration `supabase/migrations/20260310232000_onboarding_journal_preferences.sql` on project `hvzmxceeitrabskaikmm`:
    - Extended `user_preferences` with onboarding/matching/journal controls:
      - `therapist_gender_preference`
      - `time_preference`
      - `care_style_preference`
      - `journal_enabled`
      - `journal_sharing`
  - Synced canonical schema (`supabase/schema.sql`) with new `user_preferences` columns/check constraints.
  - Expanded client onboarding to better match the desired lightweight-but-contextual flow:
    - Intent-first intake (up to 2 reasons).
    - Matching preferences (language, mode, therapist gender optional, time preference, care style).
    - Light emotional check-in (mood, stress, sleep, optional note).
    - Journal opt-in + sharing mode selection (summary / entry-by-entry / all / none).
    - Gentle reminder controls retained (time + quiet hours).
    - Implemented in `src/features/onboarding/OnboardingScreen.tsx`.
  - Added optional onboarding baseline metric write into `client_metrics` when user provides mood/stress/sleep inputs.
  - Upgraded therapist pre-session view (`src/features/sessions/SessionPrepScreen.tsx`) with a compact client snapshot card:
    - Primary reason/intent
    - Mood, stress, sleep
    - Care style preference
    - Optional pre-session note
    - Existing risk triage and suggested opener retained.
  - Updated frontend `UserPreferences` typings in `src/core/models/types.ts` for new fields.

- **[Codex AGENT] - March 10, 2026 (Session Experience + Adaptive Nudges + Role Onboarding Sprint)**
  - Added migration `supabase/migrations/20260310211000_session_journey_nudges.sql` and synced canonical schema (`supabase/schema.sql`) to:
    - Extend `user_preferences` with `wellbeing_reminders_enabled`, `wellbeing_reminder_time`, `quiet_hours_start`, `quiet_hours_end`.
    - Create `care_nudge_events` table for therapist-visible automated/manual nudge trail.
    - Add RLS policies for client/therapist read/insert access on `care_nudge_events`.
    - Add realtime publication support for `care_nudge_events`.
  - Added shared behavior utilities:
    - `src/core/utils/careRisk.ts` with standardized risk assessment (`high`/`medium`/`stable`) and sorting priority.
    - `src/core/utils/wellbeingNotifications.ts` with local notification init, permissions, adaptive reminder scheduling, quiet-hours handling, and supportive nudge trigger APIs.
  - Integrated adaptive local reminders (Expo Notifications):
    - Added `expo-notifications` dependency.
    - App boot notification init in `App.tsx`.
    - Auth-level best-effort reminder refresh in `AuthContext`.
    - Post-check-in reminder rescheduling and high-risk supportive local nudge firing in `DailyCheckInModal`.
    - Notification preferences screen now persists wellbeing reminder toggles/time/quiet-hours to Supabase and re-schedules/cancels reminders interactively.
  - Delivered role-aware pre/post session journey:
    - Added `SessionPrepScreen.tsx` (client + therapist prep modules, device checks, join window countdown, therapist risk snapshot).
    - Added `PostSessionReflectionScreen.tsx` (client reflection logging + therapist follow-up quick actions).
    - Updated `AppNavigator.tsx` with `SessionPrep` and `PostSessionReflection` routes.
    - Updated `SessionsScreen.tsx` with `Session Prep` action and richer session payloads.
    - Updated `VideoCallScreen.tsx` end-of-call flow to route users into post-session follow-up/reflection.
    - Added upcoming-session prep/join entry card on `HomeScreen.tsx`.
  - Upgraded therapist dashboard triage and follow-up:
    - `TherapistDashboardScreen.tsx` now uses shared CareScore risk logic instead of ad-hoc checks.
    - Added risk badges (`High`/`Medium`/`Stable`), auto-nudge indicators from `care_nudge_events`, and risk-priority sorting.
    - Nudge send action now pre-fills context based on current risk reason.
    - Upcoming session cards now include `Session Prep` and role-aware join flow payloads.
  - Rebuilt onboarding into role-specific interactive journeys:
    - `OnboardingScreen.tsx` now has a 6-step client flow (welcome, identity, goals, preferences, reminder preferences, safety).
    - Added 5-step therapist flow (welcome, profile intro, expertise/languages, practice style, compliance).
    - Added animated step transitions, expanded contextual guidance, and onboarding-time reminder setup logic for clients.

- **[Codex AGENT] - March 10, 2026 (CareScore + App Interactivity Sprint)**
  - Added idempotent migration SQL at `supabase/migrations/20260310_care_score_and_client_metrics.sql` to:
    - Create `client_metrics` if missing.
    - Hard-migrate `freud_score_snapshot` to `care_score_snapshot`.
    - Ensure RLS policies and realtime publication for `client_metrics`.
  - Synced canonical schema (`supabase/schema.sql`) to `care_score_snapshot` naming.
  - Added backend readiness utilities:
    - `useClientMetricsReadiness` hook for setup detection.
    - `BackendSetupCard` component for blocking setup guidance and retry actions.
  - Refactored mood tracking to be setup-safe and resilient:
    - `MentalHealthDashboard` now shows setup/error states and uses CareScore naming.
    - `DailyCheckInModal` now validates sleep input, blocks save when backend setup is missing, and writes `care_score_snapshot`.
  - Replaced CareScore references across therapist analytics flows:
    - `TherapistDashboardScreen` alert triaging now uses `care_score_snapshot`.
    - `ClientDetailScreen` timeline badges now display `CareScore`.
  - Deepened therapist dashboard interactivity:
    - Removed all dummy client/session blocks.
    - Added live stats (active clients, upcoming sessions, expected revenue).
    - Added live upcoming sessions list with confirm/join actions.
    - Wired `View all` to Sessions tab with upcoming focus.
  - Added missing interactive modules/screens:
    - New `JournalScreen` (view and save journal entries to today's check-in).
    - New Profile sub-screens: `EditProfileScreen`, `NotificationsScreen` (AsyncStorage-backed), and `InfoScreen` (Privacy, Help, Terms, Policy, About).
    - Navigation now uses nested Home/Profile stacks to support these flows.
  - Wired previously non-interactive entry points:
    - Home notification icon -> notifications settings.
    - Home daily journal CTA -> journal screen.
    - Profile menu items now navigate to real sub-screens.

- **[Codex AGENT] - March 10, 2026 (Dev Admin Enablement)**
  - Added dev-admin bootstrapping in `AuthContext.tsx` for `yuvrajsharma6367@gmail.com`:
    - Auto-promotes the matching profile role to `admin` on login/profile refresh.
    - Exposes `isDevAdmin` in auth context for admin-gated developer utilities.
  - Added admin-only testing compatibility in `SessionsScreen.tsx`:
    - Pending bookings now show `Dev: Confirm booking` for authenticated dev admin users.
    - This lets the same client account approve pending bookings and unlock video-call join flow for testing without therapist-side login.

- **[Codex AGENT] - March 10, 2026**
  - Expanded `supabase/schema.sql` booking RLS with therapist-scoped select/update policies (`bookings_select_therapist`, `bookings_update_therapist`) while preserving client-owned policies.
  - Upgraded `SlotSelectionScreen.tsx` with resilient slot fetching UX: loading state, error state with retry, and explicit empty-state behavior for no availability.
  - Updated booking creation flow to create `bookings` in `pending_payment` status (instead of auto-confirming), and kept conversation bootstrap logic intact.
  - Updated `BookingConfirmationScreen.tsx` UI copy/status indicators to show "Awaiting therapist confirmation" for pending bookings.
  - Refactored `SessionsScreen.tsx` into a role-aware flow:
    - Client mode loads own bookings and joins confirmed sessions.
    - Therapist mode loads assigned bookings, supports `Confirm booking`, locks slot availability, and ensures a `sessions` row is created for confirmed bookings.
    - Join CTA now appears only for confirmed/in-progress video sessions.
  - Refined `VideoCallScreen.tsx` to use role-neutral participant metadata (client or therapist), preserve placeholder call UI controls, and update `sessions`/`bookings` state transitions on join/end for both roles.

- **[Antigravity AGENT] - March 10, 2026**
  - Completely removed the "AI Therapy Bot".
  - Re-wired the `MentalHealthDashboard` to fetch true live data from Supabase.
  - Created `DailyCheckInModal` to take user input on Mood, Stress, Sleep, Journal and calculate a standard "Freud Score" based on those data points. 
  - Ran DDL SQL to create `client_metrics` with RLS policies limiting client access to their own data, but allowing assigned therapists full view access.
  - Built `ClientDetailScreen` in Therapist flow so that therapists can actually read the live metrics submitted by clients.

---

## 🎯 Next Steps / Pending Roadmap
1. Develop the Video Calling UI (`VideoCallScreen.tsx`) integration.
2. Build the exact Booking Flow + UI.
3. Apply final UI polish using the Sage Green/Earth-tone Design System.
4. Implement push notifications via Expo router or similar system for live messages. 
