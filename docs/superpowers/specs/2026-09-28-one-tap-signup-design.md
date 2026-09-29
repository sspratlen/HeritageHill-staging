# One-Tap Group Join & Event RSVP — Design

## Motivation

Scott: "if I'm logged in then signing up for a group or RSVPing for an event should be almost automatic." Today the Join Group modal (`small-groups.html`) and the RSVP forms (`events.html`, and the homepage copy in `index.html`) never check who's logged in. They open blank and ask for your name, email and phone every time, and nothing tells you that you've already signed up.

## Decisions (2026-09-28)

1. **One-tap confirm.** When the visitor is logged in, tapping Join or RSVP shows a short confirm instead of the full form:
   - Groups: "Joining as **Name** / email", an optional message to the leader, and **Send request**.
   - Events: "RSVP as **Name** / email", and **I'm going**.
   - "Not you? Edit details" opens the full form, pre-filled.
2. **Show status.**
   - Group cards show "Requested ✓", or "You're in ✓" when you're already an active member. The button is disabled.
   - Event cards and the event modal show "You're going ✓", so nobody signs up twice.
3. **Logged-out visitors** see exactly the form they see today.
4. **Out of scope:**
   - Growth Track, which already pre-fills and has a session picker.
   - Cancelling a request or RSVP.
   - Tightening the broad `signups` / `event_rsvps` / `growth_track_registrations` RLS policies. That's a separate task, running in its own session.

## Data

- **New RPC `public.my_signup_status()`** (`supabase/my-signup-status-schema.sql`).
  - It's `security definer`, so it works regardless of the table policies.
  - It can be run only by the `authenticated` role; anon has no access.
  - It returns `{group_ids, member_group_ids, event_ids}` for `auth.uid()` only:
    - `signups` and `event_rsvps` are matched on `person_id`, using the caller's `people.user_id` row or `member_profiles.person_id`. This means sign-ups made while logged out with the same email also count.
    - Active `group_memberships` are matched on `user_id`.
  - The change is additive.
  - Applied to staging and verified on 2026-09-28: correct ids for a real user, and no execute grant for anon.
- **`SupaDB.getMySignupStatus()`** wraps the RPC and returns `null` on any error. Callers treat `null` as "nothing yet", so pages degrade to plain buttons if the RPC is missing.
- **Submissions still go through the existing `SupaDB.submitSignup` / `submitEventRsvp`.** The leader confirmation email, `people` upsert, semester stamping and admin lists are unchanged. The one-tap path just fills name, email and phone from the profile.

## Components

- **`js/quick-signup.js`** exposes a global `QuickSignup`. Its pure pieces are unit-tested in `tests/quick-signup.test.js`:
  - `buildCtx(user, profile, status)` returns `{who, groupIds, memberGroupIds, eventIds}`, or `null` when there's no user or no usable name/email. It prefers the `member_profiles` name/email/phone, then falls back to auth metadata.
  - `groupState(ctx, id)` returns `anon | member | requested | ready`.
  - `eventState(ctx, id)` returns `anon | going | ready`.
  - `markGroup` / `markEvent` update the state right after a successful submit.
  - `confirmHtml(...)` builds the confirm markup.
  - `load()` does one cached `getUser` + `getMyProfile` + `getMySignupStatus` per page.
  - `render(el, opts)` draws the confirm and wires its buttons.
  - It injects its own small stylesheet, including a `.qs-done` button style.
- **Pages:**
  - Each page renders as before, then calls `QuickSignup.load()` and re-renders its cards once the visitor is known.
  - Form and confirm share one submit function per page: `sendJoinRequest`, `sendRsvp`, `sendHomeRsvp`.
  - On `events.html`, a deep-linked event modal that opened before `load()` resolved is re-rendered.

## Rollout

The migration goes live on an environment before the code that depends on it (CLAUDE.md rule). Even so, the pages would degrade safely without it.

1. Staging: SQL applied and verified. Push the code, then Scott checks, logged in and logged out:
   - The one-tap confirm.
   - Status badges.
   - The leader email still arriving.
   - The admin signups/RSVP lists showing the new rows.
2. Production: apply `supabase/my-signup-status-schema.sql` to `ktyplbmawlaerzohkdqy`, verify, then push the code. Both steps only with Scott's explicit approval.
