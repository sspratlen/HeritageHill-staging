# Small Groups Unified Tab (Phase 3 of merging admin/dashboard.html + my-profile.html) — Design

## Motivation

Phase 2 (Baptism, shipped) made `admin/dashboard.html`'s admin-only Baptism tab reachable by plain members, showing only their own status, with an admin-only "Manage" sub-tab hidden from them. After Scott clicked through staging, the shipped shape ended up as an actual **My Baptism / Manage Baptisms sub-tab switcher** inside one panel (not the always-stacked layout originally planned) — that's the pattern this phase matches.

Investigation found `admin/dashboard.html`'s Groups tab is already in the exact same "pre-split" shape Baptism started in: a `#myGroupsBox` (the viewer's own group history) sits stacked above the admin management table, both always visible together for admins. So Phase 3 is largely the same shape of change as Phase 2 — split into sub-tabs, extend access to members — but Groups carries substantially more complexity than Baptism did: `admin/my-profile.html`'s Groups panel also has a self-service "withdraw from my group" action, and a full 4-tab group-leader toolkit (description/roster/attendance/email) for anyone who leads a group, matched by email rather than any admin role. Porting that toolkit isn't a drop-in — it depends on CSS (`css/dashboard-shell.css`'s `.gd-tabs`/`.img-picker`, `css/portal.css`'s single-class `.btn-primary`) that doesn't exist in `dashboard.html` and would collide if loaded as-is. Scott confirmed this phase should stay scoped the same way Baptism was — just make the existing personal/admin views reachable — leaving the leader toolkit and self-service withdraw on `my-profile.html` for a later sub-project.

## Scope

1. **Role access**: add `'groups'` to `ROLE_TABS.member` and `ROLE_TABS.event_manager` in `admin/dashboard.html` (`ROLE_TABS.admin` already has it).
2. **Sub-tab split**: `panelGroups` gets a "My Groups" / "Manage Groups" switcher, matching the shipped Baptism pattern exactly (same CSS classes, same hidden-for-non-admins behavior, same "defaults to mine, even for admins" behavior). "My Groups" content is the existing `#myGroupsBox` (populated by the existing, role-agnostic `renderMyGroupsCard()` — no changes needed to that function). "Manage Groups" content is the existing action-bar (filters + Email All Leaders/Email History/Add Group buttons) + the groups table — wrapped in one container so it can be hidden/shown in one line, admin-only.
3. **"Not yet in a group" invitation**: `MemberDashboard.renderGroupHistory()` (`js/member-dashboard.js`, shared by both `#myGroupsBox` and `my-profile.html`'s Groups panel) currently shows a bare "No group history yet." when a member has no group membership rows. Add a short "why we do small groups" line plus a link to `small-groups.html`, using the `.jp-cta` class already established elsewhere in this file for exactly this "empty milestone + call to action" pattern (Growth Track's assessment CTAs).
4. **Stage click-through**: add `onFilledClick: () => switchTab('groups')` to `renderJourneyPanel()`'s options object in `admin/dashboard.html`, mirroring what `admin/my-profile.html` already does and what Phase 2 did for `onFoundClick`.

Explicitly out of scope (deferred):
- Porting the group-leader 4-tab toolkit (Description/Members/Attendance/Email) from `admin/my-profile.html` into `dashboard.html` — group leaders continue to manage their group only via `my-profile.html`, reachable through the "Full Profile" bridge link.
- Porting the member's self-service "Withdraw from Group" action — stays on `my-profile.html` only.
- Any change to `group_memberships`' RLS policy (see "A separate, noted risk" below) — flagged for awareness, not addressed by this phase.
- `admin/my-profile.html` itself is untouched.

## Design

### 1. `ROLE_TABS` additions (`admin/dashboard.html`)

```js
const ROLE_TABS = {
  admin:         [...existing tabs, already includes 'groups'...],
  event_manager: ['events','sermons','email','journey','baptism','groups'],
  member:        ['journey','baptism','groups'],
};
```

### 2. Sub-tab split (`panelGroups` HTML + `renderGroupsTable()`)

Following the Baptism precedent exactly:

```html
<div class="tab-panel" id="panelGroups">
  <div id="groupsSubTabs" style="display:none; gap:8px; margin-bottom:20px;">
    <button class="btn btn-sm" id="groupsSubTabMine" onclick="switchGroupsSubTab('mine')">My Groups</button>
    <button class="btn btn-sm" id="groupsSubTabManage" onclick="switchGroupsSubTab('manage')">Manage Groups</button>
  </div>
  <div id="myGroupsBox"></div>
  <div id="groupsAdminSection">
    <!-- existing action-bar + table-wrap, unchanged -->
  </div>
</div>
```

