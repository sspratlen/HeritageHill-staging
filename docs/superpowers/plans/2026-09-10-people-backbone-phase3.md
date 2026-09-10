# People Backbone Phase 3 (Staging Only) Implementation Plan — Journey Milestones

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `person_milestones` table (staging only) and wire it at the 5 existing write paths that already signal a real journey milestone (Growth Track registration/attendance, DISC/Gifts assessment completion, small group membership/leadership), so a person's progress becomes queryable data instead of something reconstructed by hand.

**Architecture:** One new table + one `record_milestone()` SECURITY DEFINER RPC (mirrors phase 1's `upsert_person`), one new `SupaDB.recordMilestone()` wrapper, called fire-and-forget from 5 existing methods across `js/db.js` and `admin/dashboard.html`. See `docs/superpowers/specs/2026-09-10-people-backbone-phase3-design.md` for full rationale and the investigation behind each trigger point.

**Tech Stack:** Same as phases 1-2 — Postgres 17 on Supabase (staging project `govvofbrhhpowtdnuzcw`), plain JS in `js/db.js`/`admin/dashboard.html`.

**CRITICAL DEPLOY CONSTRAINT:** Every commit in this plan must be pushed to the `staging` git remote ONLY, never `origin` (production) — same constraint as phases 1-2, for the same reason (production's database has none of this schema).

---

### Task 1: Create the `person_milestones` schema and apply it to staging

**Files:**
- Create: `supabase/person-milestones-schema.sql`

- [ ] **Step 1: Write the file**

```sql
-- Person milestones: one row per (person, milestone) ever reached.
-- Staging-only for now (project govvofbrhhpowtdnuzcw) — see
-- docs/superpowers/specs/2026-09-10-people-backbone-phase3-design.md

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

- [ ] **Step 2: Commit**

```bash
git add supabase/person-milestones-schema.sql
git commit -m "Add person_milestones schema (staging-only, not yet applied to production)"
```

- [ ] **Step 3: Apply to staging via Supabase MCP**

Call `apply_migration` with `project_id: govvofbrhhpowtdnuzcw`, `name: person_milestones_schema`, using the exact file content above.

- [ ] **Step 4: Verify**

```sql
select count(*) from public.person_milestones;
```
Expected: `0`.

```sql
select routine_name from information_schema.routines where routine_name = 'record_milestone';
```
Expected: one row.

---

### Task 2: Add the `recordMilestone` wrapper to `js/db.js`

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: Insert immediately after the `upsertPerson` method**

Find (the `upsertPerson` method added in phase 2, immediately before the Sermons section):

```js
  async upsertPerson({ name, email, phone }) {
    if (!db() || !email) return null;
    try {
      const { data, error } = await db().rpc('upsert_person', {
        p_name: name || '', p_email: email, p_phone: phone || '',
      });
      if (error) throw error;
      return data;
    } catch(e) { console.warn('[SupaDB] upsertPerson failed (non-critical):', e.message); return null; }
  },

  /* ── PUBLIC: Sermons ────────────────────────────────────── */
```

Replace with:

```js
  async upsertPerson({ name, email, phone }) {
    if (!db() || !email) return null;
    try {
      const { data, error } = await db().rpc('upsert_person', {
        p_name: name || '', p_email: email, p_phone: phone || '',
      });
      if (error) throw error;
      return data;
    } catch(e) { console.warn('[SupaDB] upsertPerson failed (non-critical):', e.message); return null; }
  },

  /* ── People backbone: fire-and-forget journey milestone record.
     Never awaited by callers for its result — nothing depends on it
     succeeding immediately. Safe to call repeatedly for the same
     (person, milestone) pair; the DB side no-ops on conflict. */
  async recordMilestone(personId, milestone) {
    if (!db() || !personId || !milestone) return;
    try {
      const { error } = await db().rpc('record_milestone', { p_person_id: personId, p_milestone: milestone });
      if (error) throw error;
    } catch(e) { console.warn('[SupaDB] recordMilestone failed (non-critical):', e.message); }
  },

  /* ── PUBLIC: Sermons ────────────────────────────────────── */
```

- [ ] **Step 2: Verify syntax**

Run: `node --check js/db.js` — expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add js/db.js
git commit -m "Add SupaDB.recordMilestone wrapper for the person_milestones RPC (staging only)"
```

---

### Task 3: Wire `submitGrowthTrackRegistration` and `adminAddGroupMember`

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: `submitGrowthTrackRegistration`**

Find:

```js
  async submitGrowthTrackRegistration(reg) {
    if (!db()) return { error: 'Not configured' };
    try {
      const personId = await this.upsertPerson({ name: reg.name, email: reg.email, phone: reg.phone });
      const { error } = await db().from('growth_track_registrations').insert({
        part: reg.part, session_date: reg.sessionDate || null, session_time: reg.sessionTime || '',
        name: reg.name, email: reg.email, phone: reg.phone || '', notes: reg.notes || '',
        user_id: reg.userId || null, person_id: personId,
      });
      if (error) throw error;
      return { ok: true };
```

Replace with:

```js
  async submitGrowthTrackRegistration(reg) {
    if (!db()) return { error: 'Not configured' };
    try {
      const personId = await this.upsertPerson({ name: reg.name, email: reg.email, phone: reg.phone });
      const { error } = await db().from('growth_track_registrations').insert({
        part: reg.part, session_date: reg.sessionDate || null, session_time: reg.sessionTime || '',
        name: reg.name, email: reg.email, phone: reg.phone || '', notes: reg.notes || '',
        user_id: reg.userId || null, person_id: personId,
      });
      if (error) throw error;
      if (personId) this.recordMilestone(personId, 'growth_track_registered');
      return { ok: true };
```

- [ ] **Step 2: `adminAddGroupMember`**

Find:

```js
      const personId = await this.upsertPerson({ name: m.name, email: m.email, phone: m.phone });
      const { error } = await db().from('group_memberships').insert({
        group_id: m.groupId, name: m.name, email: m.email, phone: m.phone || '',
        notes: m.notes || '', user_id: match ? match.userId : null, person_id: personId,
      });
      if (error) throw error;
      return { ok: true };
```

Replace with:

```js
      const personId = await this.upsertPerson({ name: m.name, email: m.email, phone: m.phone });
      const { error } = await db().from('group_memberships').insert({
        group_id: m.groupId, name: m.name, email: m.email, phone: m.phone || '',
        notes: m.notes || '', user_id: match ? match.userId : null, person_id: personId,
      });
      if (error) throw error;
      if (personId) this.recordMilestone(personId, 'small_group_member');
      return { ok: true };
```

- [ ] **Step 3: Verify syntax**

Run: `node --check js/db.js` — expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "Record growth_track_registered and small_group_member milestones"
```

---

### Task 4: Wire `adminSetGtAttended` and `addAssessmentAttempt`

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: `adminSetGtAttended`**

Find:

```js
  async adminSetGtAttended(id, attended) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_registrations')
        .update({ attended: !!attended }).eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminSetGtAttended:', e.message); return { error: e.message }; }
```

Replace with:

```js
  async adminSetGtAttended(id, attended) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { data, error } = await db().from('growth_track_registrations')
        .update({ attended: !!attended }).eq('id', id).select('person_id').single();
      if (error) throw error;
      if (attended && data && data.person_id) this.recordMilestone(data.person_id, 'growth_track_attended');
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminSetGtAttended:', e.message); return { error: e.message }; }
```

- [ ] **Step 2: `addAssessmentAttempt`**

Find:

```js
  async addAssessmentAttempt({ assessmentType, answers, scores, result }) {
    if (!db()) return { error: 'Not configured' };
    const { data: { user } } = await db().auth.getUser();
    if (!user) return { error: 'Not signed in' };
    const { error } = await db().from('assessment_attempts').insert({
      user_id: user.id, assessment_type: assessmentType,
      answers, scores, result,
    });
    if (error) return { error: error.message };
    return { success: true };
  },
```

Replace with:

```js
  async addAssessmentAttempt({ assessmentType, answers, scores, result }) {
    if (!db()) return { error: 'Not configured' };
    const { data: { user } } = await db().auth.getUser();
    if (!user) return { error: 'Not signed in' };
    const { error } = await db().from('assessment_attempts').insert({
      user_id: user.id, assessment_type: assessmentType,
      answers, scores, result,
    });
    if (error) return { error: error.message };
    const { data: person } = await db().from('people').select('id').eq('user_id', user.id).maybeSingle();
    if (person) this.recordMilestone(person.id, assessmentType === 'disc' ? 'assessment_disc_completed' : 'assessment_gifts_completed');
    return { success: true };
  },
```

- [ ] **Step 3: Verify syntax**

Run: `node --check js/db.js` — expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "Record growth_track_attended and assessment completion milestones"
```

---

### Task 5: Wire `approveApplication` in `admin/dashboard.html`

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Locate and edit**

Find this exact text:

```js
async function approveApplication(id){
  const a=_cachedApplications.find(x=>x.id===id);if(!a)return;
  const draftGroup={published:false,name:a.groupName,leader:a.name,leaderEmail:a.email,day:a.day,time:a.time,type:a.type,audience:a.audience,location:a.location,description:a.description,image:'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80',open:true,semesterId:a.semesterId||null};
  await Promise.all([
    SupaDB.saveGroup(draftGroup),
    SupaDB.updateApplication(id,{status:'approved'})
  ]);
  if(a.email){
```

Replace with:

```js
async function approveApplication(id){
  const a=_cachedApplications.find(x=>x.id===id);if(!a)return;
  const draftGroup={published:false,name:a.groupName,leader:a.name,leaderEmail:a.email,day:a.day,time:a.time,type:a.type,audience:a.audience,location:a.location,description:a.description,image:'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80',open:true,semesterId:a.semesterId||null};
  await Promise.all([
    SupaDB.saveGroup(draftGroup),
    SupaDB.updateApplication(id,{status:'approved'})
  ]);
  SupaDB.upsertPerson({name:a.name,email:a.email,phone:a.phone}).then(personId => {
    if (personId) SupaDB.recordMilestone(personId, 'small_group_leader');
  });
  if(a.email){
```

(This is fire-and-forget — `.then(...)` rather than `await`, matching this phase's "never block the primary action" milestone-recording principle, consistent with every `js/db.js` site in Tasks 3-4.)

- [ ] **Step 2: Verify syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(function(s){return s.replace(/<\/?script>/g,'')}).join('\n'))"` — expected: no error thrown. (`admin/dashboard.html` has one large inline `<script>` block, same extraction technique used for `mensretreat/index.html` in phase 2.)

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Record small_group_leader milestone on application approval"
```

---

### Task 6: End-to-end verification on staging

**Files:** none

- [ ] **Step 1: Confirm production is still untouched**

Run via Supabase MCP `execute_sql` on `project_id: ktyplbmawlaerzohkdqy` (production):

```sql
select count(*) from information_schema.routines where routine_name = 'record_milestone';
```
Expected: `0`.

- [ ] **Step 2: Confirm no commit in this phase reached `origin`**

```bash
git log --oneline origin/main -3
```
Expected: none of this phase's commits appear.

- [ ] **Step 3: Push to staging, then live-test the Growth Track attendance toggle**

Push this branch's HEAD to `staging` (not `origin`). Wait for the Pages build. Using the browser against the staging admin dashboard, find a real Growth Track registrant on the roster and toggle "Mark as attended" on.

Then run via Supabase MCP `execute_sql` on `project_id: govvofbrhhpowtdnuzcw`:

```sql
select gtr.name, gtr.person_id, pm.milestone, pm.achieved_at
from public.growth_track_registrations gtr
join public.person_milestones pm on pm.person_id = gtr.person_id and pm.milestone = 'growth_track_attended'
where gtr.name = '<the registrant you toggled>';
```
Expected: exactly one row.

- [ ] **Step 4: Confirm the unique index prevents duplicates**

Toggle the same registrant's "attended" checkbox off, then back on again. Re-run the same query as Step 3.

Expected: still exactly one row (same `achieved_at` as before, not a new one) — proves `on conflict (person_id, milestone) do nothing` is working, not silently erroring or duplicating.

---

## Self-Review Notes

- **Spec coverage:** every row of the design spec's investigation table (Task descriptions) has a corresponding task: Task 1 = schema, Task 2 = wrapper, Task 3 = the two sites that reuse an already-resolved `personId`, Task 4 = the two sites needing a new lookup (`.select('person_id')` on update; `people` lookup by `user_id`), Task 5 = the one admin-UI site.
- **No placeholders:** every step shows literal before/after code, re-verified against the actual post-phase-2 file state (not the pre-phase-2 version) before writing this plan.
- **Type/name consistency:** `recordMilestone(personId, milestone)` called with positional args everywhere (matching its 2-positional-arg signature, unlike `upsertPerson`'s single destructured-object arg — intentionally different shape since `recordMilestone` only ever needs two primitives, not a bag of person fields). Milestone string literals (`'growth_track_registered'`, `'growth_track_attended'`, `'assessment_disc_completed'`, `'assessment_gifts_completed'`, `'small_group_member'`, `'small_group_leader'`) match exactly between the design spec's table and every task's code.
- **Fire-and-forget consistency:** every call site uses either a bare (non-awaited) call (`js/db.js` sites, since `this.recordMilestone(...)` returns a promise nobody awaits) or `.then(...)` (the one `admin/dashboard.html` site, outside an `async` context that could otherwise just omit `await`) — never blocks its surrounding action on the milestone write.
