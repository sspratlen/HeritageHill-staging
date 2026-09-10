# People Backbone Phase 2 (Staging Only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the legacy blank-email data phase 1 found, then wire every write path for the 9 `person_id`-linked tables to populate it going forward, using the `upsert_person()` RPC phase 1 already created on staging.

**Architecture:** One new `SupaDB.upsertPerson()` wrapper in `js/db.js` calling the `upsert_person` RPC, called from each of 9 existing write methods (`js/db.js`) plus one standalone inline call in `mensretreat/index.html`. See `docs/superpowers/specs/2026-09-10-people-backbone-phase2-design.md` for full rationale, including why the current code (not this phase) already fixed the root-cause bug behind the blank emails.

**Tech Stack:** Same as the rest of this repo — plain JS (`js/db.js`), Supabase JS client `.rpc()` calls, one raw `fetch()` REST call in `mensretreat/index.html`. Database side (the `upsert_person` function) already exists on staging from phase 1 — nothing to apply there.

**CRITICAL DEPLOY CONSTRAINT:** Every commit in this plan must be pushed to the `staging` git remote ONLY. Do **not** push to `origin` (production) at any point — production's database has no `people` table or `upsert_person` function, and this code would error there. This restriction lasts until a separate, explicit decision to promote phase 1+2 together.

---

### Task 1: Fix the legacy blank `member_profiles.email` data

**Files:** none (data fix, run directly via Supabase MCP against `project_id: govvofbrhhpowtdnuzcw`)

- [ ] **Step 1: Run the fix**

```sql
update public.member_profiles mp
set email = lower(au.email)
from auth.users au
where au.id = mp.user_id and mp.email = '' and au.email is not null and au.email <> '';
```

- [ ] **Step 2: Verify**

```sql
select count(*) from public.member_profiles where email = '';
```

Expected: `0`.

```sql
select count(*) from public.member_profiles where email <> '';
```

Expected: `27` (all rows now have a real email).

---

### Task 2: Add the `upsertPerson` wrapper to `js/db.js`

**Files:**
- Modify: `js/db.js` (insert a new method right before the `/* ── PUBLIC: Submit signup ──... */` section, i.e. immediately after `adminFindMemberByEmail` and before that comment)

- [ ] **Step 1: Locate the insertion point**

Find this exact text in `js/db.js` (currently around line 341-343):

```js
  async adminFindMemberByEmail(email) {
    if (!db() || !email) return null;
    try {
      const { data, error } = await db().from('member_profiles')
        .select('*').eq('email', email.toLowerCase()).eq('status', 'approved').maybeSingle();
      if (error) throw error;
      return data ? { userId: data.user_id } : null;
    } catch(e) { console.error('[SupaDB] adminFindMemberByEmail:', e.message); return null; }
  },

  /* ── PUBLIC: Sermons ────────────────────────────────────── */
```

- [ ] **Step 2: Insert the new method between them**

Replace that block with:

```js
  async adminFindMemberByEmail(email) {
    if (!db() || !email) return null;
    try {
      const { data, error } = await db().from('member_profiles')
        .select('*').eq('email', email.toLowerCase()).eq('status', 'approved').maybeSingle();
      if (error) throw error;
      return data ? { userId: data.user_id } : null;
    } catch(e) { console.error('[SupaDB] adminFindMemberByEmail:', e.message); return null; }
  },

  /* ── People backbone: find-or-create a canonical person row ──
     Best-effort — a failure here must never block the caller's real
     write (a signup, an RSVP, etc.). Returns the person's uuid, or
     null if it couldn't be resolved. */
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

- [ ] **Step 3: Verify no syntax errors**

Run: `node --check js/db.js` (Node can check plain JS syntax without executing it — this file isn't a Node module, but `--check` only parses, so this works to catch typos without needing a browser).

Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "Add SupaDB.upsertPerson wrapper for the people backbone RPC (staging only)"
```

---

### Task 3: Wire `submitSignup`, `submitApplication`, `submitGrowthTrackRegistration`

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: `submitSignup`**

Find:

```js
  async submitSignup(signup) {
    if (!db()) return { error: 'Not configured' };
    try {
      const current = await this.getCurrentSemester();
      const { error } = await db().from('signups').insert(signupToDb({ ...signup, semesterId: current ? current.id : null }));
      if (error) throw error;
```

Replace with:

