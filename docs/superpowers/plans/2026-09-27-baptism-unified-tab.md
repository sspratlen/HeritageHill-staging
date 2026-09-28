# Baptism Unified Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `admin/dashboard.html`'s existing Baptism tab reachable by plain members (not just admins), showing only their own personal status card, and fix an unrelated copy-paste label bug found along the way.

**Architecture:** No new render function and no porting from `admin/my-profile.html` — `renderMyBaptismCard()` (dashboard.html's existing personal-status card, already role-agnostic) is reused as-is. The admin-only markup (Record button + two management tables) is wrapped in one container div so it can be hidden in one line for non-admins, and the tab's fetch of admin-wide data is skipped entirely for them (not just hidden — RLS would silently truncate it anyway, but skipping avoids a wasted round-trip and keeps intent explicit in the code).

**Tech Stack:** Static HTML/JS (no build step).

**Full design context:** `docs/superpowers/specs/2026-09-27-baptism-unified-tab-design.md`

**Testing note:** No automated test suite in this repo. Verification uses this repo's established pattern: reading deployed source via `curl`, and asking Scott to click through as member/admin/event_manager (no admin credentials available to Claude).

---

### Task 1: Fix the "Attendance" mislabel in the shared baptism card component

**Files:**
- Modify: `js/member-dashboard.js` (`renderBaptismCard`)

- [ ] **Step 1: Fix the label**

Find:

```js
  // opts: { baptism: a person_milestones row or null, onPrintCertificate }
  renderBaptismCard(containerEl, opts) {
    const baptism = opts.baptism;
    containerEl.innerHTML = `
      <div class="jp-card">
        <div class="jp-label">Attendance</div>
```

Replace with:

```js
  // opts: { baptism: a person_milestones row or null, onPrintCertificate }
  renderBaptismCard(containerEl, opts) {
    const baptism = opts.baptism;
    containerEl.innerHTML = `
      <div class="jp-card">
        <div class="jp-label">Baptism</div>
```

- [ ] **Step 2: Verify**

```bash
grep -n '"jp-label">Attendance\|"jp-label">Baptism' js/member-dashboard.js
```

Expected: zero matches for `Attendance`, one match for `Baptism` (inside `renderBaptismCard`).

- [ ] **Step 3: Confirm the only caller is unaffected in any other way**

```bash
grep -n "renderBaptismCard(" admin/my-profile.html
```

Expected: one call site, passing `{ baptism: ..., onPrintCertificate: ... }` — confirms this is the only place the fixed label becomes visible, and no other code depends on the old text.

- [ ] **Step 4: Commit**

```bash
git add js/member-dashboard.js
git commit -m "Fix baptism status card mislabeled as Attendance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Give members and event managers access to the Baptism tab

**Files:**
- Modify: `admin/dashboard.html` (`ROLE_TABS`)

- [ ] **Step 1: Add `'baptism'` to the `event_manager` and `member` tiers**

Find:

```js
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users','journey'],
  event_manager:       ['events','sermons','email','journey'],
  member:              ['journey'],
};
```

Replace with:

```js
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users','journey'],
  event_manager:       ['events','sermons','email','journey','baptism'],
  member:              ['journey','baptism'],
};
```

- [ ] **Step 2: Verify**

```bash
grep -n "member:              \['journey','baptism'\]" admin/dashboard.html
```

Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Give members and event managers access to the Baptism tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wrap the admin-only Baptism markup in one container

**Files:**
- Modify: `admin/dashboard.html` (`panelBaptism` HTML)

- [ ] **Step 1: Add a wrapper div around the action-bar and both table-wraps**

Find:

```html
    <!-- BAPTISM -->
    <div class="tab-panel" id="panelBaptism">
      <div id="myBaptismBox"></div>
      <div class="action-bar">
        <h2>Baptism</h2>
        <button class="btn btn-primary" onclick="openBaptismModal()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Record Baptism
        </button>
      </div>
      <div class="table-wrap" style="margin-bottom:24px;">
        <table><thead><tr><th>Name</th><th>Email</th><th>Date</th><th>Notes</th><th>Actions</th></tr></thead>
        <tbody id="baptismTable"></tbody></table>
        <div class="empty" id="baptismEmpty" style="display:none;">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M6 12a6 6 0 0 0 12 0"/><path d="M8 12V6a4 4 0 0 1 8 0v6"/><line x1="3" y1="20" x2="21" y2="20"/><circle cx="12" cy="4" r="1.5"/></svg>
          <h3>No baptisms recorded yet</h3><p>Record your first baptism using the button above.</p>
        </div>
      </div>
      <div class="table-wrap" style="padding:20px;">
        <h3 style="font-size:.95rem;margin-bottom:4px;">Not Yet Baptized</h3>
        <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:4px;">Approved members with no baptism on record.</p>
        <div id="baptismNotYetBox"></div>
      </div>
    </div>
