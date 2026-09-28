# Growth Track Unified Tab (Phase 4 of merging admin/dashboard.html + my-profile.html) — Design

## Motivation

Phases 2 (Baptism) and 3 (Groups) both closed by making an already-existing, already-"pre-split" admin tab reachable by members, splitting it into "My X" / "Manage X" sub-tabs. Investigation found `admin/dashboard.html`'s Growth Track tab is in the exact same shape those two started in: `#myGrowthTrackBox` (the viewer's own registration/assessment status, via the existing role-agnostic `renderMyGrowthTrackCard()`) sits stacked above the admin-wide management UI (Plant/Discover/Grow occurrence cards with roster/attendance/cancellation tools).

Unlike Groups, Growth Track carries no leader-role/toolkit ambiguity to resolve — there's no per-class "leader" analogous to a Group's `leaderEmail`, so there's no equivalent scope question about porting a leader toolkit. The admin-side code is comparable in raw size to Groups (occurrence-date scheduling, cancellation emails, roster/attendance modals — roughly 500 lines), but flat in access model, same as Baptism. Growth Track also already has its own fully-working "not yet done" + CTA pattern for the DISC/Gifts assessments (Take/Retake links, `jp-cta`/`jp-empty` classes) and a fully public, no-login-required self-registration page (`growth-track.html`) — no new invitational copy is needed the way Groups needed one.

The Journey treasure map (shipped alongside Phase 3) routes each stop via `getAllowedTabs().includes(stop.tab) ? switchTab(stop.tab) : ...my-profile.html fallback`. Five of its stops (Plant, Discover, Grow, DISC, Spiritual Gifts) are tagged `tab: 'growthtrack'`. Once `'growthtrack'` is in `ROLE_TABS.member`, all five route in-dashboard automatically — no stage-click wiring code is needed this phase, unlike Baptism/Groups which predated the map and needed an explicit `onXClick` option (since removed along with the rest of `renderJourneyPipeline`).

## Scope

1. **Role access**: add `'growthtrack'` to `ROLE_TABS.member` and `ROLE_TABS.event_manager` in `admin/dashboard.html` (`ROLE_TABS.admin` already has it).
2. **Sub-tab split**: `panelGrowthtrack` gets a "My Growth Track" / "Manage Growth Track" switcher, matching the shipped Baptism/Groups pattern exactly. "My Growth Track" content is the existing `#myGrowthTrackBox` (populated by the existing, role-agnostic `renderMyGrowthTrackCard()` — no changes needed). "Manage Growth Track" content is the existing action-bar + `#gtCards` grid — wrapped in one container, admin-only.
3. **`renderGrowthTrackTab()` gating**: call `renderMyGrowthTrackCard()` unconditionally, show/hide the sub-tab switcher and default to 'mine', then `if (!isAdmin()) return;` before the admin-only fetch (`adminGetAllGrowthTrackParts()`, `getGrowthTrackCancellations()`, per-part registration counts) and `#gtCards` population.

Explicitly out of scope (deferred), same shape as prior phases:
- Any change to the three Growth Track tables' RLS policies (see "A separate, noted risk" below).
- `admin/my-profile.html` itself is untouched.
- No new invitational copy — Growth Track's existing "not yet taken" + Take/Retake CTA pattern (already shared via `MemberDashboard.renderGrowthTrackCard()`/`renderDiscResult()`/`renderGiftsResult()`) is reused as-is.
- No stage-click-through code — the treasure map's existing routing handles it once Step 1 lands.

## Design

### 1. `ROLE_TABS` additions (`admin/dashboard.html`)

```js
const ROLE_TABS = {
  admin:         [...existing tabs, already includes 'growthtrack'...],
  event_manager: ['events','sermons','email','journey','baptism','groups','growthtrack','myinfo'],
  member:        ['journey','baptism','groups','growthtrack','myinfo'],
};
```

