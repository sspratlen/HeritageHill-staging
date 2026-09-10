# People Backbone — Phase 3 Design Spec (Journey Milestones)

## Purpose

This is the piece the original evaluation was actually about: tracking a person's progress through Heritage Hill's stages (Growth Track, small groups, assessments) as real data, not something reconstructed by mentally cross-referencing five tables. Phases 1-2 built the identity backbone (`people`, `person_id`) and kept it current. Phase 3 adds `person_milestones` — one row per (person, milestone) reached — and wires it at the 5 existing write paths that already signal a real milestone, using `person_id` values phases 1-2 made available.

**Still staging only**, same deploy discipline as phases 1-2: commits in this plan go to `staging` only, never `origin`, until schema promotion is explicitly decided.

## Investigation: what's actually trackable today

Read every candidate write path before scoping, to avoid inventing milestones with no real trigger:

| Milestone | Trigger (existing code) | `person_id` available how |
|---|---|---|
| `growth_track_registered` | `SupaDB.submitGrowthTrackRegistration` (`js/db.js:321`) | Already resolved by phase 2's `upsertPerson` call in this method |
| `growth_track_attended` | `SupaDB.adminSetGtAttended` (`js/db.js:554`), called from `toggleGtAttended` (`admin/dashboard.html:6032`) | Not currently selected back — Task 2 adds `.select('person_id').single()` to the existing update |
| `assessment_disc_completed` / `assessment_gifts_completed` | `SupaDB.addAssessmentAttempt` (`js/db.js:1377`) — `assessmentType` is literally `'disc'` or `'gifts'` (confirmed via `admin/test-gifts.html:104`, `admin/test-personality.html:104`, `admin/my-profile.html:156-157`) | `assessment_attempts` has no `person_id` column (out of phase 1's 9-table scope) — resolved via a `people` lookup by `user_id` (RLS already permits `select` where `user_id = auth.uid()`, per `supabase/people-backbone-schema.sql:33-34`) |
| `small_group_member` | `SupaDB.adminAddGroupMember` (`js/db.js:632`) | Already resolved by phase 2's `upsertPerson` call in this method |
| `small_group_leader` | `approveApplication` (`admin/dashboard.html:2849`) — has `a.name`/`a.email`/`a.phone` from `_cachedApplications` in scope | Resolved via `SupaDB.upsertPerson` (already a public method on the page from phase 2), same pattern as every phase-2 site |

**Impact Teams and Trainings have no milestones in this phase** — confirmed (again, as in phase 1) that no table for either exists anywhere in this schema. Nothing to wire. `person_milestones.milestone` is a free-text column specifically so these can be added later without a schema change, once those subsystems exist.

## Confirmed Decisions

- **One row per (person, milestone), ever.** A unique index on `(person_id, milestone)` plus `on conflict do nothing` in the write function means re-triggering an already-reached milestone (re-registering, toggling attended on/off/on) is a safe no-op, not a growing log. This phase tracks "has this person ever reached X," not a timeline of every occurrence — matches the existing codebase's `outbound_email_recipients.status` precedent (single current-state field, not an event log, per that feature's own design spec).
- **`on delete cascade` (not `set null`, unlike phases 1-2's other FKs).** A milestone genuinely has no meaning without its person — if a `people` row is ever deleted, its milestones should go with it, unlike a `signups`/`applications` row (which stays as a historical record even if its person link is severed).
- **Writes go through a `record_milestone()` SECURITY DEFINER function**, called by RPC — same pattern as `upsert_person` from phase 1, for the same reason: avoids needing broad, per-caller-context RLS `insert` policies on a table written from public forms, authenticated member sessions, and admin actions alike.
- **Milestone recording is fire-and-forget, never awaited for its result** (unlike `upsertPerson`, whose return value the caller needs inline for the same insert). Nothing downstream depends on a milestone write succeeding immediately, so every call site fires it without blocking the user-facing action, matching this codebase's existing fire-and-forget conventions (confirmation emails, Mailchimp sync).
- **`assessment_attempts` itself is not touched.** No `person_id` column added to it in this phase — the milestone lookup resolves `person_id` via `people.user_id` at write time instead. Revisit only if a real need for a direct FK shows up later (YAGNI).

## Data Model

```sql
create table public.person_milestones (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people(id) on delete cascade,
  milestone   text not null,
  achieved_at timestamptz not null default now()
);

create unique index person_milestones_person_milestone_key
  on public.person_milestones (person_id, milestone);

alter table public.person_milestones enable row level security;

create policy "Admins manage all milestones" on public.person_milestones
  for all using (public.is_admin()) with check (public.is_admin());

create policy "A person can view their own milestones" on public.person_milestones
  for select using (person_id in (select id from public.people where user_id = auth.uid()));

create or replace function public.record_milestone(p_person_id uuid, p_milestone text)
returns void
language sql security definer set search_path = public as $$
  insert into public.person_milestones (person_id, milestone)
  values (p_person_id, p_milestone)
  on conflict (person_id, milestone) do nothing;
$$;
```

## Implementation

### New wrapper (`js/db.js`)

```js
async recordMilestone(personId, milestone) {
  if (!db() || !personId || !milestone) return;
  try {
    const { error } = await db().rpc('record_milestone', { p_person_id: personId, p_milestone: milestone });
    if (error) throw error;
  } catch(e) { console.warn('[SupaDB] recordMilestone failed (non-critical):', e.message); }
},
```

### The 5 call sites

1. `submitGrowthTrackRegistration` — after the existing `personId` resolution (phase 2), fire `this.recordMilestone(personId, 'growth_track_registered')` (not awaited — the method's own return doesn't need it).
2. `adminSetGtAttended` — add `.select('person_id').single()` to the existing update; when `attended` is true and a `person_id` came back, fire `this.recordMilestone(data.person_id, 'growth_track_attended')`.
3. `addAssessmentAttempt` — after the existing insert succeeds, look up `people.id` by `user_id` (RLS-permitted self-read), then fire `this.recordMilestone(person.id, assessmentType === 'disc' ? 'assessment_disc_completed' : 'assessment_gifts_completed')`.
4. `adminAddGroupMember` — after the existing `personId` resolution (phase 2), fire `this.recordMilestone(personId, 'small_group_member')`.
5. `approveApplication` (`admin/dashboard.html`) — after the existing `Promise.all([...])` succeeds, resolve `personId` via `SupaDB.upsertPerson({name: a.name, email: a.email, phone: a.phone})` (same call shape phase 2 already uses at every admin-side site), then fire `SupaDB.recordMilestone(personId, 'small_group_leader')`.

## Verification

Same approach as phase 2: prove the wiring, not `record_milestone`'s own correctness (trivial SQL, covered by the unique-index/on-conflict behavior itself). Toggle one real Growth Track registrant's "attended" checkbox on the live staging site, then confirm via SQL that exactly one `person_milestones` row exists for `(their person_id, 'growth_track_attended')` — and toggle it off and back on to confirm the unique index prevents a duplicate row.

## Out of Scope (unchanged philosophy from phases 1-2)

- No UI surfaces this data yet (no "member timeline" view, no funnel report) — this phase is the data layer only.
- No milestones for Impact Teams / Trainings (no underlying tables exist).
- No `user_roles` permission-check migration to `person_id` (still deferred, unrelated to this phase anyway).
- No production migration or production code push.