```

Replace with:

```html
    <!-- BAPTISM -->
    <div class="tab-panel" id="panelBaptism">
      <div id="myBaptismBox"></div>
      <div id="baptismAdminSection">
        <div class="action-bar">
          <h2>Baptism</h2>
          <button class="btn btn-primary" onclick="openBaptismModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Record Baptism
          </button>
        </div>
        <div class="table-wrap" style="margin-bottom:24px;">
          <table><thead><tr><th>Name</th><th>Email</th><th>Date</th><th>Notes</th><th>Actions</th></tr></thead>
          <tbody id="baptismTable"></tbody></table>
          <div class="empty" id="baptismEmpty" style="display:none;">
            <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M6 12a6 6 0 0 0 12 0"/><path d="M8 12V6a4 4 0 0 1 8 0v6"/><line x1="3" y1="20" x2="21" y2="20"/><circle cx="12" cy="4" r="1.5"/></svg>
            <h3>No baptisms recorded yet</h3><p>Record your first baptism using the button above.</p>
          </div>
        </div>
        <div class="table-wrap" style="padding:20px;">
          <h3 style="font-size:.95rem;margin-bottom:4px;">Not Yet Baptized</h3>
          <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:4px;">Approved members with no baptism on record.</p>
          <div id="baptismNotYetBox"></div>
        </div>
      </div>
    </div>