```js
function switchGroupsSubTab(which) {
  const isMine = which === 'mine';
  document.getElementById('myGroupsBox').style.display = isMine ? '' : 'none';
  document.getElementById('groupsAdminSection').style.display = isMine ? 'none' : '';
  const mineBtn = document.getElementById('groupsSubTabMine'), manageBtn = document.getElementById('groupsSubTabManage');
  mineBtn.classList.toggle('btn-primary', isMine); mineBtn.classList.toggle('btn-ghost', !isMine);
  manageBtn.classList.toggle('btn-primary', !isMine); manageBtn.classList.toggle('btn-ghost', isMine);
}
```

`renderGroupsTable()` (the tab's `switchTab('groups')` handler) gains the same shape `renderBaptismTab()` has: call `renderMyGroupsCard()` unconditionally, show/hide `#groupsSubTabs` and default to 'mine' via `switchGroupsSubTab('mine')`, then `if (!isAdmin()) return;` before the admin-only fetch (`SupaDB.adminGetAllGroups()` + `SupaDB.getSemesters()` + filter application) and table population.

### 3. "Not yet in a group" invitation (`js/member-dashboard.js`, `renderGroupHistory()`)

Current empty state:
```js
if (!rows.length) { containerEl.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;">No group history yet.</p>'; return; }
```

New empty state (exact copy TBD at implementation time, matching the tone of Growth Track's existing CTAs):
```js
if (!rows.length) {
  containerEl.innerHTML = `
    <p class="jp-empty">Not in a small group yet — that's where a lot of life change happens, through real relationships with people who'll walk with you.</p>
    <a href="small-groups.html" class="jp-cta">See what groups are available →</a>`;
  return;
}
```

This function is shared by both `#myGroupsBox` (dashboard.html) and `my-profile.html`'s Groups panel, so the fix applies to both call sites with one change, same as the Baptism label fix did.

### 4. Stage click-through (`admin/dashboard.html`, `renderJourneyPanel()`)

```js
function renderJourneyPanel() {
  MemberDashboard.renderJourneyPipeline(document.getElementById('journeyPipelineBox'), {
    ...existing options...,
    onFoundClick: () => switchTab('baptism'),
    onFilledClick: () => switchTab('groups'),
  });
}
```

## A separate, noted risk (not addressed by this phase)

`group_memberships`' RLS policy (`supabase/member-dashboard-schema.sql`) is `for all using (auth.role() = 'authenticated')` — any logged-in user can read or write any row at the database level; the admin/personal split is enforced entirely by explicit `.eq(...)` filters in client code, not by RLS. This differs from Baptism's `person_milestones`, which has real per-person RLS scoping backing the UI hiding. Until every member could reach `dashboard.html` (Phase 1) this was low-risk since only staff ever loaded the page; it's worth tightening now that everyone does, but that's a database migration independent of this phase's UI work.

## Data flow

```
Plain member logs into admin/dashboard.html
  → ROLE_TABS.member now includes 'groups'
  → sidebar shows a Small Groups link (previously hidden for this role)
  → clicking it, OR clicking "Filled" on My Journey, opens panelGroups
  → renderGroupsTable() runs:
      - renderMyGroupsCard() always renders (existing, unchanged, role-agnostic)
      - groupsSubTabs hidden, admin section hidden, admin-only fetch skipped
  → member sees only their own group history (or the new "not yet" CTA),
    same content an admin sees for themselves today
```

## Testing / rollout

Same constraints as prior phases: no automated test suite, no admin credentials — verify via reading deployed source and asking Scott to click through as a plain member, an admin, and an event_manager on staging. Specifically confirm: (a) a plain member with no group sees the new invitation + link to `small-groups.html`, (b) a plain member currently in a group sees their own group history only, no admin controls, (c) an admin's Groups tab defaults to "My Groups" and can switch to "Manage Groups" exactly as Baptism's tab does, (d) clicking "Filled" on My Journey opens the Groups tab, (e) `my-profile.html`'s Groups panel (leader tools, withdraw) is unaffected. Production only after staging is verified and Scott explicitly approves, per the standing deployment rule in `CLAUDE.md`.
