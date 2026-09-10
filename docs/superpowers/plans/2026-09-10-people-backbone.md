# People Backbone (Staging Only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a canonical `people` table to the **staging** Supabase project (`govvofbrhhpowtdnuzcw`) only, backfill it from existing data across 7 source tables, and link every source table to it via a new `person_id` column — with zero changes to application code and zero changes to production.

**Architecture:** Pure additive SQL migration (new table + nullable FK columns), applied via the Supabase MCP directly against the staging project. Every step is verified with a SQL assertion query run the same way (this codebase has no JS/pytest test suite — SQL verification queries are this project's existing testing convention for schema work). See `docs/superpowers/specs/2026-09-10-people-backbone-design.md` for full rationale.

**Tech Stack:** Postgres 17 (Supabase), applied via `mcp__<supabase>__apply_migration` / `execute_sql` tools against `project_id: govvofbrhhpowtdnuzcw`. No JS/HTML touched.

---

### Task 1: Create the tracked schema file

**Files:**
- Create: `supabase/people-backbone-schema.sql`

- [ ] **Step 1: Write the file**

```sql
-- People backbone: canonical identity table + link columns.
-- Staging-only for now (project govvofbrhhpowtdnuzcw) — see
-- docs/superpowers/specs/2026-09-10-people-backbone-design.md

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

create policy "Admins manage all people" on public.people
  for all using (public.is_admin()) with check (public.is_admin());

create policy "A person can view their own row" on public.people
  for select using (user_id = auth.uid());

create policy "A person can update their own contact info" on public.people
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

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
    update public.people set
      name  = case when name  = '' then coalesce(nullif(trim(p_name), ''), name)   else name end,
      phone = case when phone = '' then coalesce(p_phone, phone)                    else phone end
    where id = v_id;
  end if;
  return v_id;
end $$;

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

- [ ] **Step 2: Commit**

```bash
git add supabase/people-backbone-schema.sql
git commit -m "Add people backbone schema (staging-only, not yet applied to production)"
```

---

### Task 2: Apply the schema migration to staging

**Files:** none (uses the content from Task 1 via the Supabase MCP)

- [ ] **Step 1: Apply via MCP**

Call `apply_migration` with `project_id: govvofbrhhpowtdnuzcw`, `name: people_backbone_schema`, using the exact SQL from Task 1 Step 1 as `query`.

- [ ] **Step 2: Verify the table and columns exist**

Run via MCP `execute_sql` on `project_id: govvofbrhhpowtdnuzcw`:

```sql
select table_name, column_name from information_schema.columns
where table_schema = 'public' and column_name = 'person_id'
order by table_name;
```

Expected: 9 rows — `applications, event_rsvps, group_memberships, growth_track_registrations, member_profiles, retreat_registrations, signups, subscribers, user_roles`, each with `column_name = 'person_id'`.

```sql
select count(*) from public.people;
```

Expected: `0` (table exists, empty).

---

### Task 3: Seed `people` from real accounts (`member_profiles` + `auth.users`)

**Files:** none (data migration, run directly via MCP — see Task 6 for the tracked copy)

- [ ] **Step 1: Run the seed insert**

Run via MCP `execute_sql` on `project_id: govvofbrhhpowtdnuzcw`:

```sql
insert into public.people (user_id, name, email, phone)
select mp.user_id, mp.name, lower(au.email), mp.phone
from public.member_profiles mp
join auth.users au on au.id = mp.user_id
where au.email is not null and au.email <> ''
on conflict (lower(email)) do nothing;
```

- [ ] **Step 2: Verify**

```sql
select count(*) from public.people;
```

Expected: `27` (one per `member_profiles` row on staging — confirmed 27 rows, 27 distinct `auth.users.email` values during design).

---

### Task 4: Seed `people` from the remaining 6 sources, in priority order

**Files:** none (data migration, run directly via MCP — see Task 6 for the tracked copy)

- [ ] **Step 1: Run the seed inserts, in this exact order**

Run via MCP `execute_sql` on `project_id: govvofbrhhpowtdnuzcw`, as one call (six statements):

```sql
insert into public.people (name, email, phone)
select distinct on (lower(email)) name, lower(email), phone
from public.group_memberships where email <> ''
order by lower(email), joined_at asc
on conflict (lower(email)) do nothing;

insert into public.people (name, email, phone)
select distinct on (lower(email)) name, lower(email), coalesce(phone, '')
from public.applications where email <> ''
order by lower(email), submitted_date asc
on conflict (lower(email)) do nothing;

insert into public.people (name, email, phone)
select distinct on (lower(email)) name, lower(email), phone
from public.growth_track_registrations where email <> ''
order by lower(email), created_at asc
on conflict (lower(email)) do nothing;

insert into public.people (name, email, phone)
select distinct on (lower(email)) name, lower(email), coalesce(phone, '')
from public.signups where email <> ''
order by lower(email), created_at asc
on conflict (lower(email)) do nothing;

insert into public.people (name, email, phone)
select distinct on (lower(email)) full_name, lower(email), coalesce(phone, '')
from public.retreat_registrations where email <> ''
order by lower(email), created_at asc
on conflict (lower(email)) do nothing;

insert into public.people (name, email, phone)
select distinct on (lower(email)) coalesce(nullif(trim(first_name || ' ' || last_name), ''), email), lower(email), ''
from public.subscribers where email <> ''
order by lower(email), created_at asc
on conflict (lower(email)) do nothing;
```

- [ ] **Step 2: Verify**

```sql
select count(*) from public.people;
```

Expected: some number `>= 27` (27 from Task 3, plus any newly-seen emails from these 6 tables — exact count depends on overlap, but must not be less than 27 and must not error).

```sql
select count(*) from (select lower(email) from public.people group by lower(email) having count(*) > 1) dupes;
```

Expected: `0` (the unique index guarantees this, but confirms no silent constraint issue).

---

### Task 5: Backfill `person_id` on every source table

**Files:** none (data migration, run directly via MCP — see Task 6 for the tracked copy)

- [ ] **Step 1: Run the updates**

Run via MCP `execute_sql` on `project_id: govvofbrhhpowtdnuzcw`, as one call:

```sql
update public.member_profiles mp
set person_id = p.id
from auth.users au, public.people p
where au.id = mp.user_id and lower(au.email) = lower(p.email) and mp.person_id is null;

update public.group_memberships t
set person_id = p.id
from public.people p
where lower(t.email) = lower(p.email) and t.person_id is null;

update public.growth_track_registrations t
set person_id = p.id
from public.people p
where lower(t.email) = lower(p.email) and t.person_id is null;

update public.signups t
set person_id = p.id
from public.people p
where lower(t.email) = lower(p.email) and t.person_id is null;

update public.applications t
set person_id = p.id
from public.people p
where lower(t.email) = lower(p.email) and t.person_id is null;

update public.retreat_registrations t
set person_id = p.id
from public.people p
where lower(t.email) = lower(p.email) and t.person_id is null;

update public.subscribers t
set person_id = p.id
from public.people p
where lower(t.email) = lower(p.email) and t.person_id is null;

update public.user_roles t
set person_id = p.id
from public.people p
where lower(t.email) = lower(p.email) and t.person_id is null;
```

- [ ] **Step 2: Verify every table has zero unmatched rows**

Run via MCP `execute_sql` on `project_id: govvofbrhhpowtdnuzcw`:

```sql
select 'member_profiles' t, count(*) unmatched from public.member_profiles where person_id is null
union all select 'group_memberships', count(*) from public.group_memberships where person_id is null and email <> ''
union all select 'growth_track_registrations', count(*) from public.growth_track_registrations where person_id is null and email <> ''
union all select 'signups', count(*) from public.signups where person_id is null and email <> ''
union all select 'applications', count(*) from public.applications where person_id is null and email <> ''
union all select 'retreat_registrations', count(*) from public.retreat_registrations where person_id is null and email <> ''
union all select 'subscribers', count(*) from public.subscribers where person_id is null and email <> ''
union all select 'user_roles', count(*) from public.user_roles where person_id is null;
```

Expected: every row's `unmatched` value is `0`.

---

### Task 6: Commit the backfill SQL for the record

**Files:**
- Create: `supabase/people-backbone-backfill.sql`

- [ ] **Step 1: Write the file**

Combine the exact SQL from Task 3 Step 1, Task 4 Step 1, and Task 5 Step 1 into this one file, in that order, with a header comment:

```sql
-- People backbone backfill — staging only (govvofbrhhpowtdnuzcw).
-- Already run by hand via the Supabase MCP on 2026-09-10; this file is the
-- tracked record of exactly what ran, and the script to use if/when this
-- schema is promoted to production. Idempotent (safe to re-run) via
-- `on conflict (lower(email)) do nothing` and `... is null` guards on the
-- person_id updates.

-- (paste Task 3 Step 1 seed here)

-- (paste Task 4 Step 1 seeds here)

-- (paste Task 5 Step 1 updates here)
```

- [ ] **Step 2: Commit**

```bash
git add supabase/people-backbone-backfill.sql
git commit -m "Add people backbone backfill script (already applied to staging)"
```

---

### Task 7: Spot-check the result end to end

**Files:** none

- [ ] **Step 1: Pick one real person and confirm their whole picture joins correctly**

Run via MCP `execute_sql` on `project_id: govvofbrhhpowtdnuzcw` (adjust the email to any real staging member — e.g. one from the `member_profiles` sample seen during design):

```sql
select
  p.id, p.name, p.email, p.phone,
  (select count(*) from public.group_memberships gm where gm.person_id = p.id) as group_memberships,
  (select count(*) from public.growth_track_registrations gtr where gtr.person_id = p.id) as growth_track_regs,
  (select count(*) from public.signups s where s.person_id = p.id) as signups,
  (select count(*) from public.assessment_attempts aa where aa.user_id = p.user_id) as assessment_attempts
from public.people p
where lower(p.email) = lower('davidlbedell@gmail.com');
```

Expected: one row, with `group_memberships >= 1` (this email had a `member_profiles` row with `group_id = 33` during design inspection) and no error.

- [ ] **Step 2: Confirm production is untouched**

Run via MCP `execute_sql` on `project_id: ktyplbmawlaerzohkdqy` (production):

```sql
select count(*) from information_schema.columns
where table_schema = 'public' and column_name = 'person_id';
```

Expected: `0` — production has no `person_id` columns and no `people` table, confirming this entire phase stayed on staging.

---

## Self-Review Notes

- **Spec coverage:** every "Data Model" and "Backfill Algorithm" item from the design spec has a corresponding task (Tasks 1–2 = schema, Tasks 3–5 = backfill, Task 6 = tracked record, Task 7 = verification). `upsert_person` is created in Task 1 per the spec's explicit "created, not yet called" decision — no task wires it up, matching Out of Scope.
- **No placeholders:** every step has literal SQL, not descriptions of SQL.
- **Type/name consistency:** `person_id uuid` used identically across every `alter table` in Task 1 and every `update ... set person_id` in Task 5; `people.email` always compared via `lower()` everywhere it's joined, matching the unique index definition.
