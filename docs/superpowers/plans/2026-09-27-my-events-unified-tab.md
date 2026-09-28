# My Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give plain members who lead an event a "My Events" view in `admin/dashboard.html`'s Events tab, listing their events with a "View Sign-Ups" button that reuses the existing admin sign-ups modal as-is.

**Architecture:** Same "My X / Manage X" sub-tab pattern already shipped for Baptism/Groups/Growth Track/Impact Teams, applied to Events for the first time. Unlike those four, Events had no existing personal-status box, so this plan adds a new `renderMyEventsCard()` from scratch — but its "View Sign-Ups" action reuses `openEventSignupsModal()` completely unmodified, so no new modal or CSS is needed. Because `event_manager` already has full, unconditional access to this tab (unlike the other four tabs, which gated admin-only content behind a bare `isAdmin()` check), this plan adds a small `isEventManager()` helper and gates "Manage Events" behind `isAdmin() || isEventManager()` instead.

**Tech Stack:** Static HTML/JS (no build step).

**Full design context:** `docs/superpowers/specs/2026-09-27-my-events-unified-tab-design.md`

**Testing note:** No automated test suite for these files. Verification uses this repo's established pattern: reading deployed source via `curl`, and asking Scott to click through as a plain member who leads an event (no admin credentials available to Claude).

---

### Task 1: Give members access to the Events tab

**Files:**
- Modify: `admin/dashboard.html` (`ROLE_TABS`)

- [ ] **Step 1: Add `'events'` to the `member` tier, before `'myinfo'`**

Find:

```js
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users','journey','myinfo'],
  event_manager:       ['events','sermons','email','journey','baptism','groups','growthtrack','impactteams','myinfo'],
  member:              ['journey','baptism','groups','growthtrack','impactteams','myinfo'],
};
```

Replace with:

```js
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users','journey','myinfo'],
  event_manager:       ['events','sermons','email','journey','baptism','groups','growthtrack','impactteams','myinfo'],
  member:              ['journey','baptism','groups','growthtrack','impactteams','events','myinfo'],
};
```

(`event_manager` is unchanged — it already has `'events'`.)

- [ ] **Step 2: Verify**

```bash
grep -n "member:              \['journey','baptism','groups','growthtrack','impactteams','events','myinfo'\]" admin/dashboard.html
```

Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Give members access to the Events tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Add `isEventManager()` helper

**Files:**
- Modify: `admin/dashboard.html` (right next to `isAdmin()`)

- [ ] **Step 1: Add the helper**

Find:

```js
function isAdmin() { return (window._userRoles || []).includes('admin'); }
```

Replace with:

```js
function isAdmin() { return (window._userRoles || []).includes('admin'); }
// The Events tab is the one tab where event_manager has always had the
// same full access as admin (unlike Baptism/Groups/Growth Track/Impact
// Teams, which gate their admin-only section behind a bare isAdmin()).
function isEventManager() { return (window._userRoles || []).includes('event_manager'); }
```

- [ ] **Step 2: Verify**

```bash
grep -n "function isEventManager" admin/dashboard.html
```

Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add isEventManager() helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Split the Events panel into My Events / Manage Events sub-tabs

**Files:**
- Modify: `admin/dashboard.html` (`panelEvents` HTML)

- [ ] **Step 1: Add the sub-tab switcher and wrap the admin-only markup**

Find:

```html
    <div class="tab-panel" id="panelEvents">
      <div class="action-bar">
        <h2>Manage Events</h2>
        <button class="btn btn-primary" onclick="openEventModal()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Event
        </button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Title</th><th>Date</th><th>Category</th><th>Type</th><th>Published</th><th>Actions</th></tr></thead>
        <tbody id="eventsTable"></tbody></table>
        <div class="empty" id="eventsEmpty" style="display:none;">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <h3>No events yet</h3><p>Add your first event using the button above.</p>
        </div>
      </div>
    </div>
```

