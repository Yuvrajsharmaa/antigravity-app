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

- **[Codex AGENT] - March 11, 2026 (Edge-Case Follow-up: Route Guard + Tab-Safe Scrolling + Onboarding Header Simplification)**
  - Fixed remaining role-route mismatch in messages:
    - `src/features/messages/MessagesListScreen.tsx` now uses role contract checks for empty-state CTA.
    - Client mode keeps `Go to Match`; therapist/admin mode now shows non-Match guidance (prevents dead-end navigation to hidden tab).
  - Applied tab-bar-safe dynamic bottom spacing for long screens to prevent clipped actions/content:
    - `src/features/home/HomeScreen.tsx`
    - `src/features/match/TherapistMatchScreen.tsx`
    - `src/features/sessions/SessionsScreen.tsx`
    - `src/features/messages/MessagesListScreen.tsx`
    - `src/features/journal/JournalScreen.tsx`
    - `src/features/profile/ProfileScreen.tsx`
    - `src/features/profile/NotificationsScreen.tsx`
    - Uses `useBottomTabBarHeight()` for runtime-safe padding across device sizes.
  - Simplified onboarding top metadata strip for cleaner thumb-friendly focus:
    - `src/features/onboarding/OnboardingScreen.tsx`
    - Removed role badge chips from step header and kept minimal `Step X of Y` + step title.
  - Validation:
    - `npx tsc --noEmit` passes.

- **[Codex AGENT] - March 11, 2026 (Deep Stabilization Pass: Role Guards + Atomic Confirm + Messaging Reliability)**
  - Enforced strict role boundaries across navigation and therapist workflows:
    - `src/core/context/AuthContext.tsx`: added `canUseTherapistMode` contract, blocked therapist mode for non-therapist/non-admin users, and auto-reset invalid mode state.
    - `src/navigation/AppNavigator.tsx`: Match tab is now client-mode only; therapist/admin in therapist mode get a 4-tab therapist layout (`Dashboard/Home`, `Sessions`, `Messages`, `Profile`).
    - Added role contract helper `src/core/utils/roleAccess.ts`.
    - Guarded therapist-only surfaces:
      - `src/features/therapist-dashboard/TherapistDashboardScreen.tsx`
      - `src/features/therapist-dashboard/ClientDetailScreen.tsx`
      - `src/features/match/TherapistMatchScreen.tsx` (blocked in therapist mode).
  - Fixed broken therapist-profile chat entrypoint and route dependency safety:
    - `src/features/therapist/TherapistProfileScreen.tsx` now uses `ensureConversation(...)` before navigating to chat.
    - `src/features/messages/ChatScreen.tsx` now hard-guards initialization so message fetch/realtime do not run without a valid `conversationId`.
  - Added typed route payload contracts to reduce param-mismatch crashes:
    - New `src/navigation/types.ts` with typed params for `Chat`, `TherapistProfile`, `SlotSelection`, and `VideoCall` payloads.
  - Stabilized booking confirmation chain with atomic backend operation:
    - New migration: `supabase/migrations/20260311101500_flow_stabilization_policies_and_atomic_confirm.sql`.
      - Adds therapist conversation RLS policies: `conv_select_therapist`, `conv_update_therapist`, `conv_insert_therapist`.
      - Adds RPC: `public.confirm_booking_atomic(p_booking_id UUID, p_slot_id UUID)` for transactional slot lock + booking confirm + session ensure.
    - `src/core/services/careFlowService.ts` now calls RPC in `confirmBookingAndEnsureSession(...)`, with migration-missing fallback messaging.
    - Synced canonical schema in `supabase/schema.sql` with new conversation policies and RPC definition.
  - Added nudge dedupe/cooldown reliability:
    - `src/core/services/careFlowService.ts`: new `getNudgeCooldownState(...)`.
    - `src/features/home/components/DailyCheckInModal.tsx`: auto high-risk nudge now deduped to max once/24h per user and inserts a single therapist-visible event per cooldown window.
    - `src/features/therapist-dashboard/TherapistDashboardScreen.tsx`: manual therapist template nudge now blocked if sent within previous 24h.
  - Improved messaging list performance and resilience:
    - `src/features/messages/MessagesListScreen.tsx` replaced N+1 per-conversation fetches with batched queries for latest messages and recent moods; missing metrics now soft-fail without breaking list load.
  - Added additional no-dead-end safeguards:
    - `src/features/booking/SlotSelectionScreen.tsx` and `src/features/booking/BookingConfirmationScreen.tsx` now include missing-param recovery states.
    - `src/features/sessions/SessionsScreen.tsx`: client empty-state CTA now routes to `MatchTab`; added retry affordance when session room is still being prepared.
    - `src/features/video/VideoCallScreen.tsx`: added server-truth refresh before join and recoverable stale-status card with retry.
  - Onboarding/UX semantics hardening:
    - `src/features/onboarding/OnboardingScreen.tsx`: added quiet-hours coherence validation before completion and softened therapist step naming (`Practice Profile`).
    - `src/core/services/matchingService.ts`: now incorporates `session_preference` and `time_preference` into slot selection/availability scoring and reason chips.
    - `src/features/profile/NotificationsScreen.tsx`: added explicit save-error handling for preference writes (no silent failures).
  - Validation:
    - `npx tsc --noEmit` passes.

