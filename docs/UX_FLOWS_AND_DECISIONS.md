# UX Flows And Decisions (Care Space)

This doc is a working design/UX audit meant to keep the app coherent as we iterate.

For each surface, we define:
- **User intent**: what job they came here to do.
- **Decision**: what choice the UI asks them to make.
- **Primary action**: the one action we want to make obvious.
- **Required context**: the minimum information needed to decide confidently.
- **Notes**: what to tighten to reduce cognitive load and mis-taps.

## Welcome (Auth)
- User intent: get into the app quickly and safely.
- Decision: sign in vs create account; for sign-up, role intent (client vs therapist).
- Primary action: `Sign in` (existing users) or `Create account` (new users).
- Required context: what happens next (email verification; therapist review).
- Notes:
  - Keep the role choice lightweight and clearly reversible.
  - Avoid making the user read a wall of copy to understand next steps.

## Onboarding
- User intent: configure the minimum profile/preferences so the app can guide them.
- Decision: pick intent/focus, care style, session preferences, reminders.
- Primary action: `Continue` through steps.
- Required context: step progress + what’s optional vs required.
- Notes:
  - Make required steps visually distinct from optional steps.
  - Keep choice sets small and show limits ("Pick up to 2") near the controls.

## Home (Client)
- User intent: know what to do next and why it matters today.
- Decision: choose the next best action (check-in, journal, connect) or handle upcoming session.
- Primary action: `Continue` (next best action).
- Required context: "why this action" (short reason), streak/progress, and what’s already done today.
- Notes:
  - The home screen should never feel like a dashboard of equal-priority tiles.
  - Reduce the number of competing CTAs; make secondary actions visually quieter.

## Match
- User intent: find 1-3 high-confidence therapist options quickly.
- Decision: pick intent/goals/preferences to rank matches; optionally refine.
- Primary action: `See matches` (or equivalent) once enough signals are set.
- Required context: what each preference changes, and how many matches it affects.
- Notes:
  - Avoid fatigue: show fewer controls per step, and show progress.
  - Make the "lock/request" action feel safe and reversible.

## Therapist Profile + Booking
- User intent: decide if this therapist is a fit and book a time.
- Decision: book now vs keep browsing; choose slot.
- Primary action: `Book` / `Confirm`.
- Required context: why they were matched, next availability, session modality, price/budget (if present).
- Notes:
  - Keep the booking CTA stable and always visible when appropriate.

## Sessions
- User intent: prepare for session; join on time; reflect afterwards.
- Decision: what to do before session; join vs reschedule.
- Primary action: `Join` (at session time) or `Session prep` (before).
- Required context: time, modality, therapist, and checklist status.

## Messages
- User intent: continue the conversation with the least friction.
- Decision: which thread to open, and whether anything needs attention.
- Primary action: open the relevant chat; send the next message.
- Required context: unread state, urgency/risk cues (only when needed).

## Profile
- User intent: manage identity and settings.
- Decision: manage locked therapist, notifications, onboarding restart, therapist mode toggle.
- Primary action: varies by section; avoid multiple destructive actions adjacent.
- Required context: what a setting changes and whether it’s reversible.

