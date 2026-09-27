# Unified Dashboard Shell (Phase 1 of merging admin/dashboard.html + my-profile.html) — Design

## Motivation

Scott wants `admin/dashboard.html` and `admin/my-profile.html` merged into one page, so an admin doesn't need to bounce between "manage the church" and "my own journey" as two separate destinations. Investigation found the split was deliberate (two past commits explicitly separated these to protect the admin dashboard from regression risk — colliding CSS class names between the two pages' independently-built shells, and a past decision to remove `small_group_leader` from the dashboard's role model entirely). Scott confirmed he wants to proceed with the merge anyway, understanding the rework involved.

Given the real size of a full merge (five pairs of same-named-but-different-scope panels: Baptism, Groups, Growth Track, Impact Teams, Events each have both an "admin manages everyone's" version and a "my own" version today), this is being built as a sequence of sub-projects. **This spec covers only Phase 1: the shell** — getting everyone logged into `dashboard.html`, with the two purely-personal, no-admin-equivalent pieces (My Journey, Account) working there, and a temporary bridge link to `my-profile.html` for everything not yet migrated. Later sub-projects will migrate Baptism/Groups/Growth Track/Impact Teams/Events one at a time, each adding a "My Status / Manage All" toggle inside a single unified tab, retiring the bridge link once all five are done.

## Scope

1. `admin/dashboard.html`'s auth gate stops redirecting away anyone without an admin/event_manager role (today it bounces both "no role at all" and "small_group_leader-only" people to `my-profile.html`). Everyone logs into `dashboard.html` now.
2. A new `ROLE_TABS.member` tier (empty-role default) is added, containing only `journey`, `account`, and a bridge link. `admin`/`event_manager` also gain `journey`/`account` (their own personal view), in addition to their existing admin tabs.
3. **Fix a real fail-open bug found during investigation**: the current tab-visibility fallback (`effectiveAllowed = allowed.length ? allowed : ROLE_TABS.admin`) defaults an unrecognized/empty role combination to **full admin access**. This was low-risk before only because the auth gate's redirect always fired first for anyone that could hit it — but removing that redirect (per this change) means a plain member would now genuinely reach this fallback and see the entire admin console. This must be corrected to default to `ROLE_TABS.member` instead.
4. Port `my-profile.html`'s Account panel (profile form, avatar upload, password change — 6 JS functions) and the self-registration/pending-approval flow (`createMyProfile()`, `pendingBanner`) into `admin/dashboard.html`.
5. Port the already-built My Journey panel (`renderJourneyPipeline`, already extended with stage-click callbacks in a prior feature) into `admin/dashboard.html`, fetching the current user's own personal data (mirroring `my-profile.html`'s existing `Promise.all` block) — dashboard.html currently only fetches admin-wide, all-members data, never "data about the person currently logged in."
6. A "Full Profile" bridge nav link, visible to everyone, pointing at `my-profile.html` — plain external navigation (not a `switchTab`-managed tab), for Baptism/Groups/Growth Track/Impact Teams/Events until later sub-projects migrate them.