```

(Only change: one new wrapping `<div id="baptismAdminSection">` around the action-bar and both table-wraps, and its matching closing `</div>` moved to just before `panelBaptism`'s own closing `</div>`. No other markup changes.)

- [ ] **Step 2: Verify**

```bash
grep -n 'id="baptismAdminSection"' admin/dashboard.html
```

Expected: one match.

```bash
python3 -c "
import re
content = open('admin/dashboard.html').read()
print('div opens:', len(re.findall(r'<div\b', content)), 'div closes:', len(re.findall(r'</div>', content)))
"
```

Expected: opens and closes equal (one new open + one new close added by this step, net balanced).

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Wrap admin-only Baptism markup in one container for role-gating

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Gate the admin-only fetch/render inside `renderBaptismTab()`

**Files:**
- Modify: `admin/dashboard.html` (`renderBaptismTab`)

- [ ] **Step 1: Hide the admin section and skip the admin-only fetch for non-admins**

Find:

```js
async function renderBaptismTab() {
  renderMyBaptismCard();
  const [baptisms, profiles] = await Promise.all([
    SupaDB.adminGetAllBaptisms(), SupaDB.adminGetAllMemberProfiles(),
  ]);
```

Replace with:

```js
async function renderBaptismTab() {
  renderMyBaptismCard();
  const adminSection = document.getElementById('baptismAdminSection');
  adminSection.style.display = isAdmin() ? '' : 'none';
  if (!isAdmin()) return;
  const [baptisms, profiles] = await Promise.all([
    SupaDB.adminGetAllBaptisms(), SupaDB.adminGetAllMemberProfiles(),
  ]);
```

Nothing else in `renderBaptismTab()` changes — the rest of the function (table population, not-yet-baptized list) only ever runs for admins now, exactly as it did before this task, just gated by an early return instead of always running.

- [ ] **Step 2: Verify**

```bash
grep -n "adminSection.style.display\|if (!isAdmin()) return;" admin/dashboard.html
```

Expected: one match each, both inside `renderBaptismTab()`.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Skip admin-only Baptism data fetch and hide its UI for non-admins

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire the "Found" stage click-through on My Journey

**Files:**
- Modify: `admin/dashboard.html` (`renderJourneyPanel`)

- [ ] **Step 1: Add `onFoundClick`**

Find:

```js
function renderJourneyPanel() {
  MemberDashboard.renderJourneyPipeline(document.getElementById('journeyPipelineBox'), {
    memberSince: _profile.memberSince, baptizedAt: _journeyData.baptism ? _journeyData.baptism.achievedAt : null,
    groupMemberships: _journeyData.memberships, groups: _journeyData.groups, email: _profile.email,
    gtRegistrations: _journeyData.gtRegs,
    discAttempt: _journeyData.discAttempts[0], giftsAttempt: _journeyData.giftsAttempts[0],
    discAttemptCount: _journeyData.discAttempts.length, giftsAttemptCount: _journeyData.giftsAttempts.length,
    discBlends: _journeyData.content.discBlends, giftsContent: _journeyData.content.gifts,
    assessmentCtaHrefs: { disc: 'test-personality.html', gifts: 'test-gifts.html' },
    teamMemberships: _journeyData.teamMemberships, teams: _journeyData.teams,
  });
}
```

Replace with:

```js
function renderJourneyPanel() {
  MemberDashboard.renderJourneyPipeline(document.getElementById('journeyPipelineBox'), {
    memberSince: _profile.memberSince, baptizedAt: _journeyData.baptism ? _journeyData.baptism.achievedAt : null,
    groupMemberships: _journeyData.memberships, groups: _journeyData.groups, email: _profile.email,
    gtRegistrations: _journeyData.gtRegs,
    discAttempt: _journeyData.discAttempts[0], giftsAttempt: _journeyData.giftsAttempts[0],
    discAttemptCount: _journeyData.discAttempts.length, giftsAttemptCount: _journeyData.giftsAttempts.length,
    discBlends: _journeyData.content.discBlends, giftsContent: _journeyData.content.gifts,
    assessmentCtaHrefs: { disc: 'test-personality.html', gifts: 'test-gifts.html' },
    teamMemberships: _journeyData.teamMemberships, teams: _journeyData.teams,
    onFoundClick: () => switchTab('baptism'),
  });
}
```

`onFilledClick`/`onFreedClick`/`onForgedClick` are intentionally left unset — Small Groups, Growth Track, and Impact Teams aren't reachable inside `dashboard.html` yet; their own future sub-projects will add these the same way.

- [ ] **Step 2: Verify**

```bash
grep -n "onFoundClick: () => switchTab('baptism')" admin/dashboard.html
```

Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Wire My Journey's Found stage to open the Baptism tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end verification on staging

**Files:** none (verification only)

- [ ] **Step 1: Push to staging**

```bash
git push staging main
```

- [ ] **Step 2: Confirm the deployed page has the changes**

```bash
curl -s https://sspratlen.github.io/HeritageHill-staging/admin/dashboard.html | grep -o "baptismAdminSection\|onFoundClick" | sort -u
curl -s https://sspratlen.github.io/HeritageHill-staging/js/member-dashboard.js | grep -o "jp-label\">Baptism" | sort -u
```

Expected: `baptismAdminSection` and `onFoundClick` both present in the first check; `jp-label">Baptism` present in the second.

- [ ] **Step 3: Ask Scott to click through and confirm on staging**

1. **As a plain member**: confirm the Baptism sidebar link is now visible, opens `panelBaptism`, and shows only "My Baptism" status (baptized-or-not, date/notes if applicable) — no Record Baptism button, no tables, no other members' data.
2. **As a plain member**, on My Journey, click the "Found" stage header — confirm it opens the Baptism tab.
3. **As an admin**: confirm the Baptism tab looks and works exactly as before (own status card + Record button + both tables), unchanged.
4. **As an event_manager**: confirm they now also see the Baptism tab with just their own status (same as a plain member).
5. **On `admin/my-profile.html`** (any role): confirm the Baptism panel's card now reads "Baptism" instead of "Attendance".

- [ ] **Step 4: Stop here — do not touch production**

Per `CLAUDE.md`'s standing deployment rule, do not push to `origin` (production) until Scott explicitly approves promoting this specific change, after confirming Step 3 on staging.

---

## Self-Review Notes

- **Spec coverage:** Label fix (Task 1), role access (Task 2), admin-markup wrapper (Task 3), fetch/render gating (Task 4), stage click-through (Task 5), rollout (Task 6) — every part of the design doc maps to a task.
- **Placeholder scan:** No TBD/TODO; every step has literal code or an exact command.
- **Type/name consistency:** `baptismAdminSection` is introduced in Task 3's HTML and consumed identically in Task 4's JS. `onFoundClick` matches the exact option name `MemberDashboard.renderJourneyPipeline` already expects (confirmed against its existing use in `admin/my-profile.html`). No new functions were introduced that could drift in name between tasks — this plan only adds one wrapper div, one array entry pair, one early-return guard, and one options-object key to already-existing functions.
