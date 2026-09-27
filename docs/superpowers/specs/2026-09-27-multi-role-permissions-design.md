# Multi-Role Permissions + User Permissions UI Consolidation — Design

## Motivation

Scott tried to give `scottspratlen+test2@gmail.com` both Admin and Event Manager via "Add Permissions" and found only the last one saved — `user_roles` only supports one role per person today (a single `role` text column). He wants to assign multiple roles to one person via checkboxes instead of a single-select dropdown, and separately wants the User Permissions table simplified: drop the visible Role column, remove the per-row Edit/Set Up Account/Reset Password buttons, and consolidate all of that into a modal that opens when the row itself is clicked — leaving only a standalone Delete/"Remove" button on the row.

## Scope

1. **Data model**: `user_roles.role` (single text value) becomes `user_roles.roles` (a text array), still one row per person. Every place in Postgres, edge functions, and app code that reads/writes a single `role` value is updated to read/write the array.
2. **Add Permissions modal**: the single-select Role dropdown becomes a checkbox group (Admin, Event Manager).
3. **Users table**: Role column removed. Row actions column keeps only "Remove" (delete). Clicking anywhere on the row (not a separate button) opens a modal.
4. **That modal** (the existing Add/Edit Permissions modal, reused) gains two action buttons — "Set Up Account" and "Reset Password" — that act on whichever person the modal is currently open for, with no re-typing of their email. These replace the row-level buttons of the same name.

Explicitly out of scope:
- No change to `small_group_leader` as a role value — it stays a valid role in the data model, it's just still not one of the checkboxes offered in this modal (small group leaders don't use this dashboard at all; that's a pre-existing, unrelated routing rule this design doesn't touch).
- No change to the "Delete" (remove role) confirmation flow itself — it stays a standalone row button, unchanged in behavior, just relabeled/reused as-is.
- No change to the existing member-provisioning logic (`adminProvisionMember`, `createIfMissing`, etc.) from prior work — none of it reads or writes `role`.

## Schema design

Additive and phased, matching this repo's established migration safety pattern:

**Add the new column, backfill from the old one:**
```sql
alter table public.user_roles
  add column if not exists roles text[] not null default '{}'
  check (roles <@ array['admin','small_group_leader','event_manager']);

update public.user_roles
set roles = array[role]
where roles = '{}' and role is not null;
```

**`is_admin()` updated to check the array** (this is the only SQL function in the entire codebase that reads role, and every RLS policy in the database routes through it — confirmed by exploration, so this one change covers every table's admin-access policy):
```sql
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.user_roles
     where lower(email) = public.jwt_email() and 'admin' = any(roles)
   ) $$;
```

The old `role` column is left in place (not dropped) after this ships — a follow-up cleanup once the new column has been live and verified for a while, not part of this change. This avoids any risk of losing data if something needs to be reverted.

## Backend changes

**Edge functions** (`admin-create-user/index.ts`, `admin-invite-user/index.ts`): both currently do `.select('role').eq('email',...).maybeSingle()` then check `roleRow.role !== 'admin'`. Change the select to `.select('roles')` and the check to `!roleRow.roles?.includes('admin')`. The "any staff role" check (`admin-create-user`'s create/reset branch, `if (!roleRow)`) is already compatible as-is — it only checks that a row exists, not its role value.

**`js/db.js`**:
- `getUserRoleByEmail`, `adminGetAllUserRoles`: map `roles: data.roles || []` instead of `role: data.role`. Both remain single-row-per-email lookups (`.single()` still works — one row per person, just with an array field).
- `adminUpsertUserRole({userId, email, displayName, roles, forcePasswordChange})`: takes `roles: string[]` instead of `role: string`, upserts `{roles, ...}`.

## Dashboard UI changes

**Login-time role gate** (`admin/dashboard.html`, the post-login IIFE): `window._userRole = roleData.role` becomes `window._userRoles = roleData.roles || []`. The small-group-leader redirect check becomes `roleData.roles.includes('small_group_leader') && roleData.roles.length === 1` — see note below on mixed roles.

**All ~10 gating points** (`ROLE_TABS`, `ROLE_LABELS`, the stats-row check, the `isAdmin` variable pattern used in the People/Members panel, `_roleLabels`/`_roleBadgeClass` in the Users table) change from scalar equality (`window._userRole === 'admin'`) to array membership (`window._userRoles.includes('admin')`). `ROLE_TABS` specifically becomes a union: if `roles.includes('admin')`, full tab access (unchanged, admin already means everything); otherwise, the union of `ROLE_TABS[r]` for every role `r` the person has (in practice, today this only ever resolves to `event_manager`'s tab list, since small_group_leader never reaches this gate — see below).

**Note on a person having *both* `small_group_leader` and a dashboard role** (e.g. `admin`): today's redirect-to-my-profile check is a blunt `roleData.role === 'small_group_leader'`. With arrays, "has `small_group_leader`" no longer implies "has *only* `small_group_leader`" — someone could plausibly be both a small group leader and an event manager. The redirect should only fire when `small_group_leader` is their *only* role; if they also have a real dashboard role, they should reach the dashboard and see whatever `ROLE_TABS` union grants them access to.

**Add/Edit Permissions modal** (`admin/dashboard.html`, `userModal`):
- The `<select id="userRole">` single-select becomes two checkboxes (Admin, Event Manager), each with the same descriptive text currently in the `<option>` labels.
- The modal gains two new buttons — "Set Up Account" and "Reset Password" — wired to the existing `setupUserAccount`/`sendPasswordReset` functions, now called with the modal's current person's email (no separate prompt/re-entry) rather than from a row-level `onclick`.
- `saveUser()` collects the checked boxes into a `roles: string[]` array and passes it to `adminUpsertUserRole`.

**Users table** (`applyUsersFilter`'s row template):
- Role column removed from both the `<thead>` and each row's `<td>`s.
- The row's `<tr>` gains `onclick="openUserModal(...)"` (excluding the Remove button's own click, which must `stopPropagation()` so clicking Delete doesn't also open the modal).
- Row actions column keeps only the "Remove" button — Edit, Set Up Account, and Reset Password buttons are removed from the row entirely (their functionality now lives inside the modal, opened by clicking the row).
- Search filtering (`applyUsersFilter`'s query match against `_roleLabels[u.role]`) updates to check across all of a person's `roles`.

## Data flow

```
Click a row (User Permissions table)
  → openUserModal(email)  [same function, now also the row's own onclick]
      → pre-fills the member picker chip (existing behavior, unchanged)
      → pre-checks the Admin/Event Manager checkboxes matching u.roles
  → modal now also shows "Set Up Account" / "Reset Password" buttons
      → clicking either calls the existing setupUserAccount(email)/sendPasswordReset(email)
        using the modal's own current email, not a separate row click
  → Save → saveUser() collects checked roles → adminUpsertUserRole({..., roles: [...]})
      → user_roles.roles updated; is_admin() and all RLS immediately reflect it
```

## Testing / rollout

Same constraints as prior work: no automated tests, verify via reading deployed source, direct SQL checks, and asking Scott to click through (no admin credentials available to Claude). Sequence: apply the schema addition + `is_admin()` update to staging first (additive, safe — the old `role` column and its readers keep working throughout, since nothing reads it exclusively until the code cutover ships), then ship the code changes, verify on staging (multi-role save/display, row-click-to-modal, Set Up Account/Reset Password from inside the modal, search still works), then repeat on production once approved.
