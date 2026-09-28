# My Journey Treasure Map — Design

## Motivation

Scott wants the My Journey tab in `admin/dashboard.html` to look like a treasure map: a trail with a dot for each milestone (Baptism, Membership, etc.) instead of the current 4-column Found/Filled/Freed/Forged card grid. Mockups were reviewed in the brainstorming session. Scott chose a winding left-to-right trail for desktop ("option A") and a vertical scroll-style trail for mobile ("option B").

The map is meant as a way to get around, not only a progress report. Every dot is clickable for every user, whether or not they've done that step, and it opens that milestone's tab in the left sidebar. Users can do steps in any order, so the map has no "you are here" marker and no required sequence.

## Scope

1. Replace the journey pipeline grid in `panelJourney` with the treasure map, drawn by a new standalone renderer.
2. Move the My Info cards (profile form, avatar, password) out of `panelJourney` into their own `myinfo` tab. Scott confirmed this deliberately reverses the earlier fold-in (commit `25f4695`). The map's "Base camp" spot opens this tab.
3. Each milestone dot routes to its sidebar tab, falling back to the matching `admin/my-profile.html` panel while the viewer's role can't reach that tab yet.

Out of scope:
- **The "not yet done → invitation" state on each tab.** Scott's requirement: a user who hasn't done a step still gets a useful page. For example, someone not in or leading a small group sees why we do small groups, plus a link to `small-groups.html` to find one. This belongs to each tab's personal view, which the parallel "Heritage Hill Web Work" session is building one tab per phase (Groups, Growth Track, Impact Teams, Events; Baptism already shipped in `8c4f985` and needs a small follow-up). That requirement was passed to that session on 2026-09-27.
- `admin/member-dashboard.html` (an admin viewing someone else's journey) keeps `MemberDashboard.renderJourneyPipeline` unchanged.
- No schema changes and no new queries. The map reads only data `loadMyJourneyData()` already loads.

## Design

### Milestones (trail order)

| # | Stop | Stage | Done when | Opens tab |
|---|---|---|---|---|
| 0 | Base camp (tent icon) | — | n/a, always neutral | `myinfo` |
| 1 | Baptism | Found | `_journeyData.baptism` has `achievedAt` | `baptism` |
| 2 | Membership | Found | `_profile.memberSince` set | `people` (members without access fall back to `myinfo`, since `my-profile.html` has no membership panel) |
| 3 | Small group | Filled | any active (no `leftAt`) group membership, or leads any group (`leaderEmail` matches) | `groups` |
| 4 | Plant | Freed | Growth Track `about_us` registration with `attended` | `growthtrack` |
| 5 | Discover | Freed | `about_you` attended | `growthtrack` |
| 6 | Grow | Freed | `get_involved` attended | `growthtrack` |
| 7 | DISC | Freed | `discAttempts.length > 0` | `growthtrack` |
| 8 | Spiritual gifts | Freed | `giftsAttempts.length > 0` | `growthtrack` |
| 9 | Impact team | Forged | any active team membership | `impactteams` |
| X | Serving (the "treasure", drawn as a red X) | Forged | trained on any active team, or leads a team or a small group | `impactteams` |

"Done" uses the same rules `renderJourneyPipeline` uses today (active = no `leftAt`, Growth Track attended beats registered), so the map and the admin view never disagree.

### Visual language

- White map background with a double-rule border. Also a compass rose, a few hill and wave doodles, and the title "<First name>'s journey" in bold sans-serif.
- Stage headers (Found, Filled, Freed, Forged) match the sidebar's own stage header: a small numbered circle (01-04) plus a bold name and an italic verse caption underneath (e.g. "01 Found / by God"), on both desktop and mobile.
- **Completed stop:** a solid amber "seal" dot (the site's `--primary`). **Not yet done:** a hollow, dashed-outline dot. The X gets the same treatment, amber when done and faded ink when not.
- **Trail:** each segment is solid amber dashes if the stop it leads *into* is done, otherwise faded dotted ink. There's no "you are here" marker, because steps can be done in any order.
- Each dot has a text label under or beside it. The whole dot and label is the click and tap target, at least 32px.
- As of 2026-09-27, colors and font were re-themed to match the rest of the site (`admin/dashboard.html`'s `--primary`/`--text`/`--text-muted`/`--border`/`--bg`/`--bg-card` tokens and its `DM Sans` body font) instead of the original fixed parchment/serif treasure-map look — see `JourneyMap.C` in `js/journey-map.js` for the exact values. They're kept as literal hex rather than `var(--x)`, since this module has no dependency on which page embeds it (the standalone preview page doesn't load the dashboard's stylesheet).

### Layouts

- **Desktop (container wider than 640px):** a winding left-to-right trail (mockup A). It's a fixed-coordinate SVG with `viewBox="0 0 680 320"` that scales to the container width.
- **Mobile (640px or narrower):** a vertical scroll (mockup B). The trail snakes down, labels sit on alternating sides, and the scroll ends are drawn at top and bottom. Its height depends on the number of stops.
- The renderer checks the container width on render and re-renders on `resize`, debounced 150ms, only when the layout actually changes.

### Components

**`js/journey-map.js`** exposes a global `JourneyMap` with:
- `STOPS`: the milestone table above, as data (`key`, `label`, `stage`, `tab`, `profilePanel`).
- `computeStatus(data)` → `{ baptism: true, membership: false, ... }`, a pure function of the data object.
- `render(containerEl, data, opts)` draws the SVG. `data` has the same fields `renderJourneyPanel` passes today (`memberSince`, `baptizedAt`, `groupMemberships`, `groups`, `email`, `gtRegistrations`, `discAttemptCount`, `giftsAttemptCount`, `teamMemberships`, `teams`) plus `firstName` (the first word of `_profile`'s full name). `opts.onStopClick(stop)` is called when a dot is clicked.

**`css/journey-map.css`** holds the map container, hover and focus states for dots (cursor, focus ring), and label typography.

**`admin/dashboard.html`** changes:
- `panelJourney` contains only `<div id="journeyMapBox"></div>`.
- A new `panelMyinfo` holds the three My Info cards, moved without changes. Their IDs and handlers stay the same. `loadMyJourneyData()` already fills the form at page load, so `myinfo` needs no render branch in `switchTab`.
- A new `myinfo` entry is added to every tier of `ROLE_TABS`, to `ALL_TABS`, to the `switchTab` titles (`'My Info'`). A new sidebar link `#sideMyinfo` goes directly under My Journey.
- `renderJourneyPanel()` calls `JourneyMap.render(...)` with `onStopClick`:
  ```js
  stop => canAccessTab(stop.tab)
    ? switchTab(stop.tab)
    : location.href = 'my-profile.html#' + stop.profilePanel
  ```
  `canAccessTab(tab)` is `getAllowedTabs().includes(tab)`, the same check `switchTab` already uses to block tabs. The IDs `panelMyinfo`/`sideMyinfo` follow the existing `switchTab` naming rule, which capitalizes only the first letter. Because of this, when the other session adds a tab to `ROLE_TABS.member`, those dots switch from the fallback to the real tab with no map changes. `my-profile.html` does not read the URL hash today, so add a small hash read on load: if `location.hash` names an entry in its `PANELS` array, call `switchPanel` with it.
- The existing `onFoundClick` option passed to `renderJourneyPipeline` goes away along with that call.

### Error handling

- If `_journeyData` failed to load, the existing error path still applies. The map renders with every stop not done, and all dots stay clickable, instead of showing a blank panel.
- Missing `firstName` → the title falls back to "Your journey".

## Coordination

The "Heritage Hill Web Work" session is making ongoing, phased edits to `admin/dashboard.html` (`ROLE_TABS`, `ALL_TABS`, tab renderers). Before committing the `panelJourney`/`renderJourneyPanel` replacement, send that session a heads-up so it can time its merges. Textual conflicts in `ROLE_TABS`/`ALL_TABS` are expected and resolved normally.

## Testing / rollout

No automated tests and no admin credentials, per CLAUDE.md. Verify by:
1. Opening the map locally in the built-in browser with stubbed data at desktop and 375px widths. Check both layouts, several done/not-done combinations, and that clicks call the handler.
2. After the staging push, `curl` the deployed `dashboard.html`/`journey-map.js` to confirm what shipped.
3. Scott clicks through staging as a plain member and as an admin, on desktop and on a phone. He checks that real milestones match, each dot lands on the right tab or the `my-profile.html` fallback, and Base camp opens My Info with the form working.

Production only after staging is verified and Scott explicitly approves.
