# Impact Teams Unified Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `admin/dashboard.html`'s existing Impact Teams tab reachable by plain members and event managers, split into "My Impact Teams" / "Manage Impact Teams" sub-tabs matching the shipped Baptism/Groups/Growth Track pattern exactly, and fix the "not on a team" empty-state copy in both places it appears.

**Architecture:** No new render function and no porting from `admin/my-profile.html` — `renderMyImpactTeamsCard()` (dashboard.html's existing personal-status card, already role-agnostic) is reused as-is, same pattern as the three prior phases. The admin-only markup is wrapped in one container and gated by an `isAdmin()` early return, with a sub-tab switcher copied verbatim from the shipped pattern (renamed for Impact Teams). No stage-click-through wiring is needed — the Journey treasure map already routes its 2 Impact-Teams-tagged stops via `getAllowedTabs().includes(stop.tab)`, so adding `'impactteams'` to `ROLE_TABS.member` is sufficient on its own, same as Growth Track. `renderMyImpactTeamsCard()` and the shared `MemberDashboard.renderImpactTeamsCard()` (used only by `my-profile.html`) stay as two separate implementations — this plan only changes each one's empty-state text, not their structure.

**Tech Stack:** Static HTML/JS (no build step).

**Full design context:** `docs/superpowers/specs/2026-09-27-impactteams-unified-tab-design.md`

**Testing note:** No automated test suite in this repo. Verification uses this repo's established pattern: reading deployed source via `curl`, and asking Scott to click through as member/admin/event_manager (no admin credentials available to Claude).

---

### Task 1: Give members and event managers access to the Impact Teams tab

**Files:**
- Modify: `admin/dashboard.html` (`ROLE_TABS`)

- [ ] **Step 1: Add `'impactteams'` to the `event_manager` and `member` tiers, before `'myinfo'`**

Find:

```js
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users','journey','myinfo'],
  event_manager:       ['events','sermons','email','journey','baptism','groups','growthtrack','myinfo'],
  member:              ['journey','baptism','groups','growthtrack','myinfo'],
};
```

Replace with:

```js
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users','journey','myinfo'],
  event_manager:       ['events','sermons','email','journey','baptism','groups','growthtrack','impactteams','myinfo'],
  member:              ['journey','baptism','groups','growthtrack','impactteams','myinfo'],
};
```

- [ ] **Step 2: Verify**

```bash
grep -n "member:              \['journey','baptism','groups','growthtrack','impactteams','myinfo'\]" admin/dashboard.html
```

Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Give members and event managers access to the Impact Teams tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Split the Impact Teams panel into My Impact Teams / Manage Impact Teams sub-tabs

**Files:**
- Modify: `admin/dashboard.html` (`panelImpactteams` HTML)

- [ ] **Step 1: Add the sub-tab switcher and wrap the admin-only markup**

Find:

```html
    <div class="tab-panel" id="panelImpactteams">
      <div id="myImpactTeamsBox"></div>
      <div class="action-bar">
        <h2>Manage Impact Teams</h2>
        <select id="teamPublishedFilter" onchange="renderImpactTeamsTable()" style="padding:.45rem .85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;">
          <option value="">All Statuses</option>
          <option value="published">Published Only</option>
          <option value="draft">Draft Only</option>
        </select>
        <button class="btn btn-primary" id="addImpactTeamBtn" onclick="openImpactTeamModal()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Team
        </button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Team Name</th><th>Department</th><th>Members</th><th>Leaders</th><th>Published</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="impactTeamsTable"></tbody></table>
        <div class="empty" id="impactTeamsEmpty" style="display:none;">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
          <h3>No impact teams yet</h3><p>Add your first serving team using the button above.</p>
        </div>
      </div>
    </div>
```

Replace with:

```html
    <div class="tab-panel" id="panelImpactteams">
      <div id="impactteamsSubTabs" style="display:none; gap:8px; margin-bottom:20px;">
        <button class="btn btn-sm" id="impactteamsSubTabMine" onclick="switchImpactteamsSubTab('mine')">My Impact Teams</button>
        <button class="btn btn-sm" id="impactteamsSubTabManage" onclick="switchImpactteamsSubTab('manage')">Manage Impact Teams</button>
      </div>
      <div id="myImpactTeamsBox"></div>
      <div id="impactteamsAdminSection">
        <div class="action-bar">
          <h2>Manage Impact Teams</h2>
          <select id="teamPublishedFilter" onchange="renderImpactTeamsTable()" style="padding:.45rem .85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;">
            <option value="">All Statuses</option>
            <option value="published">Published Only</option>
            <option value="draft">Draft Only</option>
          </select>
          <button class="btn btn-primary" id="addImpactTeamBtn" onclick="openImpactTeamModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Team
          </button>
        </div>
        <div class="table-wrap">
          <table><thead><tr><th>Team Name</th><th>Department</th><th>Members</th><th>Leaders</th><th>Published</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="impactTeamsTable"></tbody></table>
          <div class="empty" id="impactTeamsEmpty" style="display:none;">
            <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            <h3>No impact teams yet</h3><p>Add your first serving team using the button above.</p>
          </div>
        </div>
      </div>
    </div>
```

- [ ] **Step 2: Verify**

```bash
grep -n 'id="impactteamsSubTabs"\|id="impactteamsAdminSection"' admin/dashboard.html
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
git commit -m "Add My Impact Teams / Manage Impact Teams sub-tab switcher

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Add `switchImpactteamsSubTab()` and gate `renderImpactTeamsTable()`

**Files:**
- Modify: `admin/dashboard.html` (new function + `renderImpactTeamsTable()`)

- [ ] **Step 1: Add `switchImpactteamsSubTab()` and gate the admin-only fetch**

Find:

```js
async function renderImpactTeamsTable(){
  renderMyImpactTeamsCard();
  _cachedImpactTeams = await SupaDB.adminGetAllImpactTeams();
```

Replace with:

```js
// For non-admins there's nothing to switch to -- myImpactTeamsBox just stays
// visible and impactteamsAdminSection stays hidden, unconditionally. The
// sub-tab buttons themselves are hidden for non-admins (see renderImpactTeamsTable).
function switchImpactteamsSubTab(which) {
  const isMine = which === 'mine';
  document.getElementById('myImpactTeamsBox').style.display = isMine ? '' : 'none';
  document.getElementById('impactteamsAdminSection').style.display = isMine ? 'none' : '';
  const mineBtn = document.getElementById('impactteamsSubTabMine'), manageBtn = document.getElementById('impactteamsSubTabManage');
  mineBtn.classList.toggle('btn-primary', isMine); mineBtn.classList.toggle('btn-ghost', !isMine);
  manageBtn.classList.toggle('btn-primary', !isMine); manageBtn.classList.toggle('btn-ghost', isMine);
}

async function renderImpactTeamsTable(){
  renderMyImpactTeamsCard();
  document.getElementById('impactteamsSubTabs').style.display = isAdmin() ? 'flex' : 'none';
  switchImpactteamsSubTab('mine');
  if (!isAdmin()) return;
  _cachedImpactTeams = await SupaDB.adminGetAllImpactTeams();
```

Nothing else in `renderImpactTeamsTable()` changes — the rest of the function (member-count fetch, filtering, table population) only ever runs for admins now, exactly as it did before this task, just gated by an early return instead of always running.

- [ ] **Step 2: Verify**

```bash
grep -n "function switchImpactteamsSubTab\|if (!isAdmin()) return;" admin/dashboard.html
```

Expected: `switchImpactteamsSubTab` one match; `if (!isAdmin()) return;` at least four matches total (one each from the already-shipped Baptism, Groups, and Growth Track phases, plus this one).

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Skip admin-only Impact Teams data fetch and hide its UI for non-admins

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Fix the "not on a team" empty-state copy in both places

**Files:**
- Modify: `admin/dashboard.html` (`renderMyImpactTeamsCard`)
- Modify: `js/member-dashboard.js` (`renderImpactTeamsCard`)

- [ ] **Step 1: Update `admin/dashboard.html`'s copy**

Find:

```js
      </div>`).join('') : '<p style="color:var(--text-muted);font-size:.9rem;">You are not on an impact team yet.</p>'}
    </div>`;
}
```

Replace with:

```js
      </div>`).join('') : '<p style="color:var(--text-muted);font-size:.9rem;">Not serving on a team yet — talk to a staff member if you\'re interested.</p>'}
    </div>`;
}
```

- [ ] **Step 2: Update `js/member-dashboard.js`'s copy**

Find:

```js
          : '<p class="jp-empty">Not serving on a team yet.</p>'}
      </div>`;
  },
```

