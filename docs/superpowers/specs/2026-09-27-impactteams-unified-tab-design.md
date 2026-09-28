# Impact Teams Unified Tab (Phase 5 of merging admin/dashboard.html + my-profile.html) — Design

## Motivation

This is the last of five phases making `admin/dashboard.html`'s admin-only tabs reachable by plain members, each following the same shape: split an already-"pre-split" tab into "My X" / "Manage X" sub-tabs, reusing the existing personal-status card as-is. Investigation found `admin/dashboard.html`'s Impact Teams tab is in the exact same pre-split shape Baptism/Groups/Growth Track all started in — `#myImpactTeamsBox` (the viewer's own team membership) sits stacked above the admin management table.

Impact Teams has no leader-role/toolkit ambiguity — confirmed there's no `leaderEmail`-equivalent field or leader-scoped self-service anywhere for Impact Teams; "leader" is just a badge-only `role` value on the membership row, set by an admin. This makes it flat like Baptism/Growth Track, not like Groups.

Two things are different from every prior phase, though: **there's no public self-service page to link a not-yet-serving member to** (Impact Teams is still marked "Coming Soon" on the About page — joining is entirely admin-mediated, unlike Groups' `small-groups.html` or Growth Track's `growth-track.html`), and **dashboard.html's own personal-status card (`renderMyImpactTeamsCard()`) is a separate, hand-written implementation**, not a thin wrapper around the shared `MemberDashboard.renderImpactTeamsCard()` the way Groups' `renderMyGroupsCard()` calls the shared `renderGroupHistory()`. Scott confirmed: match the empty state to Baptism's plain "talk to a staff member" style rather than inventing a link to nowhere, and leave the two separate render implementations as they are rather than unifying them in this phase.

## Scope

1. **Role access**: add `'impactteams'` to `ROLE_TABS.member` and `ROLE_TABS.event_manager` in `admin/dashboard.html` (`ROLE_TABS.admin` already has it).
2. **Sub-tab split**: `panelImpactteams` gets a "My Impact Teams" / "Manage Impact Teams" switcher, matching the shipped Baptism/Groups/Growth Track pattern exactly. "My Impact Teams" content is the existing `#myImpactTeamsBox` (populated by the existing, role-agnostic `renderMyImpactTeamsCard()` — no logic changes needed beyond the empty-state text fix below). "Manage Impact Teams" content is the existing action-bar + table — wrapped in one container, admin-only.
3. **`renderImpactTeamsTable()` gating**: call `renderMyImpactTeamsCard()` unconditionally, show/hide the sub-tab switcher and default to 'mine', then `if (!isAdmin()) return;` before the admin-only fetch (`adminGetAllImpactTeams()`, `adminGetAllCurrentImpactTeamMembers()`) and table population.
4. **Empty-state copy fix**: update both existing "not on a team" messages (dashboard.html's `renderMyImpactTeamsCard()` and the shared `MemberDashboard.renderImpactTeamsCard()` used by `my-profile.html`) to the same plain, no-link wording — matching Baptism's "talk to a staff member" style, since there's no public page to link to. This is a copy-only change to two existing strings, not a merge of the two render implementations.

Explicitly out of scope (deferred), same shape as prior phases:
- Unifying `renderMyImpactTeamsCard()` with the shared `MemberDashboard.renderImpactTeamsCard()` — the two stay as separate implementations, per Scott's explicit choice.
- Building a public self-service Impact Teams page — that's a separate, larger feature (the About page still marks it "Coming Soon"), not part of this merge initiative.
- Any change to `impact_teams`/`impact_team_memberships`' RLS policies (see "A separate, noted risk" below).
- `admin/my-profile.html` itself is untouched beyond the shared-function's copy fix.
- No stage-click-through code — the treasure map's existing routing (`getAllowedTabs().includes(stop.tab)`) handles it once Step 1 lands, exactly as it did for Growth Track.

## Design

### 1. `ROLE_TABS` additions (`admin/dashboard.html`)

```js
const ROLE_TABS = {
  admin:         [...existing tabs, already includes 'impactteams'...],
  event_manager: ['events','sermons','email','journey','baptism','groups','growthtrack','impactteams','myinfo'],
  member:        ['journey','baptism','groups','growthtrack','impactteams','myinfo'],
};
```

(`'myinfo'` stays last in every tier.)

### 2. Sub-tab split (`panelImpactteams` HTML + `renderImpactTeamsTable()`)

Following the established precedent exactly:

```html
<div class="tab-panel" id="panelImpactteams">
  <div id="impactteamsSubTabs" style="display:none; gap:8px; margin-bottom:20px;">
    <button class="btn btn-sm" id="impactteamsSubTabMine" onclick="switchImpactteamsSubTab('mine')">My Impact Teams</button>
    <button class="btn btn-sm" id="impactteamsSubTabManage" onclick="switchImpactteamsSubTab('manage')">Manage Impact Teams</button>
  </div>
  <div id="myImpactTeamsBox"></div>
  <div id="impactteamsAdminSection">
    <!-- existing action-bar + table-wrap, unchanged -->
  </div>
</div>
```

```js
function switchImpactteamsSubTab(which) {
  const isMine = which === 'mine';
  document.getElementById('myImpactTeamsBox').style.display = isMine ? '' : 'none';
  document.getElementById('impactteamsAdminSection').style.display = isMine ? 'none' : '';
  const mineBtn = document.getElementById('impactteamsSubTabMine'), manageBtn = document.getElementById('impactteamsSubTabManage');
  mineBtn.classList.toggle('btn-primary', isMine); mineBtn.classList.toggle('btn-ghost', !isMine);
  manageBtn.classList.toggle('btn-primary', !isMine); manageBtn.classList.toggle('btn-ghost', isMine);
}
```

`renderImpactTeamsTable()` gains the same shape the other three tabs have: call `renderMyImpactTeamsCard()` unconditionally, show/hide `#impactteamsSubTabs` and default to 'mine' via `switchImpactteamsSubTab('mine')`, then `if (!isAdmin()) return;` before the admin-only fetch and everything after it.

### 3. Empty-state copy fix

`admin/dashboard.html`'s `renderMyImpactTeamsCard()` currently shows "You are not on an impact team yet." `js/member-dashboard.js`'s shared `renderImpactTeamsCard()` currently shows "Not serving on a team yet." Both change to the same wording:

```
Not serving on a team yet — talk to a staff member if you're interested.
```

No `jp-cta` link is added (there's nothing to link to).

## A separate, noted risk (not addressed by this phase)

`impact_teams`/`impact_team_memberships` share the same wide-open RLS shape already flagged for Groups' `group_memberships` and Growth Track's tables: `for all using (auth.role() = 'authenticated')` — any logged-in user can read or write any row at the database level. `impact_team_memberships` carries real PII (name/email/phone/notes) the same way. Worth tightening at some point, independent of this phase's UI work — this makes three tables sharing the exact same gap, worth a combined future cleanup rather than three separate ones.

## Data flow

```
Plain member logs into admin/dashboard.html
  → ROLE_TABS.member now includes 'impactteams'
  → sidebar shows an Impact Teams link (previously hidden for this role)
  → clicking it, OR clicking either Forged-stage stop on the My Journey
    map (Impact team / Serving), opens panelImpactteams
  → renderImpactTeamsTable() runs:
      - renderMyImpactTeamsCard() always renders (existing, unchanged
        except for the empty-state text, role-agnostic)
      - impactteamsSubTabs hidden, admin section hidden, admin-only
        fetch skipped
  → member sees only their own team membership(s), or the plain "not
    yet serving" message, same content an admin sees for themselves today
```

## Testing / rollout

Same constraints as prior phases: no automated test suite, no admin credentials — verify via reading deployed source and asking Scott to click through as a plain member, an admin, and an event_manager on staging. Specifically confirm: (a) a plain member sees only their own team status (no admin table, no other members' data), (b) a plain member on no team sees the updated plain-text message, (c) an admin's Impact Teams tab defaults to "My Impact Teams" and can switch to "Manage Impact Teams" exactly as the other three tabs already do, (d) clicking either Forged-stage stop on the My Journey map opens the Impact Teams tab directly (no more falling back to `my-profile.html`), (e) `my-profile.html`'s Impact Teams panel shows the same updated empty-state text. Production only after staging is verified and Scott explicitly approves, per the standing deployment rule in `CLAUDE.md`.

## After this phase: the initiative is complete

Once Phase 5 ships, all five of the original deferred concepts (Baptism, Small Groups, Growth Track, Impact Teams) plus the two purely-personal pieces from Phase 1 (My Journey, My Info) are reachable inside `admin/dashboard.html` for every role. Every stop on the My Journey map routes in-dashboard — none fall back to `my-profile.html#...` anymore for a member with standard access. At that point, per the original Phase 1 spec, the "Full Profile" bridge link and `admin/my-profile.html` itself become candidates for retirement — a decision for Scott to make once he's confirmed everything works end-to-end on staging, not assumed as part of this phase.
