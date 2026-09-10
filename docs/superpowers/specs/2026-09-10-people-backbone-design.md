# People Backbone Design Spec

## Purpose

A person's identity is currently typed independently in eight places (`member_profiles`, `group_memberships`, `growth_track_registrations`, `signups`, `applications`, `retreat_registrations`, `event_rsvps`, `subscribers`), only loosely connected by matching on email at read time. This causes real data drift — several past commits have been dedicated to fixing "leader email mismatch" style bugs, and a live investigation for this spec turned up a concrete instance: every row in `member_profiles.email` (27/27) is blank, because bulk-admin-created profile rows never populate it; the real email only exists on the linked `auth.users` row. Nothing catches this today because nothing enforces one email per person.

This phase introduces a single `people` table every subsystem can reference by foreign key, and backfills it from existing data. It is **schema and data only** — no application code (`js/db.js`, `admin/dashboard.html`, public pages) changes in this phase, and everything in this phase applies to the **staging Supabase project only** (`govvofbrhhpowtdnuzcw`). Production (`ktyplbmawlaerzohkdqy`) is untouched.

## Confirmed Decisions (from brainstorming)

- **Staging only.** All migrations in this phase run against project `govvofbrhhpowtdnuzcw` via the Supabase MCP. Production is not touched, and no site code is changed, so there is nothing to deploy and nothing that can break production as a result of this phase.
- **Additive only.** New table, new nullable FK columns. No existing column is dropped, renamed, or made non-nullable. Existing app code (which doesn't know `people` exists yet) keeps working unmodified against the old columns.
- **`people.email` is the join key**, matched case-insensitively (`lower(email)`), enforced with a unique index — this is the mechanism that will catch future drift (a second row can't silently claim the same email).
- **`member_profiles.email` is not trusted as a source for backfill.** Confirmed blank on 100% of current rows. For rows with a `user_id`, the real email comes from `auth.users.email` instead. This is a known existing bug in the member-provisioning code path (out of scope to fix here — flagged for a follow-up, see Out of Scope) but the backfill must route around it rather than importing 27 blank emails.
- **Backfill priority order** when the same email first appears in multiple tables (decides whose `name`/`phone` seeds the new `people` row): `auth.users`+`member_profiles` (real accounts) → `group_memberships` → `applications` → `growth_track_registrations` → `signups` → `retreat_registrations` → `subscribers`. Rationale: prefer the most-verified, most-committed relationship's data first.
- **Public-form writes go through a `SECURITY DEFINER` function (`public.upsert_person`), not direct table grants.** `people` will hold canonical identity for every person Heritage Hill has ever touched, including non-members — granting raw anon `INSERT`/`UPDATE` on it would let anyone overwrite another person's name/phone by just knowing their email. A function that only ever inserts-if-new or fills-in-blanks (never overwrites an existing non-blank value) closes that off. **This function is created in this phase (pure schema), but nothing calls it yet** — wiring it into the public forms is phase 2 application-code work, deliberately excluded here.
- **`user_roles` keeps its email-keyed lookup logic for now.** This phase adds `user_roles.person_id` (nullable FK, backfilled) so it's ready, but switching the actual permission-check queries from email-match to `person_id`-match is an app-code change — phase 2, not this phase.

## Data Model

```sql
create table public.people (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users(id) on delete set null,
  name       text not null default '',
  email      text not null,
  phone      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index people_email_lower_key on public.people (lower(email));

create or replace function public.people_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger people_touch_updated_at
  before update on public.people
  for each row execute function public.people_set_updated_at();

alter table public.people enable row level security;
```

### RLS

Reuses the existing `public.is_admin()` / `public.jwt_email()` helpers (same pattern as every other admin-gated table in this schema):

```sql
create policy "Admins manage all people" on public.people
  for all using (public.is_admin()) with check (public.is_admin());

create policy "A person can view their own row" on public.people
  for select using (user_id = auth.uid());

create policy "A person can update their own contact info" on public.people
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
```

No `insert` policy for non-admins — new-person creation only happens through `upsert_person()` (`SECURITY DEFINER`, bypasses RLS internally) or by an admin.

### `upsert_person` (created, not yet called by any app code)

```sql
create or replace function public.upsert_person(
  p_name  text,
  p_email text,
  p_phone text default ''
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from public.people where lower(email) = lower(p_email);
  if v_id is null then
    insert into public.people (name, email, phone)
    values (coalesce(nullif(trim(p_name), ''), p_email), lower(trim(p_email)), coalesce(p_phone, ''))
    returning id into v_id;
  else
    -- fill in blanks only; never overwrite an existing non-blank value
    update public.people set
      name  = case when name  = '' then coalesce(nullif(trim(p_name), ''), name)   else name end,
      phone = case when phone = '' then coalesce(p_phone, phone)                    else phone end
    where id = v_id;
  end if;
  return v_id;
end $$;
```

### FK additions (all nullable, all `on delete set null` so removing a person record never cascades into deleting history)

```sql
alter table public.member_profiles              add column person_id uuid references public.people(id) on delete set null;
alter table public.group_memberships             add column person_id uuid references public.people(id) on delete set null;
alter table public.growth_track_registrations    add column person_id uuid references public.people(id) on delete set null;
alter table public.signups                       add column person_id uuid references public.people(id) on delete set null;
alter table public.applications                  add column person_id uuid references public.people(id) on delete set null;
alter table public.retreat_registrations         add column person_id uuid references public.people(id) on delete set null;
alter table public.event_rsvps                   add column person_id uuid references public.people(id) on delete set null;
alter table public.subscribers                   add column person_id uuid references public.people(id) on delete set null;
alter table public.user_roles                    add column person_id uuid references public.people(id) on delete set null;
```

## Backfill Algorithm

1. Seed `people` from real accounts: one row per `member_profiles` joined to `auth.users`, using the auth email (not the blank profile email).
2. In priority order (`group_memberships` → `applications` → `growth_track_registrations` → `signups` → `retreat_registrations` → `subscribers`), insert one `people` row per email not already present, `on conflict (lower(email)) do nothing` (the unique index makes this safe and idempotent).
3. Update `person_id` on every row of every table by joining on `lower(email) = lower(people.email)`.
4. `event_rsvps` currently has 0 rows on staging — its backfill UPDATE is a no-op, included for completeness/future rows.

## Verification

After backfill, for every source table: `count(*) filter (where person_id is null)` must be `0` (every row with a non-blank email found a match) — except `member_profiles`, which is verified via its `auth.users` join instead of its own `email` column, and `event_rsvps` (0 rows, nothing to verify). Exact queries are in the implementation plan, one per task.

## Out of Scope (YAGNI / explicitly deferred)

- No changes to `js/db.js`, `admin/dashboard.html`, or any public page. Nothing calls `upsert_person()` yet.
- No production migration. This phase is staging-only; promoting the schema to production is a future decision made after the design is validated against real staging usage.
- Not fixing the `member_profiles.email`-blank bug at its source (the provisioning code path) — noted for a follow-up, not bundled into this schema-only phase.
- Not switching `user_roles` permission checks to `person_id` — column added and backfilled, but the lookup logic stays email-based until phase 2.
- No `person_milestones` / journey-stage table yet — that was the second idea from the broader evaluation; this phase is scoped to the identity backbone only, per "each plan should produce working, testable software on its own."
- No Impact Teams / Trainings tables — still unconfirmed what currently exists for those; out of scope until that's clarified.