```js
  async submitSignup(signup) {
    if (!db()) return { error: 'Not configured' };
    try {
      const current = await this.getCurrentSemester();
      const personId = await this.upsertPerson({ name: signup.name, email: signup.email, phone: signup.phone });
      const { error } = await db().from('signups').insert({ ...signupToDb({ ...signup, semesterId: current ? current.id : null }), person_id: personId });
      if (error) throw error;
```

- [ ] **Step 2: `submitApplication`**

Find:

```js
  async submitApplication(app) {
    if (!db()) return { error: 'Not configured' };
    try {
      // The Leader Application form now lets the applicant pick a semester
      // directly, so an explicit semesterId always wins. Auto-detection is
      // only a fallback for any other caller that doesn't supply one.
      let semesterId = app.semesterId || null;
      if (!semesterId) {
        const current = await this.getCurrentSemester();
        semesterId = current ? current.id : null;
      }
      const { error } = await db().from('applications').insert(applicationToDb({ ...app, semesterId }));
      if (error) throw error;
```

Replace with:

```js
  async submitApplication(app) {
    if (!db()) return { error: 'Not configured' };
    try {
      // The Leader Application form now lets the applicant pick a semester
      // directly, so an explicit semesterId always wins. Auto-detection is
      // only a fallback for any other caller that doesn't supply one.
      let semesterId = app.semesterId || null;
      if (!semesterId) {
        const current = await this.getCurrentSemester();
        semesterId = current ? current.id : null;
      }
      const personId = await this.upsertPerson({ name: app.name, email: app.email, phone: app.phone });
      const { error } = await db().from('applications').insert({ ...applicationToDb({ ...app, semesterId }), person_id: personId });
      if (error) throw error;
```

- [ ] **Step 3: `submitGrowthTrackRegistration`**

Find:

```js
  async submitGrowthTrackRegistration(reg) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_registrations').insert({
        part: reg.part, session_date: reg.sessionDate || null, session_time: reg.sessionTime || '',
        name: reg.name, email: reg.email, phone: reg.phone || '', notes: reg.notes || '',
        user_id: reg.userId || null,
      });
      if (error) throw error;
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
```

- [ ] **Step 4: Verify syntax**

Run: `node --check js/db.js`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add js/db.js
git commit -m "Wire person_id into signup, application, and growth track registration writes"
```

---

### Task 4: Wire `submitEventRsvp`, `addSubscriber`, `upsertSubscriber`

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: `submitEventRsvp`**

Find:

```js
  async submitEventRsvp(rsvp) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('event_rsvps').insert(rsvpToDb(rsvp));
      if (error) throw error;
