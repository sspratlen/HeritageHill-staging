# Group-Leader Toolkit in the Unified Dashboard — Design

## Motivation

Third content sub-project in the effort to fully retire `admin/my-profile.html`. This is the last deferred piece for Groups: a non-admin group leader (matched by `group.leaderEmail`, independent of any dashboard role) currently manages their group — editing its description/photo, its roster, its attendance, and emailing its members — only from `admin/my-profile.html`'s 4-tab `groupDetailsModal`.

Investigation found this is almost entirely a reuse job, not new logic. `admin/dashboard.html` already has fully-working admin versions of all four pieces (`openGroupRoster`/roster CRUD, `openGroupAttendanceModal`/attendance CRUD, `openGroupEmailModal`/`sendGroupEmail`, and the group Description/photo editing embedded in `openGroupModal`/`saveGroup`), all calling the exact same `SupaDB.*` functions my-profile.html's leader versions call. The only two structural things dashboard.html doesn't already have are (a) a 4-way tab switcher matching `my-profile.html`'s `.gd-tabs` styling, and (b) a `saveGroup()`-equivalent restricted to only the fields a leader should touch (not `name`/`leaderEmail`/`type`/`audience`/`semesterId`/`published`, none of which appear in the leader's form to begin with).

## Scope

1. **New "Manage My Group" entry point**: on the existing "My Groups" list (`#myGroupsBox`), each active membership/led-group row a person actually leads gets a "Manage" button opening a new modal, `groupLeaderModal`.
2. **Tab switcher**: 4 buttons (Description, Members, Attendance, Email), using dashboard.html's own established pill-button toggle pattern (`class="btn btn-sm"`, `.btn-primary`/`.btn-ghost` swap) — the same idiom already driving every "My X / Manage X" switcher — rather than porting `.gd-tabs`' underline-tab CSS from `dashboard-shell.css`. Visually consistent with the rest of the file, zero new CSS classes needed.
3. **Description tab**: photo (3-way picker: URL/Upload/AI-generate, copying the existing pattern already used 3 times in this file for events/groups admin modals — a 4th copy, scoped to this modal's own element ids), Day/Time/Location/Description fields, Open toggle. New `saveGroupInfoFor(groupId)` function — mirrors `my-profile.html`'s own restriction (only `image`/`day`/`time`/`location`/`description`/`open` are editable; `name`/`leader`/`leaderEmail`/`type`/`audience`/`semesterId`/`published` are never in this form, so a leader structurally cannot touch them).
4. **Members tab**: reuses the **existing admin roster CRUD almost verbatim** (`SupaDB.adminGetGroupMembers`/`adminAddGroupMember`/`adminUpdateGroupMember`/`adminRemoveGroupMember`, and the existing `exportGroupRosterCsv`/`csvSafe` CSV export) — adapted into this modal's own scope rather than the standalone `groupRosterModal`.
5. **Attendance tab**: reuses the **existing admin attendance CRUD verbatim** (`SupaDB.adminGetAllGroupAttendance`/`adminAddGroupAttendance`/`adminUpdateGroupAttendance`/`adminDeleteGroupAttendance`, same client-side filter-by-groupId pattern the admin version already uses), including its existing separate edit-modal UX (not `my-profile.html`'s inline-reveal edit) — one less UI pattern to build fresh.
6. **Email tab**: reuses the **existing admin email-send logic** (`SupaDB` send via the `send-group-email` edge function, `setGroupEmailFrom`'s on-domain reply-to logic, and — per Scott's decision — now also calls `SupaDB.adminSaveOutboundEmailSend()` after a successful send, so leader-sent group emails appear in Email History exactly like admin-sent ones do). Uses the admin version's fuller Quill toolbar rather than `my-profile.html`'s narrower one, for consistency (no reason found for the narrower toolbar being intentional).
7. **Modal size**: reuses the existing `.modal-xl` (1040px) class rather than porting `.modal-full` (1200px/95vw) — the next-widest option already in the file, no new CSS needed.
8. **State model**: module-level state (one leader-group modal open at a time), matching how every existing admin modal in this file already works — not `my-profile.html`'s `_ledId`-namespaced multi-instance pattern. A leader who leads more than one group can still manage each one, just not two at once in the same view (closing and reopening the modal for a different group works fine, exactly like switching which group an admin is managing today).

Explicitly out of scope:
- Event-leader photo/description editing — a separate, smaller sub-project (same shape, no shared modal infrastructure worth merging since it's a 1-tab "Description" form, not a 4-tab toolkit).
- Any change to `group_memberships`/`event_rsvps`-style RLS policies.
- `admin/my-profile.html` itself is untouched.

## A gap worth flagging separately

`group_attendance`'s table definition was never committed to this repo as a tracked migration file (unlike every other table referenced across this whole initiative) — it appears to have been created directly in each Supabase project's SQL editor at some point, matching the exact "schema drift" pattern `CLAUDE.md` already documents as a known recurring problem. This session's Supabase MCP connection is also currently failing (`AUTH_HEADER_REJECTED`), so its RLS policy couldn't be verified directly this session. Every function that touches it follows the identical `admin`-prefixed, `auth.role() = 'authenticated'`-style naming/fetch pattern already confirmed wide-open for `group_memberships`/`growth_track_registrations`/`impact_team_memberships`/`event_rsvps`, so it's reasonable to assume the same shape — but it's the one table in this entire initiative I couldn't directly confirm. Worth Scott running `select * from pg_policies where tablename='group_attendance';` in both Supabase SQL editors when convenient, and — separately — getting the table's actual `CREATE TABLE` committed as a tracked `.sql` file, closing the exact gap `CLAUDE.md` warns about. Not blocking this sub-project (same risk category already accepted elsewhere), just worth knowing about.

## Design

### 1. Entry point (`#myGroupsBox` / `renderMyGroupsCard()` → `MemberDashboard.renderGroupHistory()`)

A third optional callback, `onManageClick(membership_or_led_row)`, added to `renderGroupHistory()` (same backward-compatible pattern as `onWithdrawClick`) — shown only for rows where `m.isLeader` is true (the exact opposite condition from Withdraw's eligibility). Clicking it calls `openGroupLeaderModal(groupId)` in dashboard.html.

### 2. `groupLeaderModal` (new, `admin/dashboard.html`)

```html
<div class="modal-overlay" id="groupLeaderModal">
  <div class="modal modal-xl">
    <div class="modal-header"><h3 id="glTitle">Manage Group</h3><button class="modal-close" onclick="closeGroupLeaderModal()">✕</button></div>
    <div class="modal-body">
      <div id="glTabs" style="display:flex; gap:8px; margin-bottom:20px;">
        <button class="btn btn-sm btn-primary" onclick="switchGlTab('description')">Description</button>
        <button class="btn btn-sm btn-ghost" onclick="switchGlTab('members')">Members</button>
        <button class="btn btn-sm btn-ghost" onclick="switchGlTab('attendance')">Attendance</button>
        <button class="btn btn-sm btn-ghost" onclick="switchGlTab('email')">Email</button>
      </div>
      <div id="glPanel-description" class="gl-panel"><!-- photo picker + fields --></div>
      <div id="glPanel-members" class="gl-panel" style="display:none;"><!-- roster table, reusing admin roster markup shape --></div>
      <div id="glPanel-attendance" class="gl-panel" style="display:none;"><!-- attendance table, reusing admin attendance markup shape --></div>
      <div id="glPanel-email" class="gl-panel" style="display:none;"><!-- Quill editor + subject + recipients --></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeGroupLeaderModal()">Close</button></div>
  </div>
</div>
```

`switchGlTab(tab)` toggles `display` on the four `.gl-panel`s and the pill classes on the four tab buttons — same idiom as every shipped sub-tab switcher, just 4-way instead of 2-way.

### 3. Data scoping

Every SupaDB call inside this modal is parameterized by the specific `groupId` the leader opened — `openGroupLeaderModal(groupId)` first confirms the caller actually leads that group (`group.leaderEmail.toLowerCase() === _profile.email.toLowerCase()`) before rendering anything, mirroring `my-profile.html`'s own `isLeader` check. This is a client-side gate only (same pre-existing RLS shape noted above), consistent with every other sub-project in this initiative.

## Testing / rollout

Same constraints as prior sub-projects: no automated test suite, no admin credentials — verify via reading deployed source and asking Scott to click through as a plain member leading a group (temporarily reassign a test group's Leader Email if needed) on staging. Specifically confirm: (a) "Manage" only appears on groups the viewer actually leads; (b) Description saves only the intended fields, leaving name/type/audience/published untouched; (c) Members tab CRUD and CSV export work identically to the admin version; (d) Attendance tab CRUD works and small-group counts recompute correctly; (e) Email tab sends correctly, with the on-domain reply-to logic working, and the sent email now appears in Email History; (f) a member who does NOT lead the group they're viewing never sees a "Manage" button; (g) `admin/my-profile.html`'s own group-leader toolkit is completely unaffected. Production only after staging is verified and Scott explicitly approves, per the standing deployment rule in `CLAUDE.md`.