Replace with:

```html
    <div class="tab-panel" id="panelEvents">
      <div id="eventsSubTabs" style="display:none; gap:8px; margin-bottom:20px;">
        <button class="btn btn-sm" id="eventsSubTabMine" onclick="switchEventsSubTab('mine')">My Events</button>
        <button class="btn btn-sm" id="eventsSubTabManage" onclick="switchEventsSubTab('manage')">Manage Events</button>
      </div>
      <div id="myEventsBox"></div>
      <div id="eventsAdminSection">
        <div class="action-bar">
          <h2>Manage Events</h2>
          <button class="btn btn-primary" onclick="openEventModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Event
          </button>
        </div>
        <div class="table-wrap">
          <table><thead><tr><th>Title</th><th>Date</th><th>Category</th><th>Type</th><th>Published</th><th>Actions</th></tr></thead>
          <tbody id="eventsTable"></tbody></table>
          <div class="empty" id="eventsEmpty" style="display:none;">
            <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <h3>No events yet</h3><p>Add your first event using the button above.</p>
          </div>
        </div>
      </div>
    </div>
```

- [ ] **Step 2: Verify**

```bash
grep -n 'id="eventsSubTabs"\|id="eventsAdminSection"\|id="myEventsBox"' admin/dashboard.html
```

Expected: one match each (3 total).

```bash
python3 -c "
import re
content = open('admin/dashboard.html').read()
print('div opens:', len(re.findall(r'<div\b', content)), 'div closes:', len(re.findall(r'</div>', content)))
"
```

Expected: opens and closes equal.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add My Events / Manage Events sub-tab switcher

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Add `switchEventsSubTab()`, `renderMyEventsCard()`, and gate `renderEventsTable()`

**Files:**
- Modify: `admin/dashboard.html` (new functions + `renderEventsTable()`)

- [ ] **Step 1: Add both new functions and gate the admin-only fetch**

Find:

```js
async function renderEventsTable() {
  _cachedEvents = await SupaDB.adminGetAllEvents();
```

Replace with:

```js
// For non-admin/event_manager viewers there's nothing to switch to --
// myEventsBox just stays visible and eventsAdminSection stays hidden,
// unconditionally. The sub-tab buttons themselves are hidden for them
// (see renderEventsTable).
function switchEventsSubTab(which) {
  const isMine = which === 'mine';
  document.getElementById('myEventsBox').style.display = isMine ? '' : 'none';
  document.getElementById('eventsAdminSection').style.display = isMine ? 'none' : '';
  const mineBtn = document.getElementById('eventsSubTabMine'), manageBtn = document.getElementById('eventsSubTabManage');
  mineBtn.classList.toggle('btn-primary', isMine); mineBtn.classList.toggle('btn-ghost', !isMine);
  manageBtn.classList.toggle('btn-primary', !isMine); manageBtn.classList.toggle('btn-ghost', isMine);
}

// Lists events this person leads (matched by leaderEmail, independent of
// any dashboard role -- same matching admin/my-profile.html's own My
// Events panel already uses). "View Sign-Ups" reuses the existing,
// unmodified admin sign-ups modal -- it has no admin-only check beyond
// which button reaches it, so it works identically here.
async function renderMyEventsCard() {
  const box = document.getElementById('myEventsBox');
  const email = (_profile.email || '').toLowerCase();
  const allEvents = await SupaDB.adminGetAllEvents();
  const events = email ? allEvents.filter(e => e.leaderEmail && e.leaderEmail.toLowerCase() === email) : [];
  if (!events.length) {
    box.innerHTML = `<div class="table-wrap" style="padding:20px;margin-bottom:24px;"><h3 style="font-size:.95rem;margin-bottom:10px;">My Events</h3><p style="color:var(--text-muted);font-size:.9rem;">You are not leading any events yet.</p></div>`;
    return;
  }
  box.innerHTML = `<div class="table-wrap" style="padding:20px;margin-bottom:24px;"><h3 style="font-size:.95rem;margin-bottom:10px;">My Events</h3>` +
    events.map(ev => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border);">
        <span>${escapeHtml(ev.title)} <span style="color:var(--text-muted);font-size:.82rem;">${escapeHtml(ev.date)}</span></span>
        <button class="btn btn-ghost btn-sm" onclick="openEventSignupsModal(${ev.id})">View Sign-Ups</button>
      </div>`).join('') + `</div>`;
}

