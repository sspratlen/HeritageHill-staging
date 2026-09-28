# Small Groups Unified Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `admin/dashboard.html`'s existing Groups tab reachable by plain members and event managers, split into "My Groups" / "Manage Groups" sub-tabs matching the shipped Baptism pattern exactly, add an invitational "not yet in a group" CTA, and wire the My Journey pipeline's "Filled" stage to open it.

**Architecture:** No new render function and no porting from `admin/my-profile.html` — `renderMyGroupsCard()` (dashboard.html's existing personal-status card, already role-agnostic) is reused as-is, same pattern as Baptism's `renderMyBaptismCard()`. The admin-only markup is wrapped in one container and gated by an `isAdmin()` early return, and a small sub-tab switcher (copied verbatim from the shipped Baptism sub-tab code) toggles between the two.

**Tech Stack:** Static HTML/JS (no build step).

**Full design context:** `docs/superpowers/specs/2026-09-27-groups-unified-tab-design.md`

**Testing note:** No automated test suite in this repo. Verification uses this repo's established pattern: reading deployed source via `curl`, and asking Scott to click through as member/admin/event_manager (no admin credentials available to Claude).

---

### Task 1: Give members and event managers access to the Groups tab

**Files:**
- Modify: `admin/dashboard.html` (`ROLE_TABS`)

- [ ] **Step 1: Add `'groups'` to the `event_manager` and `member` tiers**

Find:

```js
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users','journey'],
  event_manager:       ['events','sermons','email','journey','baptism'],
  member:              ['journey','baptism'],
};
```

Replace with:

```js
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users','journey'],
  event_manager:       ['events','sermons','email','journey','baptism','groups'],
  member:              ['journey','baptism','groups'],
};
```

- [ ] **Step 2: Verify**

```bash
grep -n "member:              \['journey','baptism','groups'\]" admin/dashboard.html
```

Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Give members and event managers access to the Groups tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Split the Groups panel into My Groups / Manage Groups sub-tabs

**Files:**
- Modify: `admin/dashboard.html` (`panelGroups` HTML)

- [ ] **Step 1: Add the sub-tab switcher and wrap the admin-only markup**

Find:

```html
    <div class="tab-panel" id="panelGroups">
      <div id="myGroupsBox"></div>
      <div class="action-bar">
        <h2>Manage Small Groups</h2>
        <select id="groupSemesterFilter" onchange="renderGroupsTable()" style="padding:.45rem .85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;">
          <option value="">All Semesters</option>
          <option value="__current__">Current Semester</option>
        </select>
        <select id="groupPublishedFilter" onchange="renderGroupsTable()" style="padding:.45rem .85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;">
          <option value="">All Statuses</option>
          <option value="published">Published Only</option>
          <option value="draft">Draft Only</option>
        </select>
        <input type="text" id="groupLeaderFilter" placeholder="Search by leader…" oninput="renderGroupsTable()" style="padding:.45rem .85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;" />
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" id="emailAllLeadersBtn" onclick="openAllLeadersEmailModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Email All Leaders
          </button>
          <button class="btn btn-secondary" id="emailHistoryBtn" onclick="openEmailHistoryModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Email History
          </button>
          <button class="btn btn-primary" id="addGroupBtn" onclick="openGroupModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Group
          </button>
        </div>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Group Name</th><th>Leader</th><th>Day & Time</th><th>Type</th><th>Audience</th><th>Semester</th><th>Published</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="groupsTable"></tbody></table>
        <div class="empty" id="groupsEmpty" style="display:none;">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <h3>No groups yet</h3><p>Add your first small group using the button above.</p>
        </div>
      </div>
    </div>
```

Replace with:

```html
    <div class="tab-panel" id="panelGroups">
      <div id="groupsSubTabs" style="display:none; gap:8px; margin-bottom:20px;">
        <button class="btn btn-sm" id="groupsSubTabMine" onclick="switchGroupsSubTab('mine')">My Groups</button>
        <button class="btn btn-sm" id="groupsSubTabManage" onclick="switchGroupsSubTab('manage')">Manage Groups</button>
      </div>
      <div id="myGroupsBox"></div>
      <div id="groupsAdminSection">
        <div class="action-bar">
          <h2>Manage Small Groups</h2>
          <select id="groupSemesterFilter" onchange="renderGroupsTable()" style="padding:.45rem .85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;">
            <option value="">All Semesters</option>
            <option value="__current__">Current Semester</option>
          </select>
          <select id="groupPublishedFilter" onchange="renderGroupsTable()" style="padding:.45rem .85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;">
            <option value="">All Statuses</option>
            <option value="published">Published Only</option>
            <option value="draft">Draft Only</option>
          </select>
          <input type="text" id="groupLeaderFilter" placeholder="Search by leader…" oninput="renderGroupsTable()" style="padding:.45rem .85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;" />
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary" id="emailAllLeadersBtn" onclick="openAllLeadersEmailModal()">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Email All Leaders
            </button>
            <button class="btn btn-secondary" id="emailHistoryBtn" onclick="openEmailHistoryModal()">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Email History
            </button>
            <button class="btn btn-primary" id="addGroupBtn" onclick="openGroupModal()">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Group
            </button>
          </div>
        </div>
        <div class="table-wrap">
          <table><thead><tr><th>Group Name</th><th>Leader</th><th>Day & Time</th><th>Type</th><th>Audience</th><th>Semester</th><th>Published</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="groupsTable"></tbody></table>
          <div class="empty" id="groupsEmpty" style="display:none;">
            <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            <h3>No groups yet</h3><p>Add your first small group using the button above.</p>
          </div>
        </div>
      </div>
    </div>
```

(Only changes: the new `#groupsSubTabs` switcher, a new `<div id="groupsAdminSection">` wrapping the existing action-bar + table-wrap, and its matching closing `</div>` moved to just before `panelGroups`'s own closing `</div>`. No other markup changes.)

- [ ] **Step 2: Verify**

```bash
grep -n 'id="groupsSubTabs"\|id="groupsAdminSection"' admin/dashboard.html
```

Expected: one match each (2 total).

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
git commit -m "Add My Groups / Manage Groups sub-tab switcher to the Groups panel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Add `switchGroupsSubTab()` and gate `renderGroupsTable()`

**Files:**
- Modify: `admin/dashboard.html` (new function + `renderGroupsTable()`)

- [ ] **Step 1: Add `switchGroupsSubTab()` and gate the admin-only fetch**

Find:

```js
async function renderGroupsTable(){
  renderMyGroupsCard();
  _cachedGroups = await SupaDB.adminGetAllGroups();
```

Replace with:

```js
// For non-admins there's nothing to switch to -- myGroupsBox just stays
// visible and groupsAdminSection stays hidden, unconditionally. The
// sub-tab buttons themselves are hidden for non-admins (see renderGroupsTable).
function switchGroupsSubTab(which) {
  const isMine = which === 'mine';
  document.getElementById('myGroupsBox').style.display = isMine ? '' : 'none';
  document.getElementById('groupsAdminSection').style.display = isMine ? 'none' : '';
  const mineBtn = document.getElementById('groupsSubTabMine'), manageBtn = document.getElementById('groupsSubTabManage');
  mineBtn.classList.toggle('btn-primary', isMine); mineBtn.classList.toggle('btn-ghost', !isMine);
  manageBtn.classList.toggle('btn-primary', !isMine); manageBtn.classList.toggle('btn-ghost', isMine);
}

async function renderGroupsTable(){
  renderMyGroupsCard();
  document.getElementById('groupsSubTabs').style.display = isAdmin() ? 'flex' : 'none';
  switchGroupsSubTab('mine');
  if (!isAdmin()) return;
  _cachedGroups = await SupaDB.adminGetAllGroups();
```

Nothing else in `renderGroupsTable()` changes — the rest of the function (semester/published/leader filtering, table population) only ever runs for admins now, exactly as it did before this task, just gated by an early return instead of always running.

- [ ] **Step 2: Verify**

```bash
grep -n "function switchGroupsSubTab\|groupsSubTabs\.style\.display\|if (!isAdmin()) return;" admin/dashboard.html
```

Expected: `switchGroupsSubTab` and `groupsSubTabs.style.display` one match each; `if (!isAdmin()) return;` at least two matches (one from this task, one already present from the Baptism phase in `renderBaptismTab()`).

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Skip admin-only Groups data fetch and hide its UI for non-admins

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Add a "not yet in a group" invitation

**Files:**
- Modify: `js/member-dashboard.js` (`renderGroupHistory`)

- [ ] **Step 1: Replace the bare empty-state message with an invitation + CTA**

Find:

```js
    if (!rows.length) {
      containerEl.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;">No group history yet.</p>';
      return;
    }
```

Replace with:

```js
    if (!rows.length) {
      containerEl.innerHTML = `
        <p class="jp-empty">Not in a small group yet — that's where a lot of life change happens, through real relationships with people who'll walk with you.</p>
        <a href="small-groups.html" class="jp-cta">See what groups are available →</a>`;
      return;
    }
```

- [ ] **Step 2: Verify**

```bash
grep -n "See what groups are available" js/member-dashboard.js
```

Expected: one match.

- [ ] **Step 3: Confirm both callers pick this up automatically**

```bash
grep -rn "renderGroupHistory(\|renderGroupsCard(" admin/dashboard.html admin/my-profile.html js/member-dashboard.js
```

Expected: `renderGroupsCard` called from `admin/dashboard.html`'s `renderMyGroupsCard()` and `admin/my-profile.html`'s `renderGroupsPanel()`; `renderGroupHistory` called from those two paths plus `renderGroupsCard`'s own definition (which delegates to it) — confirming this one change reaches both dashboard.html's `#myGroupsBox` and my-profile.html's Groups panel, exactly as the design intends.

- [ ] **Step 4: Commit**

```bash
git add js/member-dashboard.js
git commit -m "Add an invitation to join a group when a member has none yet

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire the "Filled" stage click-through on My Journey

**Files:**
- Modify: `admin/dashboard.html` (`renderJourneyPanel`)

- [ ] **Step 1: Add `onFilledClick`**

Find:

```js
    teamMemberships: _journeyData.teamMemberships, teams: _journeyData.teams,
    onFoundClick: () => switchTab('baptism'),
  });
}
```

Replace with:

```js
    teamMemberships: _journeyData.teamMemberships, teams: _journeyData.teams,
    onFoundClick: () => switchTab('baptism'),
    onFilledClick: () => switchTab('groups'),
  });
}
```

`onFreedClick`/`onForgedClick` are intentionally left unset — Growth Track and Impact Teams aren't reachable inside `dashboard.html` yet; their own future sub-projects will add these the same way.

- [ ] **Step 2: Verify**

```bash
grep -n "onFilledClick: () => switchTab('groups')" admin/dashboard.html
```

Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Wire My Journey's Filled stage to open the Groups tab

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
curl -s https://sspratlen.github.io/HeritageHill-staging/admin/dashboard.html | grep -o "groupsSubTabs\|groupsAdminSection\|onFilledClick" | sort -u
curl -s https://sspratlen.github.io/HeritageHill-staging/js/member-dashboard.js | grep -o "See what groups are available" | sort -u
```