```

Replace with:

```js
  async submitEventRsvp(rsvp) {
    if (!db()) return { error: 'No DB' };
    try {
      const personId = await this.upsertPerson({ name: rsvp.fullName, email: rsvp.email, phone: rsvp.phone });
      const { error } = await db().from('event_rsvps').insert({ ...rsvpToDb(rsvp), person_id: personId });
      if (error) throw error;
```

- [ ] **Step 2: `addSubscriber`**

Find:

```js
  async addSubscriber(sub) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('subscribers').insert(subscriberToDb(sub));
      if (error) {
```

Replace with:

```js
  async addSubscriber(sub) {
    if (!db()) return { error: 'Not configured' };
    try {
      const personId = await this.upsertPerson({ name: [sub.firstName, sub.lastName].filter(Boolean).join(' '), email: sub.email });
      const { error } = await db().from('subscribers').insert({ ...subscriberToDb(sub), person_id: personId });
      if (error) {
```

- [ ] **Step 3: `upsertSubscriber`**

Find:

```js
  async upsertSubscriber(sub) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('subscribers')
        .upsert(subscriberToDb(sub), { onConflict: 'email' });
      if (error) throw error;
```

Replace with:

```js
  async upsertSubscriber(sub) {
    if (!db()) return { error: 'Not configured' };
    try {
      const personId = await this.upsertPerson({ name: [sub.firstName, sub.lastName].filter(Boolean).join(' '), email: sub.email });
      const { error } = await db().from('subscribers')
        .upsert({ ...subscriberToDb(sub), person_id: personId }, { onConflict: 'email' });
      if (error) throw error;
```

- [ ] **Step 4: Verify syntax**

Run: `node --check js/db.js`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add js/db.js
git commit -m "Wire person_id into event RSVP and newsletter subscriber writes"
```

---

### Task 5: Wire `createMyProfile`, `adminProvisionMember`, `adminAddGroupMember`, `adminUpsertUserRole`

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: `createMyProfile`**

Find:

```js
  async createMyProfile() {
    // Builds the row from the auth user's metadata (registration) or email (staff).
    if (!db()) return { error: 'Not configured' };
    const { data: { user } } = await db().auth.getUser();
    if (!user) return { error: 'Not signed in' };
    const m = user.user_metadata || {};
    const { error } = await db().from('member_profiles').insert({
      user_id: user.id,
      name: m.name || user.email.split('@')[0],
      email: user.email.toLowerCase(),
      phone: m.phone || '',
      group_id: m.group_id || null,
      years_attending: m.years_attending || '',
    });
    if (error) return { error: error.message };
    return { success: true };
  },
```

Replace with:

```js
  async createMyProfile() {
    // Builds the row from the auth user's metadata (registration) or email (staff).
    if (!db()) return { error: 'Not configured' };
    const { data: { user } } = await db().auth.getUser();
    if (!user) return { error: 'Not signed in' };
    const m = user.user_metadata || {};
    const name = m.name || user.email.split('@')[0];
    const email = user.email.toLowerCase();
    const personId = await this.upsertPerson({ name, email, phone: m.phone });
    const { error } = await db().from('member_profiles').insert({
      user_id: user.id,
      name, email,
      phone: m.phone || '',
      group_id: m.group_id || null,
      years_attending: m.years_attending || '',
      person_id: personId,
    });
    if (error) return { error: error.message };
    return { success: true };
  },
```

- [ ] **Step 2: `adminProvisionMember`**

Find:

```js
      const { error: insertErr } = await db().from('member_profiles').insert({
        user_id: json.userId, name: name || lower, email: lower, phone: phone || '',
        group_id: groupId || null, status: 'approved',
      });
```

Replace with:

```js
      const personId = await this.upsertPerson({ name: name || lower, email: lower, phone });
      const { error: insertErr } = await db().from('member_profiles').insert({
        user_id: json.userId, name: name || lower, email: lower, phone: phone || '',
        group_id: groupId || null, status: 'approved', person_id: personId,
      });
```

- [ ] **Step 3: `adminAddGroupMember`**

Find:

```js
  async adminAddGroupMember(m) {
    if (!db()) return { error: 'Not configured' };
    try {
      let match = await this.adminFindMemberByEmail(m.email);
      if (!match) {
        const provisioned = await this.adminProvisionMember({
          name: m.name, email: m.email, phone: m.phone, groupId: m.groupId,
        });
        if (provisioned.userId) match = { userId: provisioned.userId };
      }
      const { error } = await db().from('group_memberships').insert({
        group_id: m.groupId, name: m.name, email: m.email, phone: m.phone || '',
        notes: m.notes || '', user_id: match ? match.userId : null,
      });
      if (error) throw error;
```

Replace with:

```js
  async adminAddGroupMember(m) {
    if (!db()) return { error: 'Not configured' };
    try {
      let match = await this.adminFindMemberByEmail(m.email);
      if (!match) {
        const provisioned = await this.adminProvisionMember({
          name: m.name, email: m.email, phone: m.phone, groupId: m.groupId,
        });
        if (provisioned.userId) match = { userId: provisioned.userId };
      }
      const personId = await this.upsertPerson({ name: m.name, email: m.email, phone: m.phone });
      const { error } = await db().from('group_memberships').insert({
        group_id: m.groupId, name: m.name, email: m.email, phone: m.phone || '',
        notes: m.notes || '', user_id: match ? match.userId : null, person_id: personId,
      });
      if (error) throw error;
```

- [ ] **Step 4: `adminUpsertUserRole`**

Find:

```js
  async adminUpsertUserRole({ email, displayName, role, forcePasswordChange }) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('user_roles')
        .upsert({ email: email.toLowerCase(), display_name: displayName || '', role, force_password_change: !!forcePasswordChange }, { onConflict: 'email' });
      if (error) throw error;
```

Replace with:

```js
  async adminUpsertUserRole({ email, displayName, role, forcePasswordChange }) {
    if (!db()) return { error: 'No DB' };
    try {
      const personId = await this.upsertPerson({ name: displayName, email });
      const { error } = await db().from('user_roles')
        .upsert({ email: email.toLowerCase(), display_name: displayName || '', role, force_password_change: !!forcePasswordChange, person_id: personId }, { onConflict: 'email' });
      if (error) throw error;
```

- [ ] **Step 5: Verify syntax**

Run: `node --check js/db.js`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add js/db.js
git commit -m "Wire person_id into member profile, group membership, and user role writes"
```

---

### Task 6: Wire the retreat registration in `mensretreat/index.html`

**Files:**
- Modify: `mensretreat/index.html`

- [ ] **Step 1: Locate the insertion point**

Find this exact text (the fire-and-forget confirmation email block, immediately after the main registration insert succeeds):

```js
      // Fire confirmation email (fire-and-forget — don't block success screen)
      fetch(SUPA_URL + '/functions/v1/notify-retreat-registrant', {
```

- [ ] **Step 2: Add the `person_id` RPC call before the main insert, and include it in the payload**

Find the registration `fetch()` call and the payload it sends (search for `var payload` earlier in the same function, and the `fetch(SUPA_URL + '/rest/v1/retreat_registrations'` call). Immediately before that `fetch()` call, insert:

```js
      var personId = null;
      try {
        var personRes = await fetch(SUPA_URL + '/rest/v1/rpc/upsert_person', {
          method: 'POST',
          headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_name: payload.full_name, p_email: payload.email, p_phone: payload.phone || '' }),
        });
        if (personRes.ok) personId = await personRes.json();
      } catch (e) { /* best-effort — continue without person_id */ }
      payload.person_id = personId;
```

(This must land after `payload` is fully built with `full_name`/`email`/`phone`, and before the `fetch(SUPA_URL + '/rest/v1/retreat_registrations', ...)` call that sends `payload` as the request body — read the surrounding function to place it correctly; do not guess `payload`'s shape, verify `full_name`/`email`/`phone` are its actual field names by reading the code immediately above this insertion point.)

- [ ] **Step 3: Verify syntax**

Run: `node --check mensretreat/index.html` — this will fail because the file is HTML, not JS. Instead, extract and check just the script: run `node -e "new Function(require('fs').readFileSync('mensretreat/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))"` to confirm no syntax errors across all inline scripts in the file.

Expected: no error thrown.

- [ ] **Step 4: Commit**

```bash
git add mensretreat/index.html
git commit -m "Wire person_id into the Men's Retreat registration write (staging only)"
```

---

### Task 7: End-to-end verification on staging

**Files:** none

- [ ] **Step 1: Confirm production is still untouched**

Run via Supabase MCP `execute_sql` on `project_id: ktyplbmawlaerzohkdqy` (production):

```sql
select count(*) from information_schema.routines where routine_name = 'upsert_person';
```

Expected: `0` — production has no `upsert_person` function (this whole phase is staging-database-only).

- [ ] **Step 2: Confirm no commit in this phase reached `origin`**

```bash
git log --oneline origin/main -3
```

Expected: the phase-2 commits from Tasks 2-6 do NOT appear in this list (only phase-1's already-reverted state or earlier).

- [ ] **Step 3: Live-test one write path end to end**

Using the browser against the staging site (`https://sspratlen.github.io/HeritageHill-staging/small-groups.html`), submit one real "Join a Group" request with a throwaway test email (e.g. `phase2-test+<timestamp>@example.com`).

Then run via Supabase MCP `execute_sql` on `project_id: govvofbrhhpowtdnuzcw`:

```sql
select s.name, s.email, s.person_id, p.name as person_name, p.email as person_email
from public.signups s join public.people p on p.id = s.person_id
where s.email = 'phase2-test+<timestamp>@example.com';
```

Expected: one row, `s.person_id` is not null, and `p.name`/`p.email` match what was submitted — confirms the full wire (form → `SupaDB.submitSignup` → `upsertPerson` RPC → `people` row → `signups.person_id`) works end to end on the live staging site, not just in isolated code review.

---

## Self-Review Notes

- **Spec coverage:** every table in the design spec's call-site table (signups, applications, growth_track_registrations, event_rsvps, subscribers ×2, member_profiles ×2, group_memberships, user_roles) has a corresponding task step; `retreat_registrations` has its own task (6) per the spec's explicit note that it needs a standalone call, not a `SupaDB` method.
- **No placeholders:** every step shows literal before/after code, using exact field names verified by reading `js/db.js`'s actual mapper functions (`rsvpToDb`, `applicationToDb`, `subscriberToDb`, `signupToDb`) rather than guessed names — e.g. `rsvp.fullName` (not `rsvp.name`), subscribers have no phone field.
- **Type/name consistency:** `upsertPerson({ name, email, phone })` called with the same three named keys at every site; every insert payload gains exactly one new field, `person_id`, matching the column name from phase 1's schema.
- **Deploy discipline:** Task 7 Steps 1-2 specifically verify the staging-only constraint held, not just that the code works.
