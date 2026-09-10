# People Backbone Phase 4 (Staging Only) Implementation Plan — Journey Funnel View

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the `person_milestones` data phase 3 started collecting — add a "Journey Funnel" stat-card section to the admin Analytics tab showing how many people have reached each of the 6 tracked milestones.

**Architecture:** One new read-only `SupaDB.adminGetMilestoneCounts()` method, one new HTML section reusing the existing `stat-card` pattern, wired into the existing `renderAnalyticsTab()` function. No schema changes, no new write paths — the lowest-risk phase in this series. See `docs/superpowers/specs/2026-09-10-people-backbone-phase4-design.md` for rationale.

**Tech Stack:** Same as phases 1-3 — `js/db.js`, `admin/dashboard.html`, staging Supabase project (`govvofbrhhpowtdnuzcw`).

**CRITICAL DEPLOY CONSTRAINT:** Same as phases 1-3 — every commit goes to `staging` only, never `origin`.

---

### Task 1: Add `adminGetMilestoneCounts` to `js/db.js`

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: Insert immediately after the `recordMilestone` method**

Find (the `recordMilestone` method added in phase 3, immediately before the Sermons section comment):

```js
  async recordMilestone(personId, milestone) {
    if (!db() || !personId || !milestone) return;
    try {
      const { error } = await db().rpc('record_milestone', { p_person_id: personId, p_milestone: milestone });
      if (error) throw error;
    } catch(e) { console.warn('[SupaDB] recordMilestone failed (non-critical):', e.message); }
  },

  /* ── PUBLIC: Sermons ────────────────────────────────────── */
```

Replace with:

```js
  async recordMilestone(personId, milestone) {
    if (!db() || !personId || !milestone) return;
    try {
      const { error } = await db().rpc('record_milestone', { p_person_id: personId, p_milestone: milestone });
      if (error) throw error;
    } catch(e) { console.warn('[SupaDB] recordMilestone failed (non-critical):', e.message); }
  },

  /* ── ADMIN: Journey funnel — count of people at each milestone ── */
  async adminGetMilestoneCounts() {
    if (!db()) return {};
    try {
      const { data, error } = await db().from('person_milestones').select('milestone');
      if (error) throw error;
      const counts = {};
      (data || []).forEach(r => { counts[r.milestone] = (counts[r.milestone] || 0) + 1; });
      return counts;
    } catch(e) { console.error('[SupaDB] adminGetMilestoneCounts:', e.message); return {}; }
  },

  /* ── PUBLIC: Sermons ────────────────────────────────────── */
```

- [ ] **Step 2: Verify syntax**

Run: `node --check js/db.js` — expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add js/db.js
git commit -m "Add SupaDB.adminGetMilestoneCounts for the journey funnel view (staging only)"
```

---

### Task 2: Add the Journey Funnel HTML section

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Locate the insertion point**

Find this exact text:

```html
    <div class="tab-panel" id="panelAnalytics">
      <div class="action-bar">
        <h2>Assessment Analytics</h2>
      </div>
      <div id="analyticsEmpty" style="display:none;color:var(--text-muted);padding:20px;">
```

Replace with:

```html
    <div class="tab-panel" id="panelAnalytics">
      <div class="action-bar">
        <h2>Assessment Analytics</h2>
      </div>
      <div class="chart-card" style="background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:24px;">
        <h3 style="font-size:1.05rem;margin-bottom:14px;">Journey Funnel</h3>
        <div class="stats-row" style="grid-template-columns:repeat(3,1fr);">
          <div class="stat-card"><div class="num" id="analyticsMilestoneGtRegistered">–</div><div class="lbl">Registered for Growth Track</div></div>
          <div class="stat-card"><div class="num" id="analyticsMilestoneGtAttended">–</div><div class="lbl">Attended Growth Track</div></div>
          <div class="stat-card"><div class="num" id="analyticsMilestoneDisc">–</div><div class="lbl">Completed DISC</div></div>
          <div class="stat-card"><div class="num" id="analyticsMilestoneGifts">–</div><div class="lbl">Completed Spiritual Gifts</div></div>
          <div class="stat-card"><div class="num" id="analyticsMilestoneGroupMember">–</div><div class="lbl">Joined a Small Group</div></div>
          <div class="stat-card"><div class="num" id="analyticsMilestoneGroupLeader">–</div><div class="lbl">Became a Small Group Leader</div></div>
        </div>
      </div>
      <div id="analyticsEmpty" style="display:none;color:var(--text-muted);padding:20px;">