- **[Codex AGENT] - March 11, 2026 (Home Separation + Dedicated Therapist Match Flow)**
  - Split therapist discovery out of Home and into a dedicated matching tab:
    - Added new `Match` tab stack in `src/navigation/AppNavigator.tsx`.
    - Added new screen `src/features/match/TherapistMatchScreen.tsx`.
  - Implemented structured therapist matching intake (client side):
    - 3-step flow in `TherapistMatchScreen.tsx`:
      - support focus (up to 2 intent selections),
      - care style + optional therapist gender preference,
      - language + session mode + time preference.
    - Persists answers to Supabase `user_preferences` and updates profile language.
    - Reuses `matchTherapistsForClient` for ranked output (`Top 3` + curated roster).
    - Added transparent “why this match” chips and media-first therapist cards.
  - Simplified Home experience (`src/features/home/HomeScreen.tsx`):
    - Removed therapist discovery sections from Home (`Top therapist matches` and `Browse curated therapists`).
    - Added focused “Find your therapist fit” CTA that routes to `MatchTab`.
    - Preserved care journey, check-in, journal, messages, and upcoming session actions.
  - Softened metric card visual intensity in `src/features/home/components/MentalHealthDashboard.tsx`:
    - Switched CareScore/Mood cards to softer backgrounds with darker text and reduced visual saturation.
  - Updated messages empty-state routing in `src/features/messages/MessagesListScreen.tsx`:
    - Empty CTA now routes users to `MatchTab` instead of Home.
  - Validation:
    - `npx tsc --noEmit` passes.

- **[Codex AGENT] - March 11, 2026 (UX Fix Pass: Scrollability + Match Visibility + Nav/Radius Corrections)**
  - Fixed bottom-nav overlap and viewport clipping:
    - Updated `src/navigation/AppNavigator.tsx` tab bar from floating absolute layout to stable docked layout with safe-area height.
    - This prevents tab bar from covering content on long screens (Journal/Notifications/Chat etc.).
  - Added/standardized required scrolling for long content screens:
    - `src/features/profile/NotificationsScreen.tsx` now wrapped in `ScrollView` with bottom-safe content padding.
    - `src/features/sessions/SessionPrepScreen.tsx` now uses `ScrollView` for full prep content on smaller devices.
    - `src/features/sessions/PostSessionReflectionScreen.tsx` now uses `ScrollView` for full follow-up/reflection actions.
    - `src/features/profile/EditProfileScreen.tsx` now scrollable with safe bottom padding.
    - `src/features/booking/BookingConfirmationScreen.tsx` converted to scrollable container and top-aligned layout.
  - Reduced over-rounded corners globally:
    - Tuned `src/core/theme/spacing.ts` radius tokens down (`sm/md/lg/xl`) to reduce excessive squircle rounding.
  - Restored therapist match visibility and fallback behavior:
    - Updated `src/core/services/matchingService.ts` to fallback from `verified + active` to `active` therapists when verified pool is empty.
  - Upgraded therapist discovery card UX (Airbnb-inspired card structure):
    - `src/features/home/HomeScreen.tsx` now uses media-first therapist cards with top visual panel, heart icon slot, rationale chips, and price/availability summary.
    - Top matches now displayed in horizontal featured card row for immediate visibility.
  - Added explicit therapist/client onboarding distinction:
    - `src/features/onboarding/OnboardingScreen.tsx` now shows role badge (`Client Journey` / `Therapist Journey`) in step header.
    - Therapist welcome panel has distinct visual treatment from client flow.