(`'myinfo'` stays last in every tier, per the treasure map's own convention.)

### 2. Sub-tab split (`panelGrowthtrack` HTML + `renderGrowthTrackTab()`)

Following the Baptism/Groups precedent exactly:

```html
<div class="tab-panel" id="panelGrowthtrack">
  <div id="growthtrackSubTabs" style="display:none; gap:8px; margin-bottom:20px;">
    <button class="btn btn-sm" id="growthtrackSubTabMine" onclick="switchGrowthtrackSubTab('mine')">My Growth Track</button>
    <button class="btn btn-sm" id="growthtrackSubTabManage" onclick="switchGrowthtrackSubTab('manage')">Manage Growth Track</button>
  </div>
  <div id="myGrowthTrackBox"></div>
  <div id="growthtrackAdminSection">
    <!-- existing action-bar + #gtCards, unchanged -->
  </div>
</div>
```

```js
function switchGrowthtrackSubTab(which) {
  const isMine = which === 'mine';
  document.getElementById('myGrowthTrackBox').style.display = isMine ? '' : 'none';
  document.getElementById('growthtrackAdminSection').style.display = isMine ? 'none' : '';
  const mineBtn = document.getElementById('growthtrackSubTabMine'), manageBtn = document.getElementById('growthtrackSubTabManage');
  mineBtn.classList.toggle('btn-primary', isMine); mineBtn.classList.toggle('btn-ghost', !isMine);
  manageBtn.classList.toggle('btn-primary', !isMine); manageBtn.classList.toggle('btn-ghost', isMine);
}
```

`renderGrowthTrackTab()` gains the same shape `renderBaptismTab()`/`renderGroupsTable()` have: call `renderMyGrowthTrackCard()` unconditionally, show/hide `#growthtrackSubTabs` and default to 'mine' via `switchGrowthtrackSubTab('mine')`, then `if (!isAdmin()) return;` before the admin-only `Promise.all([adminGetAllGrowthTrackParts(), getGrowthTrackCancellations()])` fetch and everything after it.

## A separate, noted risk (not addressed by this phase)

`growth_track_registrations`, `growth_track_parts`, and `growth_track_cancellations` all share the same wide-open RLS shape already flagged for Groups' `group_memberships`: `for all using (auth.role() = 'authenticated')` — any logged-in user can read or write any row at the database level, with the admin/personal split enforced entirely by client-side `.eq(...)` filters, not RLS. `growth_track_registrations` carries real PII (name/email/phone/notes) the same way `group_memberships` does. Worth tightening at some point, independent of this phase's UI work.

## Data flow

```
Plain member logs into admin/dashboard.html
  → ROLE_TABS.member now includes 'growthtrack'
  → sidebar shows a Growth Track link (previously hidden for this role)
  → clicking it, OR clicking any of the 5 growthtrack-tagged stops on the
    My Journey map, opens panelGrowthtrack
  → renderGrowthTrackTab() runs:
      - renderMyGrowthTrackCard() always renders (existing, unchanged, role-agnostic)
      - growthtrackSubTabs hidden, admin section hidden, admin-only fetch skipped
  → member sees only their own registration history + DISC/Gifts results
    (with existing Take/Retake CTAs if not yet done), same content an
    admin sees for themselves today
```

## Testing / rollout

Same constraints as prior phases: no automated test suite, no admin credentials — verify via reading deployed source and asking Scott to click through as a plain member, an admin, and an event_manager on staging. Specifically confirm: (a) a plain member sees only their own Growth Track status (no admin cards, no other members' data), (b) an admin's Growth Track tab defaults to "My Growth Track" and can switch to "Manage Growth Track" exactly as Baptism/Groups already do, (c) clicking any of the 5 Growth-Track stops on the My Journey map opens the Growth Track tab directly (no more falling back to `my-profile.html`), (d) `my-profile.html`'s Growth Track panel is unaffected. Production only after staging is verified and Scott explicitly approves, per the standing deployment rule in `CLAUDE.md`.
