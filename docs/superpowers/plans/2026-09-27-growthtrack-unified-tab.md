# Growth Track Unified Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `admin/dashboard.html`'s existing Growth Track tab reachable by plain members and event managers, split into "My Growth Track" / "Manage Growth Track" sub-tabs matching the shipped Baptism/Groups pattern exactly.

**Architecture:** No new render function and no porting from `admin/my-profile.html` — `renderMyGrowthTrackCard()` (dashboard.html's existing personal-status card, already role-agnostic) is reused as-is, same pattern as Baptism's `renderMyBaptismCard()` and Groups' `renderMyGroupsCard()`. The admin-only markup is wrapped in one container and gated by an `isAdmin()` early return, with a sub-tab switcher copied verbatim from the shipped pattern (renamed for Growth Track). No stage-click-through wiring is needed this phase — the Journey treasure map (already shipped) routes its 5 Growth-Track-tagged stops via `getAllowedTabs().includes(stop.tab)`, so adding `'growthtrack'` to `ROLE_TABS.member` is sufficient on its own.

**Tech Stack:** Static HTML/JS (no build step).

**Full design context:** `docs/superpowers/specs/2026-09-27-growthtrack-unified-tab-design.md`

**Testing note:** No automated test suite in this repo (there is a separate, unrelated `node --test` suite for `js/journey-map.js` from a concurrent piece of work — not touched by this plan, no need to run it). Verification uses this repo's established pattern: reading deployed source via `curl`, and asking Scott to click through as member/admin/event_manager (no admin credentials available to Claude).

---

### Task 1: Give members and event managers access to the Growth Track tab

**Files:**
- Modify: `admin/dashboard.html` (`ROLE_TABS`)

- [ ] **Step 1: Add `'growthtrack'` to the `event_manager` and `member` tiers, before `'myinfo'`**

Find:

```js
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users','journey','myinfo'],
  event_manager:       ['events','sermons','email','journey','baptism','groups','myinfo'],
  member:              ['journey','baptism','groups','myinfo'],
};
```

Replace with:

```js
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users','journey','myinfo'],
  event_manager:       ['events','sermons','email','journey','baptism','groups','growthtrack','myinfo'],
  member:              ['journey','baptism','groups','growthtrack','myinfo'],
};
```

- [ ] **Step 2: Verify**

```bash
grep -n "member:              \['journey','baptism','groups','growthtrack','myinfo'\]" admin/dashboard.html
```

Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Give members and event managers access to the Growth Track tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Split the Growth Track panel into My Growth Track / Manage Growth Track sub-tabs

**Files:**
- Modify: `admin/dashboard.html` (`panelGrowthtrack` HTML)

- [ ] **Step 1: Add the sub-tab switcher and wrap the admin-only markup**

Find:

```html
    <div class="tab-panel" id="panelGrowthtrack">
      <div id="myGrowthTrackBox"></div>
      <div class="action-bar">
        <h2>Growth Track</h2>
      </div>
      <div id="gtCards" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px;"></div>
    </div>
```

Replace with:

```html
    <div class="tab-panel" id="panelGrowthtrack">
      <div id="growthtrackSubTabs" style="display:none; gap:8px; margin-bottom:20px;">
        <button class="btn btn-sm" id="growthtrackSubTabMine" onclick="switchGrowthtrackSubTab('mine')">My Growth Track</button>
        <button class="btn btn-sm" id="growthtrackSubTabManage" onclick="switchGrowthtrackSubTab('manage')">Manage Growth Track</button>
      </div>
      <div id="myGrowthTrackBox"></div>
      <div id="growthtrackAdminSection">
        <div class="action-bar">
          <h2>Growth Track</h2>
        </div>
        <div id="gtCards" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px;"></div>
      </div>
    </div>
```

- [ ] **Step 2: Verify**

```bash
grep -n 'id="growthtrackSubTabs"\|id="growthtrackAdminSection"' admin/dashboard.html
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
git commit -m "Add My Growth Track / Manage Growth Track sub-tab switcher

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Add `switchGrowthtrackSubTab()` and gate `renderGrowthTrackTab()`

**Files:**
- Modify: `admin/dashboard.html` (new function + `renderGrowthTrackTab()`)

- [ ] **Step 1: Add `switchGrowthtrackSubTab()` and gate the admin-only fetch**

Find:

```js
async function renderGrowthTrackTab() {
  renderMyGrowthTrackCard();
  [_gtPartsAdmin, _gtCancellationsAdmin] = await Promise.all([
    SupaDB.adminGetAllGrowthTrackParts(),
    SupaDB.getGrowthTrackCancellations(),
  ]);
```

Replace with:

```js
// For non-admins there's nothing to switch to -- myGrowthTrackBox just stays
// visible and growthtrackAdminSection stays hidden, unconditionally. The
// sub-tab buttons themselves are hidden for non-admins (see renderGrowthTrackTab).
function switchGrowthtrackSubTab(which) {
  const isMine = which === 'mine';
  document.getElementById('myGrowthTrackBox').style.display = isMine ? '' : 'none';
  document.getElementById('growthtrackAdminSection').style.display = isMine ? 'none' : '';
  const mineBtn = document.getElementById('growthtrackSubTabMine'), manageBtn = document.getElementById('growthtrackSubTabManage');
  mineBtn.classList.toggle('btn-primary', isMine); mineBtn.classList.toggle('btn-ghost', !isMine);
  manageBtn.classList.toggle('btn-primary', !isMine); manageBtn.classList.toggle('btn-ghost', isMine);
}

async function renderGrowthTrackTab() {
  renderMyGrowthTrackCard();
  document.getElementById('growthtrackSubTabs').style.display = isAdmin() ? 'flex' : 'none';
  switchGrowthtrackSubTab('mine');
  if (!isAdmin()) return;
  [_gtPartsAdmin, _gtCancellationsAdmin] = await Promise.all([
    SupaDB.adminGetAllGrowthTrackParts(),
    SupaDB.getGrowthTrackCancellations(),
  ]);
```

Nothing else in `renderGrowthTrackTab()` changes — the rest of the function (registration-count fetch, `#gtCards` population) only ever runs for admins now, exactly as it did before this task, just gated by an early return instead of always running.

- [ ] **Step 2: Verify**

```bash
grep -n "function switchGrowthtrackSubTab\|if (!isAdmin()) return;" admin/dashboard.html
```

Expected: `switchGrowthtrackSubTab` one match; `if (!isAdmin()) return;` at least three matches total (one each from the already-shipped Baptism and Groups phases, plus this one).

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Skip admin-only Growth Track data fetch and hide its UI for non-admins

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: End-to-end verification on staging

**Files:** none (verification only)

- [ ] **Step 1: Push to staging**

```bash
git push staging main
```

- [ ] **Step 2: Confirm the deployed page has the changes**

```bash
curl -s https://sspratlen.github.io/HeritageHill-staging/admin/dashboard.html | grep -o "growthtrackSubTabs\|growthtrackAdminSection" | sort -u
```

Expected: both present.

- [ ] **Step 3: Ask Scott to click through and confirm on staging**

1. **As a plain member**: confirm the Growth Track sidebar link is now visible, opens `panelGrowthtrack`, and shows only their own status (registration history for Plant/Discover/Grow, DISC/Gifts results or Take/Retake links if not yet done) — no sub-tab switcher, no admin cards, no other members' data.
2. **As a plain member**, on My Journey, click any of the Plant/Discover/Grow/DISC/Spiritual Gifts stops — confirm each opens the Growth Track tab directly (no longer falling back to `my-profile.html`).
3. **As an admin**: confirm the Growth Track tab now defaults to "My Growth Track" and can switch to "Manage Growth Track" (the full occurrence cards, roster/attendance/cancellation tools) — same functionality as before, just behind the new switcher.
4. **As an event_manager**: confirm they now also see the Growth Track tab with the same member-level view.
5. **On `admin/my-profile.html`** (any role): confirm the Growth Track panel there is unaffected.

- [ ] **Step 4: Stop here — do not touch production**

Per `CLAUDE.md`'s standing deployment rule, do not push to `origin` (production) until Scott explicitly approves promoting this specific change, after confirming Step 3 on staging.

---

## Self-Review Notes

- **Spec coverage:** Role access (Task 1), sub-tab HTML split (Task 2), fetch/render gating + switcher function (Task 3), rollout (Task 4) — every part of the design doc maps to a task. The design doc's noted RLS risk is explicitly out of scope for this plan (a separate, future database change), so no task addresses it — that's intentional, not an omission. No stage-click-through task exists because the design doc explains why one isn't needed (the map's own routing handles it once Task 1 lands).
- **Placeholder scan:** No TBD/TODO; every step has literal code or an exact command.
- **Type/name consistency:** `growthtrackAdminSection`/`growthtrackSubTabs`/`growthtrackSubTabMine`/`growthtrackSubTabManage`/`switchGrowthtrackSubTab` all match between Task 2's HTML and Task 3's JS, mirroring the exact naming convention already shipped for `baptismAdminSection`/`groupsAdminSection` and their respective switchers.