- **[Codex AGENT] - March 11, 2026 (Global UI Upgrade Sprint: White Premium + Squircle System)**
  - Rolled out a global visual system refresh (white-first, earth-tone accents, squircle surfaces) across core theme and shared UI primitives:
    - Updated `src/core/theme/colors.ts` for lighter base surfaces + refined sage/earth accents.
    - Updated `src/core/theme/typography.ts` to a friendlier non-default font stack (Avenir Next on iOS, medium-weight sans on Android) with stronger hierarchy.
    - Updated `src/core/theme/spacing.ts` radius/shadow tokens for Apple-style squircle corners and softer depth.
    - Updated shared components:
      - `src/core/components/Button.tsx` (squircle buttons, clearer primary/secondary/ghost hierarchy).
      - `src/core/components/PillChip.tsx` (chip style shifted to soft selected state for non-aggressive interactions).
      - `src/core/components/StateViews.tsx` (state cards now rendered as panel surfaces, not flat placeholders).
  - Upgraded global navigation shell:
    - `src/navigation/AppNavigator.tsx` tab bar now uses a floating rounded/squircle panel style with stronger visual polish.
  - Applied screen-level parity pass to ensure “whole app” visual consistency:
    - Auth:
      - `src/features/auth/WelcomeScreen.tsx` redesigned with leaf branding, soft hero panel, and cleaner premium entry card.
    - Matching/Home/Journey:
      - `src/features/home/HomeScreen.tsx` already on new panel language; aligned with updated tokens and chips.
      - `src/features/home/components/MentalHealthDashboard.tsx` updated panel/chip/callout shapes and prompt visuals.
      - `src/features/home/components/DailyCheckInModal.tsx` updated chip/buttons to squircle and softer active states.
    - Booking:
      - `src/features/booking/SlotSelectionScreen.tsx` updated date/time/duration chips and state cards to squircle style.
      - `src/features/booking/BookingConfirmationScreen.tsx` updated confirmation/timeline cards and icon treatment for premium consistency.
    - Sessions:
      - `src/features/sessions/SessionsScreen.tsx` refined tab selection and session action surface styling.
      - `src/features/sessions/SessionPrepScreen.tsx` updated cards/inputs/snapshot modules to squircle panel style.
      - `src/features/sessions/PostSessionReflectionScreen.tsx` updated chips/inputs/actions to soft, white-first interaction language.
    - Messages:
      - `src/features/messages/MessagesListScreen.tsx` converted list rows into card-like conversation panels.
      - `src/features/messages/ChatScreen.tsx` refined composer, bubbles, banners, and header for full visual parity.
    - Profile + Settings:
      - `src/features/profile/ProfileScreen.tsx` retains scroll/accessibility fix and rhythm panel, aligned with new tokens.
      - `src/features/profile/EditProfileScreen.tsx` converted to card-form layout.
      - `src/features/profile/NotificationsScreen.tsx` upgraded settings cards to new rounded panel style.
      - `src/features/profile/InfoScreen.tsx` aligned info content to premium rounded card surface.
    - Therapist side:
      - `src/features/therapist-dashboard/TherapistDashboardScreen.tsx` kept risk-first functionality while aligning chips/cards to shared UI family.
      - `src/features/therapist/TherapistProfileScreen.tsx` aligned rationale chips/surfaces to upgraded component language.
      - `src/features/therapist-dashboard/ClientDetailScreen.tsx` inherits updated tokens for consistent typography/colors/radius behavior.
    - Video:
      - `src/features/video/VideoCallScreen.tsx` re-themed waiting/active overlays and controls to better align with app-wide white-earth visual direction while keeping placeholder call architecture.
  - Validation:
    - `npx tsc --noEmit` passes after the full UI upgrade pass.