Expected: `groupsSubTabs`, `groupsAdminSection`, `onFilledClick` all present in the first check; the CTA text present in the second.

- [ ] **Step 3: Ask Scott to click through and confirm on staging**

1. **As a plain member with no group**: confirm the Groups sidebar link is now visible, opens `panelGroups`, and shows the new "not yet in a group" invitation with a working link to `small-groups.html` — no sub-tab switcher, no management table, no other members' data.
2. **As a plain member already in a group**: confirm they see their own group history only (no invitation, no management UI).
3. **As a plain member**, on My Journey, click the "Filled" stage header — confirm it opens the Groups tab.
4. **As an admin**: confirm the Groups tab now defaults to "My Groups" and can switch to "Manage Groups" (filters, Email All Leaders, Email History, Add Group, the full table) — same functionality as before, just behind the new switcher, matching how Baptism already works.
5. **As an event_manager**: confirm they now also see the Groups tab with the same member-level view.
6. **On `admin/my-profile.html`** (any role with no group): confirm the Groups panel there also shows the new invitation text (shared component).

- [ ] **Step 4: Stop here — do not touch production**

Per `CLAUDE.md`'s standing deployment rule, do not push to `origin` (production) until Scott explicitly approves promoting this specific change, after confirming Step 3 on staging.

---

## Self-Review Notes

- **Spec coverage:** Role access (Task 1), sub-tab HTML split (Task 2), fetch/render gating + switcher function (Task 3), invitation CTA (Task 4), stage click-through (Task 5), rollout (Task 6) — every part of the design doc maps to a task. The design doc's noted RLS risk is explicitly out of scope for this plan (a separate, future database change), so no task addresses it — that's intentional, not an omission.
- **Placeholder scan:** No TBD/TODO; every step has literal code or an exact command.
- **Type/name consistency:** `groupsAdminSection`/`groupsSubTabs`/`groupsSubTabMine`/`groupsSubTabManage`/`switchGroupsSubTab` all match between Task 2's HTML and Task 3's JS, mirroring the exact naming convention already shipped for `baptismAdminSection`/`baptismSubTabs`/`switchBaptismSubTab`. `onFilledClick` matches the exact option name `MemberDashboard.renderJourneyPipeline` already expects (confirmed against its existing use in `admin/my-profile.html` and the already-shipped `onFoundClick` in this same file).