async function renderEventsTable() {
  renderMyEventsCard();
  const canManage = isAdmin() || isEventManager();
  document.getElementById('eventsSubTabs').style.display = canManage ? 'flex' : 'none';
  switchEventsSubTab('mine');
  if (!canManage) return;
  _cachedEvents = await SupaDB.adminGetAllEvents();
```

Nothing else in `renderEventsTable()` changes — the rest of the function (sorting, table population) only ever runs for admin/event_manager now, exactly as it did before this task, just gated by an early return instead of always running.

- [ ] **Step 2: Verify**

```bash
grep -n "function switchEventsSubTab\|async function renderMyEventsCard\|const canManage = isAdmin" admin/dashboard.html
```

Expected: one match each (3 total).

```bash
python3 -c "
import re
content = open('admin/dashboard.html').read()
m = re.search(r'<script>(.*)</script>', content, re.S)
open('/tmp/_check_myevents.js','w').write(m.group(1))
"
node --check /tmp/_check_myevents.js
```

Expected: no output (valid syntax).

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add My Events list with sign-ups reuse, gate Manage Events

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: End-to-end verification on staging

**Files:** none (verification only)

- [ ] **Step 1: Push to staging**

```bash
git push staging main
```

- [ ] **Step 2: Confirm the deployed page has the changes**

```bash
curl -s https://sspratlen.github.io/HeritageHill-staging/admin/dashboard.html | grep -o "eventsSubTabs\|eventsAdminSection\|myEventsBox\|isEventManager" | sort -u
```

Expected: all four present.

- [ ] **Step 3: Ask Scott to click through and confirm on staging**

1. As a plain member leading no events: confirm the Events tab now appears in the sidebar, opens to "My Events", and shows the "not leading any events yet" message with no sub-tab switcher and no admin table visible.
2. As a plain member leading an event (temporarily reassign a test event's Leader Email to a test account if needed): confirm it's listed, and "View Sign-Ups" opens the existing sign-ups modal correctly.
3. As an admin or event_manager: confirm the Events tab now defaults to "My Events" and can switch to "Manage Events" (full CRUD table), matching how the other four tabs already work.
4. Confirm `admin/my-profile.html`'s own My Events panel (list, edit, sign-ups) is completely unaffected.

- [ ] **Step 4: Stop here — do not touch production**

Per `CLAUDE.md`'s standing deployment rule, do not push to `origin` (production) until Scott explicitly approves promoting this specific change, after confirming Step 3 on staging.

---

## Self-Review Notes

- **Spec coverage:** Role access (Task 1), the new `isEventManager()` gate (Task 2), sub-tab HTML split (Task 3), list/reuse/gating logic (Task 4), rollout (Task 5) — every part of the design doc maps to a task. The design doc's explicit deferral of event editing (photo/time/location/description) is intentionally not addressed by any task here — that's the documented "what's still open" item, not an omission.
- **Placeholder scan:** No TBD/TODO; every step has literal code or an exact command.
- **Type/name consistency:** `eventsAdminSection`/`eventsSubTabs`/`eventsSubTabMine`/`eventsSubTabManage`/`switchEventsSubTab` mirror the naming convention already shipped for the four prior tabs. `renderMyEventsCard()` calls `openEventSignupsModal(ev.id)`, which is verified (in the design doc's research) to already exist, unmodified, and to take a single `eventId` argument with no caller-role assumptions.