- **[Codex AGENT] - March 11, 2026 (Smart Matching + White Onboarding + Care Rhythm UX Sprint)**
  - Added new therapist matching service:
    - New `src/core/services/matchingService.ts` with `matchTherapistsForClient(userId, options)`.
    - Implements weighted hybrid matching with transparent breakdown:
      - intent overlap (35%), care-style fit (25%), language fit (15%), near-term availability in 72h (15%), quality signal (10%).
    - Added curated roster behavior (default cap: 16, constrained to 12–20 where available) and fallback browse output.
    - Generates therapist rationale chips (`Works with...`, `Matches your care style`, `Available...`, language fit).
  - Extended frontend contracts in `src/core/models/types.ts`:
    - Added `MatchedTherapist`, `MatchScoreBreakdown`, `MatchReasonChip`.
    - Added onboarding contracts: `OnboardingStepConfig`, `OnboardingQuestion`, `OnboardingResponseDraft`.
    - Added rhythm contracts: `CareRhythmState`, `CareRhythmMarker`, and wired `CareJourneyState.rhythm`.
  - Upgraded Care Rhythm computation in `src/core/hooks/useCareJourney.ts`:
    - Now computes `currentStreak`, `highestStreak`, weekly markers, and `repairsAvailable`.
    - Keeps daily goals (`Check-in`, `Reflect`, `Connect`) and next-action behavior intact.
  - Rebuilt client Home matching + rhythm UX in `src/features/home/HomeScreen.tsx`:
    - Replaced generic therapist list fetch with `matchTherapistsForClient`.
    - Added `Top therapist matches` section + `Browse curated therapists`.
    - Added explicit match rationale chips and match score on therapist cards.
    - Added visible Care Rhythm layer with flame count, weekly markers, best streak, and repair cue.
    - Preserved existing loading/empty/error/retry patterns and upcoming session entry points.
  - Redesigned onboarding in `src/features/onboarding/OnboardingScreen.tsx`:
    - Moved to simplified 5-step structure with shared core + role-specific tail:
      - Shared: welcome, focus/intent, quick preferences.
      - Client: baseline check-in, Care Buddy/reminders + consent.
      - Therapist: practice setup, availability/compliance.
    - Added minimal top nav with progress dots and squircle controls.
    - Kept first screen full, leaf icon branding, and friendly `Care Space` heading.
    - Preserved resume-from-progress behavior via AsyncStorage.
    - Maintained Supabase persistence for profile/preferences/therapist setup and optional baseline metric write.
  - Added therapist-side parity context in `src/features/therapist-dashboard/TherapistDashboardScreen.tsx`:
    - Added compact “why now” chips (recent mood, sleep, rhythm) per client.
    - Added risk-aware suggested opening prompt per client card.
    - Kept risk-first sorting, pending confirmation, and nudge/session actions intact.
  - Updated therapist profile experience in `src/features/therapist/TherapistProfileScreen.tsx`:
    - Supports incoming match rationale chips and renders them in profile context.
  - Updated profile reliability/usability in `src/features/profile/ProfileScreen.tsx`:
    - Added client-side Care Rhythm card (flame + weekly markers + best streak).
    - Increased scroll padding so bottom actions (including sign-out) remain reachable across device sizes.

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
