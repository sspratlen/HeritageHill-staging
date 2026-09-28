# Group-Leader Toolkit in the Unified Dashboard — Design

## Motivation

Third content sub-project in the effort to fully retire `admin/my-profile.html`. This is the last deferred piece for Groups: a non-admin group leader (matched by `group.leaderEmail`, independent of any dashboard role) currently manages their group — editing its description/photo, its roster, its attendance, and emailing its members — only from `admin/my-profile.html`'s 4-tab `groupDetailsModal`.

Investigation found this needs far less new code than it first appeared. `admin/dashboard.html`'s existing admin modals (`openGroupRoster`/roster CRUD, `openGroupAttendanceModal`/attendance CRUD, `openGroupEmailModal`/`sendGroupEmail`) have **no internal admin-only gate at all** — reading each function's actual body confirms they're pure `groupId`-parameterized calls with no `isAdmin()` check anywhere. They can be opened directly for a leader managing their own group, exactly the same reuse-without-modification pattern already used for `openEventSignupsModal()` in the My Events sub-project. The only genuinely new UI needed is a restricted Description/photo editor — the admin's `openGroupModal()`/`saveGroup()` exposes fields a leader shouldn't touch (`name`/`leaderEmail`/`type`/`audience`/`semesterId`/`published`), so that one piece needs its own narrow form and save function, mirroring `my-profile.html`'s own existing restriction.

This replaces an earlier draft of this design that planned a single new 4-tab `groupLeaderModal` reimplementing all four tabs from scratch — unnecessary once it was confirmed the three CRUD modals are already safely reusable as-is.

## Scope

1. **Entry point**: on the existing "My Groups" list (`#myGroupsBox`), each row the viewer actually leads (`m.isLeader`) gets four action buttons instead of the plain text row: **Edit Info**, **Members**, **Attendance**, **Email**.
2. **Members / Attendance / Email — verbatim reuse**: these three buttons call the existing `openGroupRoster(groupId)`, `openGroupAttendanceModal(groupId)`, `openGroupEmailModal(groupId)` directly, completely unmodified. `sendGroupEmail()` (the admin email-send function these all funnel through) already calls `SupaDB.adminSaveOutboundEmailSend()` after a successful send — so leader-sent group emails automatically appear in Email History too, satisfying Scott's decision with zero new code.
3. **New scoped fetch**: `SupaDB.getGroupsForLeader(email)` (mirrors `getEventsForLeader` exactly — server-side `.ilike('leader_email', escaped)`, wildcard-escaped, returns `[]` for no email). `renderMyGroupsCard()` calls this and populates the shared `_cachedGroups` cache with the result, so the three reused admin modals' cosmetic lookups (group name in modal titles, CSV export filename) resolve correctly for a leader — same fix already applied for events, and for the same reason (the modals read a shared cache that was previously only ever populated by the admin-gated fetch).
4. **New "Edit Info" modal**: a single-tab modal with a 3-way photo picker (URL/Upload/AI-generate, copied from the existing pattern already used 3 times in this file) plus Day/Time/Location/Description fields and an Open toggle. New `saveGroupInfoFor(groupId)` — writes only `image`/`day`/`time`/`location`/`description`/`open` onto the existing group object via `SupaDB.saveGroup()`, exactly mirroring `my-profile.html`'s own `saveGroupInfoFor`. `name`/`leader`/`leaderEmail`/`type`/`audience`/`semesterId`/`published` are never in this form, so a leader structurally cannot touch them — same reasoning already used for event-leader editing.

Explicitly out of scope:
- Event-leader photo/description editing — tracked as a separate, smaller sub-project (same shape: one restricted form, no shared modal to reuse for events the way Members/Attendance/Email were for groups).
- Any change to `group_memberships`/`group_attendance`-style RLS policies.
- `admin/my-profile.html` itself is untouched.

## A gap worth flagging separately

`group_attendance`'s table definition was never committed to this repo as a tracked migration file (unlike every other table referenced across this whole initiative) — it appears to have been created directly in each Supabase project's SQL editor at some point, matching the exact "schema drift" pattern `CLAUDE.md` already documents as a known recurring problem. This session's Supabase MCP connection is also currently failing (`AUTH_HEADER_REJECTED`), so its RLS policy couldn't be verified directly this session. Every function that touches it follows the identical `admin`-prefixed, `auth.role() = 'authenticated'`-style naming/fetch pattern already confirmed wide-open for `group_memberships`/`growth_track_registrations`/`impact_team_memberships`/`event_rsvps`, so it's reasonable to assume the same shape — but it's the one table in this entire initiative that couldn't be directly confirmed this session. Worth Scott running `select * from pg_policies where tablename='group_attendance';` in both Supabase SQL editors when convenient, and separately getting the table's actual `CREATE TABLE` committed as a tracked `.sql` file, closing the exact gap `CLAUDE.md` warns about. Not blocking this sub-project (same risk category already accepted elsewhere, and this reuses the admin modal completely unmodified — no new exposure), just worth knowing about.