Explicitly out of scope (deferred to later sub-projects):
- Any merge of Baptism/Groups/Growth Track/Impact Teams/Events — these stay exactly as they are today on both pages; the bridge link is how anyone reaches the not-yet-migrated ones from the new unified dashboard.
- Retiring `admin/my-profile.html` itself — it keeps working exactly as-is and stays linked from the bridge; nothing currently pointing at it (public-page avatar links, the dashboard's own topbar avatar) changes in this phase.
- Any CSS unification beyond what's needed to avoid collisions — `my-profile.html`'s shell CSS (`css/dashboard-shell.css`, `css/portal.css`) is simply never loaded on the merged page; `dashboard.html`'s own existing, already-stable inline shell styles are reused for the new panels.

## Design

### 1. Auth gate rewrite (`admin/dashboard.html`'s post-login IIFE)

Remove the `if (!roleData || (roleList.length === 1 && roleList[0] === 'small_group_leader')) { redirect }` block entirely. Everyone who has a session proceeds. Add the self-registration fallback (mirroring `my-profile.html`):

```js
const roleData = await SupaDB.getUserRoleByEmail(user.email);
window._userRoles = (roleData && roleData.roles) || [];
window._currentUserName = (roleData && roleData.displayName) ? roleData.displayName : '';

_profile = await SupaDB.getMyProfile();
if (!_profile) {
  const r = await SupaDB.createMyProfile();
  if (!r.error) _profile = await SupaDB.getMyProfile();
}
if (!_profile) { alert('Could not load your profile. Please try again.'); return; }
if (_profile.status === 'pending' && !roleData) document.getElementById('pendingBanner').style.display = '';
```

The existing force-password-change modal logic stays, gated on `roleData` exactly as today (a plain member never has `forcePasswordChange` set, so this is a no-op for them).

### 2. Shared "allowed tabs" helper + the fail-open fix

Currently, the "which tabs can this person see" computation is duplicated three times (`applyRoleVisibility`, `switchTab`, the auth-guard IIFE), and all three fall back to `ROLE_TABS.admin` when the computed set is empty. Factor this into one function and fix the fallback:

```js
function getAllowedTabs() {
  if (isAdmin()) return ROLE_TABS.admin;
  const union = Array.from(new Set((window._userRoles || []).flatMap(r => ROLE_TABS[r] || [])));
  return union.length ? union : ROLE_TABS.member;
}
```

All three existing call sites (`applyRoleVisibility`'s `allowed`/`effectiveAllowed`, `switchTab`'s `allowed`/`effectiveAllowed`, and the auth-guard IIFE's `allowed`/`effectiveAllowed`) are replaced with a single call to `getAllowedTabs()`.

### 3. `ROLE_TABS` additions

```js
const ROLE_TABS = {
  admin:         [...existing 18 tabs..., 'journey', 'account'],
  event_manager: ['events','sermons','email', 'journey', 'account'],
  member:        ['journey', 'account'],
};
```

`ALL_TABS` gains `'journey'` and `'account'` too (needed by `switchTab`'s hide-all-panels loop). The bridge link is NOT part of any tab list — it's a plain `<a href="my-profile.html">`, always visible in the sidebar regardless of role, never gated by `getAllowedTabs()`.

### 4. New sidebar nav items + panels

Two new nav items (`sideJourney`/`sideAccount`, matching the existing `side<Name>`/`panel<Name>` ID convention `switchTab` already relies on) are added to `dashboard.html`'s sidebar, plus the always-visible bridge link. Two new `<div class="tab-panel" id="panelJourney">` / `id="panelAccount">` panels are added, using `dashboard.html`'s own existing tab-panel/modal styling (not `my-profile.html`'s shell classes).

`panelAccount`'s content is `my-profile.html`'s Account panel HTML, ported as-is (profile form, avatar upload, password change) — same field IDs, same structure, so its six existing JS functions (`saveProfile`, `changePassword`, `renderAvatarPreview`, `handleAvatarFile`, `saveAvatar`, `removeAvatar`) can be ported with no logic changes, only relocated into `dashboard.html`.

`panelJourney`'s content is a `#journeyPipelineBox` div, exactly as already built for `my-profile.html`, rendered via the already-existing `renderJourneyPanel()` function (also ported, unchanged) calling `MemberDashboard.renderJourneyPipeline()`.

### 5. Personal-data fetch for `journey`/`account`

`dashboard.html` currently fetches only admin-wide data (all members, all groups, etc.), gated behind `if (isAdmin())`. This phase adds a **separate, always-run** fetch (for every logged-in person, admin or not) mirroring `my-profile.html`'s existing `Promise.all` block — attempts, assessment content, Growth Track registrations, group memberships, semesters, impact team memberships, teams, milestones, events — populating a page-level `_journeyData` object, plus filling the Account form fields from `_profile`. This runs once at load, alongside (not instead of) the existing admin-only data loads.

### 6. `switchTab`/dispatch wiring

`switchTab`'s existing `titles` map gains `journey: 'My Journey'` and `account: 'My Info'`. Its dispatch chain gains `else if (tab==='journey') renderJourneyPanel(); else if (tab==='account') { /* nothing extra needed -- form fields are filled once at load */ }`.

### 7. Startup tab selection for non-staff

Today's auth-guard IIFE picks a start tab from `getAllowedTabs()[0]` (or a `?tab=` query param, if allowed). For a plain member, `getAllowedTabs()` now returns `['journey', 'account']`, so they land on **My Journey** by default when they visit `dashboard.html` directly — consistent with the same default already established on `my-profile.html` in the prior feature.

## Data flow

```
Any authenticated visitor → admin/dashboard.html
  → auth-guard IIFE: no more role-based redirect
  → self-registration fallback (createMyProfile if needed) + pendingBanner if applicable
  → window._userRoles set (possibly empty array)
  → getAllowedTabs(): admin/event_manager → their existing tabs + journey + account
                       everyone else       → journey + account only (member tier)
  → personal-data Promise.all always runs (journey/account data)
  → admin-only Promise.all/updateStats still gated behind isAdmin(), unchanged
  → start tab = getAllowedTabs()[0] (My Journey, for a plain member)
  → sidebar always shows a "Full Profile" bridge link to my-profile.html,
    regardless of role, for Baptism/Groups/Growth Track/Impact Teams/Events
```

## Testing / rollout

Same constraints as prior work: no automated tests, verify via reading deployed source and asking Scott to click through (no admin credentials available to Claude). Given the auth-gate rewrite touches every single login to a live, daily-use admin tool, staging verification needs to specifically cover: (a) a plain member's first-ever login (self-registration path, pending banner), (b) an existing plain member's subsequent login, (c) an admin's login (confirm they still get every existing admin tab, plus the new My Journey/Account), (d) an event_manager's login (same, scoped to their existing 3 tabs), (e) explicitly confirm the fail-open fix — a member with no roles must NOT see any admin-only tab or admin-only data under any circumstance. Only after staging is fully verified and Scott explicitly approves does this reach production, per the standing deployment rule.
