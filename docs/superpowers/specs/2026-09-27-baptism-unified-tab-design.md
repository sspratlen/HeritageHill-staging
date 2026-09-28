# Baptism Unified Tab (Phase 2 of merging admin/dashboard.html + my-profile.html) — Design

## Motivation

Phase 1 (shipped to staging) merged the purely-personal, no-admin-equivalent parts of `admin/my-profile.html` (My Journey, My Info) into `admin/dashboard.html`, leaving a "Full Profile" bridge link for everything not yet migrated: Baptism, Small Groups, Growth Track, Impact Teams, Events. Scott chose Baptism as the first of these five to migrate, since it's the simplest (one milestone, one small admin table, no pagination/filters/bulk actions).

Investigation found `admin/dashboard.html`'s existing admin-only Baptism tab already stacks an admin's own personal status card (`#myBaptismBox`, via `renderMyBaptismCard()`) above the "manage everyone" tables — it already shows both "my status" and "manage all" on one page for admins, just not as an explicit toggle. So Phase 2 isn't a port of `my-profile.html`'s Baptism panel into a new merged UI; it's making the *same, already-working* admin tab reachable for plain members too, with its admin-only sections hidden for them.

## Scope

1. **Bug fix, unrelated file but noticed along the way**: `js/member-dashboard.js`'s `renderBaptismCard()` (used only by `admin/my-profile.html`'s Baptism panel) titles its card "Attendance" instead of "Baptism" — a copy-paste leftover from the pattern it was adapted from. Fix the label text only.
2. **Role access**: add `'baptism'` to `ROLE_TABS.member` and `ROLE_TABS.event_manager` in `admin/dashboard.html` (`ROLE_TABS.admin` already has it). This makes the sidebar's Baptism link and `panelBaptism` reachable for everyone, not just admins.
3. **Gate the admin-only markup** inside `renderBaptismTab()`: the action-bar's "Record Baptism" button, both table-wraps (baptized list, not-yet-baptized list), wrapped in an `isAdmin()` check. A plain member then sees only their own `#myBaptismBox` status card — reusing the exact render path (`renderMyBaptismCard()` / `getMyJourneyData()`) admins already see for themselves today. No new render function, no porting from `my-profile.html`.
4. **Stage click-through**: add `onFoundClick: () => switchTab('baptism')` to `renderJourneyPanel()`'s options object in `admin/dashboard.html`, mirroring what `admin/my-profile.html` already does for its own My Journey panel, so clicking the "Found" stage header on the pipeline takes a member to their baptism status.

Explicitly out of scope (deferred):
- `admin/my-profile.html` itself is untouched beyond the one-line label fix — it keeps working exactly as-is and stays linked from the "Full Profile" bridge until all five sub-projects are done.
- No convergence of the three existing personal-baptism code paths (`renderMyBaptismCard`/`getMyJourneyData`/`_myJourneyCache` in dashboard.html's Baptism tab vs. `renderJourneyPanel`/`_journeyData` in dashboard.html's My Journey tab vs. `MemberDashboard.renderBaptismCard` used by my-profile.html). All three continue to read the same underlying `person_milestones` row independently; unifying them is real cleanup debt but a separate, later concern.
- No changes to the `person_milestones` data model, RLS policies, or any `SupaDB.*` function.
- No changes to Small Groups / Growth Track / Impact Teams / Events — those remain future sub-projects, reachable only via the "Full Profile" bridge until their own turn.

## Design

### 1. Label fix (`js/member-dashboard.js`)

`renderBaptismCard()`'s card currently opens with:
```js
<div class="jp-label">Attendance</div>
```
Change to:
```js
<div class="jp-label">Baptism</div>
```
This is the only change to this function. `admin/my-profile.html`'s Baptism panel is the sole caller, so this is the only place the fix is visible.

### 2. `ROLE_TABS` additions (`admin/dashboard.html`)

```js
const ROLE_TABS = {
  admin:         [...existing tabs, already includes 'baptism'...],
  event_manager: ['events','sermons','email','journey','baptism'],
  member:        ['journey','baptism'],
};
```

### 3. Gate admin-only markup inside `renderBaptismTab()`

The function currently unconditionally renders the action-bar button and both table-wraps. Wrap that block in `if (isAdmin()) { ... }`, leaving `#myBaptismBox`'s render call (`renderMyBaptismCard()`) unconditional — it already works correctly for any logged-in person, staff or not, since it reads the current user's own milestone row regardless of role.

The panel HTML itself (`panelBaptism`, admin/dashboard.html:1393-1415) does not need to change — the action-bar and table-wrap elements simply get `style.display = 'none'` (or are skipped from being populated) for non-admins, following the same `isAdmin()`-gating convention already used elsewhere in this file (e.g. the stats row in `applyRoleVisibility()`).

### 4. Stage click-through (`admin/dashboard.html`, `renderJourneyPanel()`)

```js
function renderJourneyPanel() {
  MemberDashboard.renderJourneyPipeline(document.getElementById('journeyPipelineBox'), {
    ...existing options...,
    onFoundClick: () => switchTab('baptism'),
  });
}
```

Only `onFoundClick` is added — `onFilledClick`/`onFreedClick`/`onForgedClick` stay unset for now, since Small Groups/Growth Track/Impact Teams aren't reachable inside `dashboard.html` yet (their own future sub-projects will add these one at a time, the same way this one adds `onFoundClick`).

## Data flow

```
Plain member logs into admin/dashboard.html
  → ROLE_TABS.member now includes 'baptism'
  → sidebar shows a Baptism link (previously hidden for this role)
  → clicking it, OR clicking "Found" on the My Journey pipeline, opens panelBaptism
  → renderBaptismTab() runs:
      - renderMyBaptismCard() always renders (existing, unchanged, role-agnostic)
      - admin-only action-bar/tables are skipped since isAdmin() is false
  → member sees only their own baptism status, same content/copy as an admin
    sees for themselves today
```

## Testing / rollout

Same constraints as Phase 1: no automated test suite, no admin credentials — verify via reading deployed source (`curl`) and asking Scott to click through as a plain member, an admin, and an event_manager on staging. Specifically confirm: (a) a plain member sees their own status and nothing else (no Record button, no tables, no other members' data), (b) an admin's Baptism tab is pixel-for-pixel unchanged from today, (c) clicking "Found" on My Journey correctly opens the Baptism tab for a member, (d) `admin/my-profile.html`'s Baptism panel still works, now correctly labeled "Baptism" instead of "Attendance". Production only after staging is verified and Scott explicitly approves, per the standing deployment rule in `CLAUDE.md`.