Replace with:

```js
          : '<p class="jp-empty">Not serving on a team yet — talk to a staff member if you\'re interested.</p>'}
      </div>`;
  },
```

- [ ] **Step 3: Verify**

```bash
grep -n "talk to a staff member if you" admin/dashboard.html js/member-dashboard.js
```

Expected: one match in each file, same wording.

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html js/member-dashboard.js
git commit -m "Update not-serving-on-a-team message to match Baptism style

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
curl -s https://sspratlen.github.io/HeritageHill-staging/admin/dashboard.html | grep -o "impactteamsSubTabs\|impactteamsAdminSection\|talk to a staff member if you" | sort -u
curl -s https://sspratlen.github.io/HeritageHill-staging/js/member-dashboard.js | grep -o "talk to a staff member if you" | sort -u
```

Expected: all three strings present in the first check; the message present in the second.

- [ ] **Step 3: Ask Scott to click through and confirm on staging**

1. **As a plain member**: confirm the Impact Teams sidebar link is now visible, opens `panelImpactteams`, and shows only their own team membership(s) or the updated "not serving yet" message — no sub-tab switcher, no admin table, no other members' data.
2. **As a plain member**, on My Journey, click either the "Impact team" or "Serving" stop — confirm each opens the Impact Teams tab directly (no longer falling back to `my-profile.html`).
3. **As an admin**: confirm the Impact Teams tab now defaults to "My Impact Teams" and can switch to "Manage Impact Teams" (create/edit teams, roster management) — same functionality as before, just behind the new switcher.
4. **As an event_manager**: confirm they now also see the Impact Teams tab with the same member-level view.
5. **On `admin/my-profile.html`** (any role with no team): confirm the Impact Teams panel there shows the same updated message.

- [ ] **Step 4: Stop here — do not touch production**

Per `CLAUDE.md`'s standing deployment rule, do not push to `origin` (production) until Scott explicitly approves promoting this specific change, after confirming Step 3 on staging.

---

## Self-Review Notes

- **Spec coverage:** Role access (Task 1), sub-tab HTML split (Task 2), fetch/render gating + switcher function (Task 3), empty-state copy fix (Task 4), rollout (Task 5) — every part of the design doc maps to a task. The design doc's noted RLS risk and the "leave the two render implementations separate" decision are both explicitly out of scope, matching Scott's confirmed choice — no task attempts to unify `renderMyImpactTeamsCard()` with the shared `MemberDashboard.renderImpactTeamsCard()`, only their copy is touched, in two separate steps within Task 4.
- **Placeholder scan:** No TBD/TODO; every step has literal code or an exact command.
- **Type/name consistency:** `impactteamsAdminSection`/`impactteamsSubTabs`/`impactteamsSubTabMine`/`impactteamsSubTabManage`/`switchImpactteamsSubTab` all match between Task 2's HTML and Task 3's JS, mirroring the exact naming convention already shipped for the three prior phases. Task 4's two edits use identical final wording in both files, verified by Task 4's own verify step.
