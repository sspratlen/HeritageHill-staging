# My Journey Page — Design

## Motivation

Scott wants a member-facing "My Journey" page, reachable by clicking a user's own profile picture, showing their personal progress through the church's established "Found → Filled → Freed → Forged" discipleship framework (already public on `about.html`), with milestones like Baptism, Membership, and each Assessment (DISC, Spiritual Gifts) shown individually.

Investigation found this is mostly already built: `MemberDashboard.renderJourneyPipeline()` (`js/member-dashboard.js:184-330`) is a fully-working 4-column journey visual with real data — baptism, membership, small groups, Growth Track history, DISC/Gifts results (each shown separately, satisfying "individually"), Impact Teams — already used on the *admin's* per-member view (`admin/member-dashboard.html`). It has never been pointed at a member's own profile. `admin/my-profile.html` already fetches every piece of data this component needs (`_journeyData`, populated once at load for its four existing separate panels) — so this is substantially a wiring task, not new data plumbing.

## Scope

1. Add a new "My Journey" nav item to `admin/my-profile.html`, positioned above the existing "Found" stage section, becoming the new default/active panel on load.
2. Render it via `MemberDashboard.renderJourneyPipeline()`, using data already in `_journeyData`/`_profile` — no new queries.
3. Extend `renderJourneyPipeline` with four new **optional** stage-click callbacks so each stage header can jump to its corresponding detailed panel (Found→Baptism, Filled→Small Groups, Freed→Growth Track, Forged→Impact Teams).
4. `my-profile.html` wires those callbacks to its existing `switchPanel(...)` function.

Explicitly out of scope:
- No changes to `admin/member-dashboard.html`'s existing call to `renderJourneyPipeline` (the new callbacks are optional; it simply won't pass them, so its stage headers stay non-clickable exactly as today).
- No changes to avatar-click destination logic anywhere (`js/main.js`'s `renderNavAvatar()`, `admin/dashboard.html`'s topbar avatar link) — both already send non-staff members to `my-profile.html`, and since My Journey becomes the new default panel there, clicking the profile picture already lands on it with zero code changes needed.
- The existing Baptism, Events, Small Groups, Growth Track, Impact Teams, and Account panels are unchanged — My Journey is purely additive, confirmed with Scott.
- No new milestone data, no schema changes — this is a read/display-only feature over existing data.

## Design

### Nav + panel structure (`admin/my-profile.html`)

A new plain (non-stage) nav section is added at the very top of the sidebar, above `#navFound`:

```html
<div class="nav-section">
  <a href="#" id="navJourney" class="active nav-sub" onclick="switchPanel('journey')">My Journey</a>
</div>
```

The existing `class="active nav-sub"` is removed from the Baptism nav item (`#navBaptism`) — Baptism stays in the list, just no longer pre-selected.

A new panel is added to `.shell-content`, marked active by default (with the existing Baptism panel's `active` class removed the same way):

```html
<div class="shell-panel active" id="panelJourney">
  <div id="journeyPipelineBox"></div>
</div>
```

`PANELS`/`PANEL_TITLES` (`admin/my-profile.html:206-207`) gain a `'journey'` entry (`'My Journey'`), added first.

### Rendering (`admin/my-profile.html`, a new `renderJourneyPanel()` function)

Called once alongside the existing `renderBaptismPanel()`/`renderEventsPanel()`/etc. calls after `_journeyData` is populated:

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
    onFoundClick: () => switchPanel('baptism'),
    onFilledClick: () => switchPanel('groups'),
    onFreedClick: () => switchPanel('growthtrack'),
    onForgedClick: () => switchPanel('impactteams'),
  });
}
```

Every field on the right-hand side already exists in `_journeyData`/`_profile` today (confirmed against `admin/my-profile.html`'s existing data-load block and its other panel-render functions, which use the identical field names) — this is a direct reuse, not new plumbing. `assessmentCtaHrefs` matches the exact relative paths already used by `renderGrowthTrackPanel`.

### Shared component change (`js/member-dashboard.js`, `renderJourneyPipeline`)

After the existing post-render step that fills in `#jpDiscResult`/`#jpGiftsResult`, add a new, backward-compatible step: for each of the four `.jp-stage-head` elements (in DOM order: Found, Filled, Freed, Forged), if the corresponding `opts.on<Stage>Click` callback was provided, make that stage's header clickable (`cursor: pointer`, an attached click listener). If a callback isn't provided (as `admin/member-dashboard.html`'s existing call won't provide one), that stage head is left exactly as it renders today — plain, non-interactive text.

### Data flow

```
my-profile.html page load
  → existing Promise.all fetch (unchanged) populates _journeyData
  → renderBaptismPanel(); renderEventsPanel(); renderGroupsPanel();
    renderGrowthTrackPanel(); renderImpactTeamsPanel();
    renderJourneyPanel()   [NEW — added to this existing call sequence]
      → MemberDashboard.renderJourneyPipeline(box, {...built from _journeyData...})
        → renders the 4-column grid (unchanged rendering logic)
        → NEW: wires stage-head click → switchPanel('baptism'|'groups'|'growthtrack'|'impactteams')

User clicks their profile picture (any page, or the admin topbar)
  → unchanged: lands on my-profile.html
  → NEW: default-active panel is now "My Journey" instead of "Baptism"
```

## Testing / rollout

Same constraints as prior work: no automated tests, verify via reading deployed source and asking Scott to click through (no admin credentials available to Claude). Staging first: click through as both a plain member and a staff member, confirm the pipeline renders with real data (baptism, membership, groups, Growth Track, DISC/Gifts results shown individually, Impact Teams), confirm each stage header navigates to the right panel, and confirm `admin/member-dashboard.html`'s existing admin-viewing-someone-else view is visually and functionally unchanged (stage headers still non-clickable there). Production only after staging is verified and Scott explicitly approves.
