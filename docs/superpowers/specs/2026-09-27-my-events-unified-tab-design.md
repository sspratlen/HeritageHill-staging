# My Events in the Unified Dashboard — Design

## Motivation

Second sub-project in the effort to fully retire `admin/my-profile.html`. `admin/my-profile.html` has a "My Events" panel for anyone assigned as an event's leader (matched by `event.leaderEmail`, independent of any dashboard role) — a list of their events, each opening a modal with an editable Description tab (time/location/description + a 3-way photo picker) and a Sign-Ups tab (RSVP list with remove).

Investigation found this is materially bigger than the Baptism/Groups/Growth Track/Impact Teams precedent: unlike those, `admin/dashboard.html`'s Events tab has **no existing personal-status box at all** (no `#myEventsBox` equivalent to extend — it's pure admin/event_manager CRUD over every event), and the editable Description tab depends on `.gd-tabs` (dashboard.html doesn't load `dashboard-shell.css`, so this class doesn't exist there) and a `.modal-full` near-full-screen size dashboard.html has no equivalent of. This puts the *editing* half of "My Events" in the same complexity class as the deferred group-leader toolkit — genuinely new modal/tab infrastructure, not a small extension of something that already exists.

The Sign-Ups half is a different story. Dashboard.html already has its own fully-working, admin-triggered `openEventSignupsModal(eventId)` / `removeEventSignup(eventId, rsvpId)` (reusing `SupaDB.getRsvpsForEvent`/`deleteEventRsvp`, exactly the same functions my-profile.html's version calls) — and neither has any admin-only check baked in beyond which UI button reaches them. That modal can be reused **as-is** for a leader viewing their own event's sign-ups, at zero new CSS/JS cost.

So this sub-project splits the same way Groups did: ship the safe, cheap part now (the list, plus Sign-Ups viewing via the existing modal), and fold the editing part (photo/time/location/description — the actual "toolkit"-shaped work) into a later sub-project alongside the already-deferred group-leader toolkit. This keeps the retirement roadmap honest: my-profile.html's event-editing capability isn't ported yet, and my-profile.html isn't safe to delete until it is — that's explicitly still open, not silently dropped.

## Scope

1. **Role access**: add `'events'` to `ROLE_TABS.member` and `ROLE_TABS.event_manager` (event_manager already manages all events as an admin-equivalent for that tab, so this doesn't change their access — only `member` actually gains anything new here).
2. **Sub-tab split**: `panelEvents` gets a "My Events" / "Manage Events" switcher, matching the shipped Baptism/Groups/Growth Track/Impact Teams pattern. "Manage Events" is the existing action-bar + table, admin/event_manager-only (gated the same way, but note: unlike the other four tabs this gate is `isAdmin() || isEventManager()`-shaped, since event_manager already has full Events access today — confirm the exact existing gate condition when implementing, don't assume it's a bare `isAdmin()` check like the other four). "My Events" is a **new** `#myEventsBox`, listing only events where `leaderEmail` matches the viewer's own email.
3. **"My Events" list content**: each row shows the event's title and date, plus a "View Sign-Ups" button that calls the **existing** `openEventSignupsModal(eventId)` directly — no new modal, no new CSS, this is a straight reuse.
4. **Empty state**: "You are not leading any events yet." (matches `my-profile.html`'s existing wording), no CTA link (same reasoning as Impact Teams — event-leader status is admin-assigned, there's nothing self-service to link to).

Explicitly out of scope (deferred to a later sub-project, alongside the group-leader toolkit):
- Editing an event's photo/time/location/description from the dashboard (the `.gd-tabs`/`.modal-full`-dependent half of `my-profile.html`'s current My Events panel).
- Any change to `admin/my-profile.html` itself, which keeps its full My Events panel (list + edit + sign-ups) working exactly as today.
- Any change to `event_rsvps`' RLS policy (`for all using (auth.role() = 'authenticated')` — same wide-open shape already flagged for `group_memberships`/`growth_track_registrations`/`impact_team_memberships`; `getRsvpsForEvent`/`deleteEventRsvp` are reused as-is, unchanged).

## Design

### 1. `ROLE_TABS` additions (`admin/dashboard.html`)

```js
const ROLE_TABS = {
  admin:         [...existing tabs, already includes 'events'...],
  event_manager: [...existing tabs, already includes 'events'...],
  member:        ['journey','baptism','groups','growthtrack','impactteams','events','myinfo'],
};
```

(Only `member` actually changes — `event_manager` already has `'events'`.)

### 2. Sub-tab split (`panelEvents` HTML + `renderEventsTable()`)

Same shape as Baptism/Groups/Growth Track/Impact Teams:

```html
<div class="tab-panel" id="panelEvents">
  <div id="eventsSubTabs" style="display:none; gap:8px; margin-bottom:20px;">
    <button class="btn btn-sm" id="eventsSubTabMine" onclick="switchEventsSubTab('mine')">My Events</button>
    <button class="btn btn-sm" id="eventsSubTabManage" onclick="switchEventsSubTab('manage')">Manage Events</button>
  </div>
  <div id="myEventsBox"></div>
  <div id="eventsAdminSection">
    <!-- existing action-bar + table-wrap, unchanged -->
  </div>
</div>
```

`switchEventsSubTab(which)` — identical shape to `switchGroupsSubTab`/`switchGrowthtrackSubTab`/`switchImpactteamsSubTab`, toggling `#myEventsBox`/`#eventsAdminSection` display and the two buttons' `.btn-primary`/`.btn-ghost` classes.

`renderEventsTable()` gains: call a new `renderMyEventsCard()` unconditionally first, show/hide `#eventsSubTabs` based on whichever admin-or-event_manager check already gates this tab today (confirm the exact existing condition before writing the plan — implementation must read the actual code, not assume), default to 'mine', then the existing admin-only fetch/render only for admin/event_manager.

### 3. New `renderMyEventsCard()` (`admin/dashboard.html`)

```js
async function renderMyEventsCard() {
  const box = document.getElementById('myEventsBox');
  const email = (_profile.email || '').toLowerCase();
  const events = email ? (await SupaDB.adminGetAllEvents()).filter(e => e.leaderEmail && e.leaderEmail.toLowerCase() === email) : [];
  if (!events.length) {
    box.innerHTML = `<div class="table-wrap" style="padding:20px;margin-bottom:24px;"><h3 style="font-size:.95rem;margin-bottom:10px;">My Events</h3><p style="color:var(--text-muted);font-size:.9rem;">You are not leading any events yet.</p></div>`;
    return;
  }
  box.innerHTML = `<div class="table-wrap" style="padding:20px;margin-bottom:24px;"><h3 style="font-size:.95rem;margin-bottom:10px;">My Events</h3>` +
    events.map(ev => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border);">
        <span>${escapeHtml(ev.title)} <span style="color:var(--text-muted);font-size:.82rem;">${escapeHtml(ev.date)}</span></span>
        <button class="btn btn-ghost btn-sm" onclick="openEventSignupsModal(${ev.id})">View Sign-Ups</button>
      </div>`).join('') + `</div>`;
}
```

Reuses `SupaDB.adminGetAllEvents()` (already used elsewhere in this file, confirm it's the right fetch — not gated to published-only, since a leader needs to see their own event regardless of publish state) and the **existing, unmodified** `openEventSignupsModal(eventId)` — no new modal markup, no new CSS classes, no `.gd-tabs`/`.modal-full` dependency at all.

## Data flow

```
Plain member (who leads at least one event) logs into admin/dashboard.html
  → ROLE_TABS.member now includes 'events'
  → sidebar shows an Events link (previously hidden for this role)
  → opens panelEvents, defaults to "My Events"
  → renderMyEventsCard() lists their led events
  → "View Sign-Ups" opens the SAME modal admins already use for this,
    unmodified -- reads/deletes via the same SupaDB functions either way
```

## Testing / rollout

Same constraints as prior sub-projects: no automated test suite, no admin credentials — verify via reading deployed source and asking Scott to click through as a plain member who leads an event (or a temporarily-reassigned test event) on staging. Specifically confirm: (a) a plain member leading no events sees the empty-state message; (b) a plain member leading an event sees it listed, with a working "View Sign-Ups" button opening the existing modal; (c) a plain member cannot reach "Manage Events" (no switcher shown, table/admin actions inaccessible); (d) `admin/my-profile.html`'s own My Events panel (including its editing capability) is completely unaffected. Production only after staging is verified and Scott explicitly approves, per the standing deployment rule in `CLAUDE.md`.

## What's still open after this ships

`admin/my-profile.html` is **not yet safe to delete** after this sub-project — its event-editing capability (photo/time/location/description) has no dashboard.html equivalent yet. That work is deferred to land alongside the group-leader toolkit sub-project, since both need the same kind of new UI surface (a restricted, non-admin-fields-only edit form) that doesn't exist in dashboard.html today.
