# People Backbone — Phase 4 Design Spec (Journey Funnel View)

## Purpose

Phases 1-3 built the data (identity backbone, self-updating write paths, journey milestones) but nothing renders any of it yet — `person_milestones` is invisible to every actual user of the site. This phase adds the first UI surface: a "Journey Funnel" card in the admin Analytics tab, showing how many people have reached each of the 6 milestones phase 3 tracks. This is the concrete answer to the original ask ("how can we better structure the data and the flow") — a real funnel instead of a guess, visible to an admin without touching SQL.

**Still staging only**, same reasoning as phases 1-3: this reads from `person_milestones`, which only exists on staging. Commits go to `staging` only, never `origin`.

**Read-only, additive UI.** No schema changes, no new write paths — the lowest-risk phase so far. This phase only adds a `SupaDB.adminGetMilestoneCounts()` read method and a new display section in an existing tab.

## Confirmed Decisions

- **Lands in the existing Analytics tab** (`admin/dashboard.html`, `#panelAnalytics`), not a new tab — that's already where admins look for aggregate stats (it currently shows DISC/Gifts assessment distribution), and the existing `stat-card`/`stats-row` visual pattern is reused exactly, not reinvented.
- **Shown unconditionally**, independent of the existing assessment-data empty-state gate. The current tab hides all its content behind `stats.totalApprovedMembers > 0 && (discTaken > 0 || giftsTaken > 0)` — milestone data (Growth Track registrations, group memberships) will very plausibly exist before any assessment does, so gating the funnel on assessment data would hide real, available information. The new section gets its own placement, above the existing gated content, always rendered.
- **Six stat-cards, one per milestone**, in the funnel's natural order (registration → attendance → assessments → group membership → leadership) rather than alphabetical or DB-insertion order — reads as a progression, matching the "funnel" framing.
- **Simple counts only, no percentages/dropoff-rate math this phase.** The existing DISC/Gifts stats already show a percentage-of-approved-members; milestones don't have as clean a denominator (not everyone who registers for Growth Track is an "approved member" yet, some are still guests) — showing raw counts avoids implying false precision. Dropoff-rate analysis is a reasonable future phase once there's a real base of data to make it meaningful (YAGNI for now).

## Data Source

`person_milestones` — already RLS-gated to admins (`"Admins manage all milestones" using (public.is_admin())`, from phase 3), so a straightforward admin-session `select` works without any new RLS policy.

## Implementation

### New method (`js/db.js`)

```js
async adminGetMilestoneCounts() {
  if (!db()) return {};
  try {
    const { data, error } = await db().from('person_milestones').select('milestone');
    if (error) throw error;
    const counts = {};
    (data || []).forEach(r => { counts[r.milestone] = (counts[r.milestone] || 0) + 1; });
    return counts;
  } catch(e) { console.error('[SupaDB] adminGetMilestoneCounts:', e.message); return {}; }
},
```

### New HTML section (`admin/dashboard.html`, inside `#panelAnalytics`)

A new `stats-row` of 6 `stat-card`s (same class names/inline styles as the existing DISC/Gifts pair), placed between the tab's `<h2>Assessment Analytics</h2>` action-bar and the existing `#analyticsEmpty`/`#analyticsContent` divs — so it renders regardless of whether those are shown.

### Wiring (`renderAnalyticsTab`)

Fetch `adminGetMilestoneCounts()` alongside the existing `Promise.all`, and populate the six new stat-card elements — unconditionally, before the existing `hasData` check that gates the rest of the tab.

## Verification

Same "prove the wiring, not trivial logic" approach as prior phases: query `person_milestones` directly for real counts, load the live staging Analytics tab (admin login required — see the phase-3 disclosed limitation, likely still applicable), and confirm the displayed numbers match. If admin credentials still aren't available, fall back to confirming the deployed `js/db.js`/`admin/dashboard.html` contain the expected code (same substitute used in phase 3), clearly disclosed.

## Out of Scope (YAGNI)

- No per-person "journey timeline" view yet (would live in `admin/member-dashboard.html`, a separate, larger UI task).
- No dropoff/conversion-rate percentages.
- No member-facing view of their own milestones (`my-profile.html`) — admin-only for this phase.
- No `user_roles` permission-check migration (still deferred, unrelated).
- No Impact Teams / Trainings (still no underlying tables).