```

- [ ] **Step 2: Verify syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(function(s){return s.replace(/<\/?script>/g,'')}).join('\n'))"` — expected: no error thrown. (This only checks the `<script>` content, but confirms the edit didn't corrupt anything that HTML parsing would otherwise mask — the HTML itself has no `<script>` tags in this snippet, so this is a sanity check that the surrounding file is still well-formed enough for the script extraction regex to work.)

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Journey Funnel section to the admin Analytics tab (staging only)"
```

---

### Task 3: Wire the funnel into `renderAnalyticsTab`

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Locate and edit**

Find this exact text:

```js
async function renderAnalyticsTab() {
  const [profiles, attempts, content] = await Promise.all([
    SupaDB.adminGetAllMemberProfiles(), SupaDB.getVisibleAttempts(), SupaDB.getAssessmentContent(),
  ]);
  const stats = computeAssessmentAnalytics(profiles, attempts, content);
  window._analyticsStats = stats;
```

Replace with:

```js
async function renderAnalyticsTab() {
  const [profiles, attempts, content, milestoneCounts] = await Promise.all([
    SupaDB.adminGetAllMemberProfiles(), SupaDB.getVisibleAttempts(), SupaDB.getAssessmentContent(),
    SupaDB.adminGetMilestoneCounts(),
  ]);
  document.getElementById('analyticsMilestoneGtRegistered').textContent = milestoneCounts.growth_track_registered || 0;
  document.getElementById('analyticsMilestoneGtAttended').textContent = milestoneCounts.growth_track_attended || 0;
  document.getElementById('analyticsMilestoneDisc').textContent = milestoneCounts.assessment_disc_completed || 0;
  document.getElementById('analyticsMilestoneGifts').textContent = milestoneCounts.assessment_gifts_completed || 0;
  document.getElementById('analyticsMilestoneGroupMember').textContent = milestoneCounts.small_group_member || 0;
  document.getElementById('analyticsMilestoneGroupLeader').textContent = milestoneCounts.small_group_leader || 0;
  const stats = computeAssessmentAnalytics(profiles, attempts, content);
  window._analyticsStats = stats;
```

(This places the funnel population before the existing `hasData` gate a few lines below, so it renders unconditionally per the design spec's decision — the rest of the function, including the early `return` when there's no assessment data, is untouched and still only affects the assessment-specific stats/charts.)

- [ ] **Step 2: Verify syntax**

Run the same script-extraction check as Task 2 Step 2.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Populate the Journey Funnel stats on Analytics tab load"
```

---

### Task 4: Verification on staging

**Files:** none

- [ ] **Step 1: Confirm production is still untouched**

Run via Supabase MCP `execute_sql` on `project_id: ktyplbmawlaerzohkdqy`:

```sql
select count(*) from information_schema.tables where table_name = 'person_milestones';
```
Expected: `0` (this task doesn't add schema, but re-confirming production has none of phases 1-3's schema either, as a standing check).

- [ ] **Step 2: Confirm no commit in this phase reached `origin`**

```bash
git log --oneline origin/main -3
```
Expected: none of this phase's commits appear.

- [ ] **Step 3: Get real counts directly, for comparison**

Run via Supabase MCP `execute_sql` on `project_id: govvofbrhhpowtdnuzcw`:

```sql
select milestone, count(*) from public.person_milestones group by milestone order by milestone;
```

- [ ] **Step 4: Push to staging and verify the deployed page**

Push this branch's HEAD to `staging`. Wait for the Pages build. If admin login credentials are available, log into the staging admin dashboard, open the Analytics tab, and confirm the six Journey Funnel numbers match Step 3's query results exactly.

If admin credentials are still unavailable (same limitation disclosed in phase 3): fetch the deployed `admin/dashboard.html` from the live staging site and confirm it contains the six new stat-card element ids (`analyticsMilestoneGtRegistered`, `analyticsMilestoneGtAttended`, `analyticsMilestoneDisc`, `analyticsMilestoneGifts`, `analyticsMilestoneGroupMember`, `analyticsMilestoneGroupLeader`) and the `adminGetMilestoneCounts` call — proving the code deployed correctly, clearly disclosing that the live-rendered numbers themselves weren't visually confirmed.

---

## Self-Review Notes

- **Spec coverage:** Task 1 = data method, Task 2 = HTML section, Task 3 = wiring, Task 4 = verification — matches every piece of the design spec's Implementation section.
- **No placeholders:** every step shows literal before/after code, verified against the actual current file state before writing this plan.
- **Unconditional rendering confirmed:** Task 3's edit places the funnel population before `computeAssessmentAnalytics`/the `hasData` gate, and doesn't touch the existing early-return — matches the design spec's explicit decision that the funnel must not be hidden behind the assessment-data empty state.
- **Naming consistency:** milestone string keys used in Task 3 (`growth_track_registered`, `growth_track_attended`, `assessment_disc_completed`, `assessment_gifts_completed`, `small_group_member`, `small_group_leader`) match exactly the literals phase 3 already writes via `recordMilestone` calls — verified against `docs/superpowers/specs/2026-09-10-people-backbone-phase3-design.md`'s milestone table before writing this plan.