## Design

### 1. Entry point (`js/member-dashboard.js`'s `renderGroupHistory()`, and `admin/dashboard.html`'s `renderMyGroupsCard()`)

A fourth optional callback, `onManageClick(membership)`, added to `renderGroupHistory()` (same backward-compatible, opt-in pattern as `onWithdrawClick`) — shown only for rows where `m.isLeader` is true (the opposite eligibility condition from Withdraw). Rather than one combined button, it renders the four action links described above; clicking any of them calls `onManageClick(membership, 'info'|'members'|'attendance'|'email')`, and `admin/dashboard.html`'s callback dispatches to the right existing function (or the new `openGroupInfoModal` for `'info'`).

### 2. `SupaDB.getGroupsForLeader(email)` (`js/db.js`)

```js
async getGroupsForLeader(email) {
  if (!db() || !email) return [];
  try {
    const escaped = email.replace(/[%_]/g, '\\$&');
    const { data, error } = await db().from('groups').select('*').ilike('leader_email', escaped).order('name');
    if (error) throw error;
    return (data || []).map(groupFromDb);
  } catch(e) { console.error('[SupaDB] getGroupsForLeader:', e.message); return []; }
},
```

### 3. `renderMyGroupsCard()` (`admin/dashboard.html`)

Populates `_cachedGroups` from this scoped fetch before rendering, same shape as the My Events fix:

```js
async function renderMyGroupsCard() {
  const box = document.getElementById('myGroupsBox');
  const data = await getMyJourneyData();
  if (!data) { box.innerHTML = ''; return; }
  if (_profile.email) _cachedGroups = await SupaDB.getGroupsForLeader(_profile.email);
  box.innerHTML = `<div class="table-wrap" style="padding:20px;margin-bottom:24px;"><h3 style="font-size:.95rem;margin-bottom:10px;">My Small Groups</h3><div id="myGroupsHistory"></div></div>`;
  MemberDashboard.renderGroupHistory(document.getElementById('myGroupsHistory'), data.memberships, data.groups, data.profile.email, data.semesters, undefined, withdrawFromGroup, manageMyGroup);
}
```

(For an admin/event_manager viewer, `renderGroupsTable()`'s own admin-gated branch still reassigns `_cachedGroups = await SupaDB.adminGetAllGroups();` afterward — same "scoped first, admin overwrites with the full set" ordering already established for Events.)

### 4. `manageMyGroup(membership, action)` dispatcher (`admin/dashboard.html`)

```js
function manageMyGroup(membership, action) {
  if (action === 'members') openGroupRoster(membership.groupId);
  else if (action === 'attendance') openGroupAttendanceModal(membership.groupId);
  else if (action === 'email') openGroupEmailModal(membership.groupId);
  else openGroupInfoModal(membership.groupId);
}
```

### 5. `openGroupInfoModal(groupId)` / `saveGroupInfoFor(groupId)` (new, `admin/dashboard.html`)

A single-purpose modal (reusing the existing `.modal`/`.modal-lg` classes, no new size class needed — this is a plain form, not a multi-tab surface) with the photo picker + Day/Time/Location/Description/Open fields, scoped element ids (this modal is singular-instance, matching every other modal in this file). `saveGroupInfoFor` reads `_cachedGroups.find(g => g.id === groupId)` (now reliably populated per §3), merges only the editable fields onto it, and calls `SupaDB.saveGroup(updated)` — the same function the admin form uses, since the safety boundary here is which *fields the form exposes*, not a different save path.

## Testing / rollout

Same constraints as prior sub-projects: no automated test suite, no admin credentials — verify via reading deployed source and asking Scott to click through as a plain member leading a group (temporarily reassign a test group's Leader Email if needed) on staging. Specifically confirm: (a) the four action buttons only appear on groups the viewer actually leads; (b) Edit Info saves only the intended fields, leaving name/type/audience/published untouched; (c) Members/Attendance/Email open the exact same modals an admin sees, fully functional, correctly titled with the group's name; (d) the sent email appears in Email History afterward; (e) a member who does NOT lead any group never sees these buttons; (f) `admin/my-profile.html`'s own group-leader toolkit is completely unaffected. Production only after staging is verified and Scott explicitly approves, per the standing deployment rule in `CLAUDE.md`.
