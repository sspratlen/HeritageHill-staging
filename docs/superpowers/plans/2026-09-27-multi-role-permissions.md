# Multi-Role Permissions + Users Table Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one person hold multiple dashboard roles (Admin + Event Manager) via checkboxes instead of a single-select dropdown, and consolidate the User Permissions table down to just Email/Name/Added/Remove, with everything else (roles, Set Up Account, Reset Password) living in a modal opened by clicking the row.

**Architecture:** `user_roles.role` (scalar text) becomes `user_roles.roles` (text array), additive and backfilled — the old `role` column stays in place, unused, as a safety net. `is_admin()` is the only SQL function that reads it, and both role-checking edge functions read the same one field, so the backend surface is small. The bulk of the work is converting ~10 scalar-role-assumption points in `admin/dashboard.html` to array-aware checks, and reshaping the Users table/modal.

**Tech Stack:** Static HTML/JS (no build step), Supabase Postgres + Auth + Edge Functions (Deno).

**Full design context:** `docs/superpowers/specs/2026-09-27-multi-role-permissions-design.md`

**Testing note:** No automated test suite in this repo. Verification uses this repo's established pattern: reading deployed source via `curl`, direct SQL checks, and asking Scott to click through (no admin credentials available to Claude).

---

### Task 1: Schema — `roles` array column, backfill, `is_admin()`

**Files:**
- Create: `supabase/user-roles-multi-role-schema.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Allow a person to hold multiple dashboard roles at once.
-- See docs/superpowers/specs/2026-09-27-multi-role-permissions-design.md
--
-- Additive and safe to run anytime: adds a new `roles` array column,
-- backfills it from the existing scalar `role` column, and updates
-- is_admin() (the only SQL function anywhere that reads role — every
-- RLS policy in the database routes through it) to check the array.
-- The old `role` column is intentionally left in place, untouched,
-- as a safety net — dropping it is a separate future cleanup once
-- `roles` has been live and verified for a while.
-- ============================================================

alter table public.user_roles
  add column if not exists roles text[] not null default '{}'
  check (roles <@ array['admin','small_group_leader','event_manager']);

update public.user_roles
set roles = array[role]
where roles = '{}' and role is not null;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.user_roles
     where lower(email) = public.jwt_email() and 'admin' = any(roles)
   ) $$;
```

- [ ] **Step 2: Apply to staging**

If Supabase MCP is connected and scoped correctly, run this file's SQL via `execute_sql` against the staging project. Otherwise, give Scott the exact SQL to paste into staging's SQL Editor.

- [ ] **Step 3: Verify**

```sql
select email, role, roles from public.user_roles order by email;
```

Expected: every row's `roles` array contains exactly the same value as its old `role` column (e.g. `role='admin'` → `roles={admin}`).

- [ ] **Step 4: Commit**

```bash
git add supabase/user-roles-multi-role-schema.sql
git commit -m "Add roles array column to user_roles; update is_admin() to check it

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Edge functions — read `roles` array instead of `role`

**Files:**
- Modify: `supabase/functions/admin-create-user/index.ts:40-48`
- Modify: `supabase/functions/admin-invite-user/index.ts:48-50`

- [ ] **Step 1: `admin-create-user`**

Find:

```ts
    const { data: roleRow } = await admin.from('user_roles')
      .select('role').eq('email', caller.user.email.toLowerCase()).maybeSingle()

    if (action === 'delete') {
      // Deletion is admin-only (matches the People/Members tab's own
      // ROLE_TABS gating — small group leaders never see a delete-account
      // control in the UI, unlike create/reset below, which leaders trigger
      // legitimately via "Add to Group").
      if (!roleRow || roleRow.role !== 'admin') {
```

Replace with:

```ts
    const { data: roleRow } = await admin.from('user_roles')
      .select('roles').eq('email', caller.user.email.toLowerCase()).maybeSingle()

    if (action === 'delete') {
      // Deletion is admin-only (matches the People/Members tab's own
      // ROLE_TABS gating — small group leaders never see a delete-account
      // control in the UI, unlike create/reset below, which leaders trigger
      // legitimately via "Add to Group").
      if (!roleRow || !roleRow.roles?.includes('admin')) {
```

(The `if (!roleRow) { ... 'Staff access required' ... }` check further down this same file, gating the create/reset branch, needs no change — it only checks that a row exists at all, not its role value.)

- [ ] **Step 2: `admin-invite-user`**

Find:

```ts
    const { data: roleRow } = await admin.from('user_roles')
      .select('role').eq('email', caller.user.email.toLowerCase()).maybeSingle()
    if (!roleRow || roleRow.role !== 'admin') {
```

Replace with:

```ts
    const { data: roleRow } = await admin.from('user_roles')
      .select('roles').eq('email', caller.user.email.toLowerCase()).maybeSingle()
    if (!roleRow || !roleRow.roles?.includes('admin')) {
```

- [ ] **Step 3: Verify**

```bash
grep -n "roleRow.roles" supabase/functions/admin-create-user/index.ts supabase/functions/admin-invite-user/index.ts
```

Expected: one match per file.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/admin-create-user/index.ts supabase/functions/admin-invite-user/index.ts
git commit -m "Check roles array instead of scalar role in edge functions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Backend — `js/db.js` reads/writes `roles`

**Files:**
- Modify: `js/db.js` (`getUserRoleByEmail`, `adminGetAllUserRoles`, `adminUpsertUserRole`)

- [ ] **Step 1: `getUserRoleByEmail`**

Find:

```js
  async getUserRoleByEmail(email) {
    if (!db() || !email) return null;
    try {
      const { data, error } = await db().from('user_roles').select('*').eq('email', email.toLowerCase()).single();
      if (error) return null;
      return data ? {
        email: data.email, displayName: data.display_name || '', role: data.role,
        createdAt: data.created_at, forcePasswordChange: !!data.force_password_change,
        userId: data.user_id || null,
      } : null;
    } catch(e) { return null; }
  },
```

Replace with:

```js
  async getUserRoleByEmail(email) {
    if (!db() || !email) return null;
    try {
      const { data, error } = await db().from('user_roles').select('*').eq('email', email.toLowerCase()).single();
      if (error) return null;
      return data ? {
        email: data.email, displayName: data.display_name || '', roles: data.roles || [],
        createdAt: data.created_at, forcePasswordChange: !!data.force_password_change,
        userId: data.user_id || null,
      } : null;
    } catch(e) { return null; }
  },
```

- [ ] **Step 2: `adminGetAllUserRoles`**

Find:

```js
  async adminGetAllUserRoles() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('user_roles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(r => ({ email: r.email, displayName: r.display_name || '', role: r.role, createdAt: r.created_at, forcePasswordChange: !!r.force_password_change, userId: r.user_id || null }));
    } catch(e) { console.error('[SupaDB] adminGetAllUserRoles:', e.message); return []; }
  },
```

Replace with:

```js
  async adminGetAllUserRoles() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('user_roles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(r => ({ email: r.email, displayName: r.display_name || '', roles: r.roles || [], createdAt: r.created_at, forcePasswordChange: !!r.force_password_change, userId: r.user_id || null }));
    } catch(e) { console.error('[SupaDB] adminGetAllUserRoles:', e.message); return []; }
  },
```

- [ ] **Step 3: `adminUpsertUserRole`**

Find:

```js
  async adminUpsertUserRole({ userId, email, displayName, role, forcePasswordChange }) {
    if (!db()) return { error: 'No DB' };
    if (!userId) return { error: 'A member must be selected' };
    try {
      const personId = await this.upsertPerson({ name: displayName, email });
      const { error } = await db().from('user_roles')
        .upsert({ user_id: userId, email: email.toLowerCase(), display_name: displayName || '', role, force_password_change: !!forcePasswordChange, person_id: personId }, { onConflict: 'email' });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminUpsertUserRole:', e.message); return { error: e.message }; }
  },
```

Replace with:

```js
  async adminUpsertUserRole({ userId, email, displayName, roles, forcePasswordChange }) {
    if (!db()) return { error: 'No DB' };
    if (!userId) return { error: 'A member must be selected' };
    if (!roles || !roles.length) return { error: 'At least one role must be selected' };
    try {
      const personId = await this.upsertPerson({ name: displayName, email });
      const { error } = await db().from('user_roles')
        .upsert({ user_id: userId, email: email.toLowerCase(), display_name: displayName || '', roles, force_password_change: !!forcePasswordChange, person_id: personId }, { onConflict: 'email' });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminUpsertUserRole:', e.message); return { error: e.message }; }
  },
```

- [ ] **Step 4: Verify**

```bash
grep -n "roles: data.roles\|roles: r.roles\|roles.length\|roles," js/db.js
```

Expected: several matches across the three functions above.

- [ ] **Step 5: Commit**

```bash
git add js/db.js
git commit -m "Read and write roles array in user_roles helper functions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Dashboard — login gate and `applyRoleVisibility`

**Files:**
- Modify: `admin/dashboard.html:2426-2456` (`ROLE_TABS`, `ROLE_LABELS`, `applyRoleVisibility`)
- Modify: `admin/dashboard.html` (the post-login auth-guard IIFE)

- [ ] **Step 1: `applyRoleVisibility` and the role maps**

Find:

```js
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users'],
  event_manager:       ['events','sermons','email'],
};
const ROLE_LABELS = { admin:'Admin', event_manager:'Event Manager' };

function applyRoleVisibility() {
  const allowed = ROLE_TABS[window._userRole] || ROLE_TABS.admin;
  // Show/hide sidebar items
  document.querySelectorAll('.sidebar-nav a[data-tab]').forEach(el => {
    el.style.display = allowed.includes(el.dataset.tab) ? '' : 'none';
  });
  // Hide section headers if all items beneath them are hidden
  ['navSectionFound','navSectionFilled','navSectionFreed','navSectionForged','navSectionOperations'].forEach(secId => {
    const sec = document.getElementById(secId);
    if (!sec) return;
    let next = sec.nextElementSibling, anyVisible = false;
    while (next && !next.classList.contains('nav-section')) {
      if (next.tagName === 'A' && next.style.display !== 'none') anyVisible = true;
      next = next.nextElementSibling;
    }
    sec.style.display = anyVisible ? '' : 'none';
  });
  // Hide stats row for non-admins (stats cover data they can't see)
  if (window._userRole !== 'admin') {
    const statsRow = document.querySelector('.stats-row');
    if (statsRow) statsRow.style.display = 'none';
  }
  // Update role badge label
  document.getElementById('roleBadge').textContent = ROLE_LABELS[window._userRole] || 'Admin';
}
```

Replace with:

```js
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users'],
  event_manager:       ['events','sermons','email'],
};
const ROLE_LABELS = { admin:'Admin', event_manager:'Event Manager' };

function isAdmin() { return (window._userRoles || []).includes('admin'); }

function applyRoleVisibility() {
  const allowed = isAdmin()
    ? ROLE_TABS.admin
    : Array.from(new Set((window._userRoles || []).flatMap(r => ROLE_TABS[r] || [])));
  const effectiveAllowed = allowed.length ? allowed : ROLE_TABS.admin;
  // Show/hide sidebar items
  document.querySelectorAll('.sidebar-nav a[data-tab]').forEach(el => {
    el.style.display = effectiveAllowed.includes(el.dataset.tab) ? '' : 'none';
  });
  // Hide section headers if all items beneath them are hidden
  ['navSectionFound','navSectionFilled','navSectionFreed','navSectionForged','navSectionOperations'].forEach(secId => {
    const sec = document.getElementById(secId);
    if (!sec) return;
    let next = sec.nextElementSibling, anyVisible = false;
    while (next && !next.classList.contains('nav-section')) {
      if (next.tagName === 'A' && next.style.display !== 'none') anyVisible = true;
      next = next.nextElementSibling;
    }
    sec.style.display = anyVisible ? '' : 'none';
  });
  // Hide stats row for non-admins (stats cover data they can't see)
  if (!isAdmin()) {
    const statsRow = document.querySelector('.stats-row');
    if (statsRow) statsRow.style.display = 'none';
  }
  // Update role badge label
  document.getElementById('roleBadge').textContent =
    (window._userRoles || []).map(r => ROLE_LABELS[r] || r).join(' + ') || 'Admin';
}
```

(`isAdmin()` is introduced here as a small shared helper — it replaces the `window._userRole === 'admin'` check everywhere that check appears, in this and later steps, rather than repeating `(window._userRoles || []).includes('admin')` at every call site.)

- [ ] **Step 2: The post-login auth-guard IIFE**

Find:

```js
  const roleData = await SupaDB.getUserRoleByEmail(user.email);
  // Small group leaders manage their group from my-profile.html now, not
  // this dashboard -- treat that role the same as having no staff role at
  // all here, rather than falling through to ROLE_TABS.admin below.
  if (!roleData || roleData.role === 'small_group_leader') { window.location.href = 'my-profile.html'; return; }
  window._userRole = roleData.role;
  window._currentUserName = (roleData && roleData.displayName) ? roleData.displayName : '';
```

Replace with:

```js
  const roleData = await SupaDB.getUserRoleByEmail(user.email);
  // Small group leaders manage their group from my-profile.html now, not
  // this dashboard -- treat that as having no staff role at all here,
  // rather than falling through to ROLE_TABS.admin below. Only redirects
  // when small_group_leader is their ONLY role -- someone who is both a
  // small group leader and, say, an admin still belongs on this dashboard.
  const roleList = (roleData && roleData.roles) || [];
  if (!roleData || (roleList.length === 1 && roleList[0] === 'small_group_leader')) {
    window.location.href = 'my-profile.html'; return;
  }
  window._userRoles = roleList;
  window._currentUserName = (roleData && roleData.displayName) ? roleData.displayName : '';
```

- [ ] **Step 3: The two remaining `window._userRole` reads in the same IIFE**

Find:

```js
  const allowed = ROLE_TABS[window._userRole] || ROLE_TABS.admin;
  const urlTab = new URLSearchParams(window.location.search).get('tab');
  const startTab = (urlTab && allowed.includes(urlTab)) ? urlTab : allowed[0];
  switchTab(startTab);
  if (window._userRole === 'admin') updateStats();
  if (window._userRole === 'admin') {
```

Replace with:

```js
  const allowed = isAdmin()
    ? ROLE_TABS.admin
    : Array.from(new Set(window._userRoles.flatMap(r => ROLE_TABS[r] || [])));
  const effectiveAllowed = allowed.length ? allowed : ROLE_TABS.admin;
  const urlTab = new URLSearchParams(window.location.search).get('tab');
  const startTab = (urlTab && effectiveAllowed.includes(urlTab)) ? urlTab : effectiveAllowed[0];
  switchTab(startTab);
  if (isAdmin()) updateStats();
  if (isAdmin()) {
```

- [ ] **Step 4: Verify**

```bash
grep -n "window._userRole\b" admin/dashboard.html
```

Expected: no matches at all (everything converted to `window._userRoles` or the new `isAdmin()` helper). If any remain, they're additional call sites this task missed — check them against the design doc's list before moving on.

- [ ] **Step 5: Commit**

```bash
git add admin/dashboard.html
git commit -m "Convert login role gate and applyRoleVisibility to multi-role arrays

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Dashboard — remaining scalar role checks

**Files:**
- Modify: `admin/dashboard.html` (`membershipTable`, the baptism-save handler)

- [ ] **Step 1: `membershipTable`'s `isAdmin` variable**

Find:

```js
function membershipTable(rows) {
  if (!rows.length) return '<p style="color:var(--text-muted); padding:20px;">No members match.</p>';
  const isAdmin = window._userRole === 'admin';
```

Replace with:

```js
function membershipTable(rows) {
  if (!rows.length) return '<p style="color:var(--text-muted); padding:20px;">No members match.</p>';
  const canManageMembers = isAdmin();
```

Find (further down, same function):

```js
      <td>${isAdmin ? `<a class="btn btn-secondary btn-sm" href="member-dashboard.html?id=${encodeURIComponent(p.userId)}">View</a> <button class="btn btn-danger btn-sm" onclick="deleteMember('${p.userId}')">Delete</button>` : ''}</td>
```

Replace with:

```js
      <td>${canManageMembers ? `<a class="btn btn-secondary btn-sm" href="member-dashboard.html?id=${encodeURIComponent(p.userId)}">View</a> <button class="btn btn-danger btn-sm" onclick="deleteMember('${p.userId}')">Delete</button>` : ''}</td>
```

(Renamed the local variable from `isAdmin` to `canManageMembers` — it would otherwise shadow the new global `isAdmin()` function from Task 4, silently breaking it for the rest of this function's scope.)

- [ ] **Step 2: The baptism-save handler**

Find:

```js
  if (window._userRole === 'admin' && document.getElementById('panelPeople').classList.contains('active')) renderPeoplePanel();
```

Replace with:

```js
  if (isAdmin() && document.getElementById('panelPeople').classList.contains('active')) renderPeoplePanel();
```

- [ ] **Step 3: Verify**

```bash
grep -n "window._userRole\b" admin/dashboard.html
```

Expected: still zero matches (same check as Task 4, confirming no regressions).

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html
git commit -m "Convert remaining scalar role checks to the isAdmin() helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Users table + modal consolidation

**Files:**
- Modify: `admin/dashboard.html:1253` (Users table `<thead>`)
- Modify: `admin/dashboard.html:2190-2233` (`userModal` HTML)
- Modify: `admin/dashboard.html` (`_roleLabels`/`_roleBadgeClass`, `applyUsersFilter`, `openUserModal`, `saveUser`)

- [ ] **Step 1: Remove the Role column header**

Find:

```html
          <thead><tr><th onclick="toggleUsersSort()" style="cursor:pointer;user-select:none;">Email<span id="usrSortArrow"></span></th><th>Name</th><th>Role</th><th>Added</th><th>Actions</th></tr></thead>
```

Replace with:

```html
          <thead><tr><th onclick="toggleUsersSort()" style="cursor:pointer;user-select:none;">Email<span id="usrSortArrow"></span></th><th>Name</th><th>Added</th><th>Actions</th></tr></thead>
```

- [ ] **Step 2: Replace the Role select with checkboxes, and add the Set Up Account / Reset Password buttons**

Find:

```html
      <div class="form-row full" style="margin-bottom:16px;">
        <div class="field">
          <label>Role <span style="color:var(--danger);">*</span></label>
          <select id="userRole">
            <option value="">Select a role…</option>
            <option value="admin">Admin — Full access to all sections</option>
            <option value="event_manager">Event Manager — Events (including sign-ups), Sermons, Email</option>
          </select>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--bg);border-radius:8px;border:1.5px solid var(--border);">
        <input type="checkbox" id="userForcePasswordChange" style="width:16px;height:16px;cursor:pointer;accent-color:var(--primary);" />
        <div>
          <label for="userForcePasswordChange" style="font-size:.875rem;font-weight:600;cursor:pointer;margin:0;">Require password change on next login</label>
          <p style="margin:2px 0 0;font-size:.78rem;color:var(--text-muted);">User will be prompted to set a new password before accessing the dashboard.</p>
        </div>
      </div>
```

Replace with:

```html
      <div class="form-row full" style="margin-bottom:16px;">
        <div class="field">
          <label>Roles <span style="color:var(--danger);">*</span></label>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <label style="display:flex;align-items:center;gap:8px;font-weight:normal;cursor:pointer;">
              <input type="checkbox" id="userRoleAdmin" style="width:16px;height:16px;cursor:pointer;accent-color:var(--primary);" />
              Admin — Full access to all sections
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-weight:normal;cursor:pointer;">
              <input type="checkbox" id="userRoleEventManager" style="width:16px;height:16px;cursor:pointer;accent-color:var(--primary);" />
              Event Manager — Events (including sign-ups), Sermons, Email
            </label>
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--bg);border-radius:8px;border:1.5px solid var(--border);">
        <input type="checkbox" id="userForcePasswordChange" style="width:16px;height:16px;cursor:pointer;accent-color:var(--primary);" />
        <div>
          <label for="userForcePasswordChange" style="font-size:.875rem;font-weight:600;cursor:pointer;margin:0;">Require password change on next login</label>
          <p style="margin:2px 0 0;font-size:.78rem;color:var(--text-muted);">User will be prompted to set a new password before accessing the dashboard.</p>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button type="button" class="btn btn-success btn-sm" onclick="if(_aupSelectedPerson) setupUserAccount(_aupSelectedPerson.email); else alert('Please select a member first.');">Set Up Account</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="if(_aupSelectedPerson) sendPasswordReset(_aupSelectedPerson.email); else alert('Please select a member first.');">Reset Password</button>
      </div>
```

- [ ] **Step 3: Update the role label/badge maps and `applyUsersFilter`, `openUserModal`, `saveUser`**

Find:

```js
let _cachedUsers = [];
const _roleLabels = { admin:'Admin', event_manager:'Event Manager' };
const _roleBadgeClass = { admin:'badge-blue', event_manager:'badge-amber' };
```

Replace with:

```js
let _cachedUsers = [];
const _roleLabels = { admin:'Admin', event_manager:'Event Manager' };
```

Find:

```js
function applyUsersFilter() {
  const q = (document.getElementById('usrSearch').value || '').toLowerCase();
  let rows = _cachedUsers;
  if (q) rows = rows.filter(u =>
    u.email.toLowerCase().includes(q) ||
    (u.displayName || '').toLowerCase().includes(q) ||
    (_roleLabels[u.role] || u.role || '').toLowerCase().includes(q)
  );
  rows = rows.slice().sort((a, b) => _usrSortDir === 'desc'
    ? b.email.localeCompare(a.email)
    : a.email.localeCompare(b.email));
  document.getElementById('usrSortArrow').textContent = _usrSortDir === 'desc' ? ' ▾' : ' ▴';

  const tbody = document.getElementById('usersTable');
  const empty = document.getElementById('usersEmpty');
  if (!rows.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = rows.map(u => `
    <tr>
      <td><strong>${u.email}</strong></td>
      <td style="color:var(--text-muted);">${u.displayName || '—'}</td>
      <td><span class="badge ${_roleBadgeClass[u.role]||'badge-gray'}">${_roleLabels[u.role]||u.role}</span></td>
      <td style="color:var(--text-muted);font-size:.82rem;">${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-sm" onclick="editUser('${u.email.replace(/'/g,"\\'")}')">Edit</button>
        <button class="btn btn-success btn-sm" onclick="setupUserAccount('${u.email.replace(/'/g,"\\'")}')">Set Up Account</button>
        <button class="btn btn-secondary btn-sm" onclick="sendPasswordReset('${u.email.replace(/'/g,"\\'")}')">Reset Password</button>
        <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.email.replace(/'/g,"\\'")}')">Remove</button>
      </div></td>
    </tr>`).join('');
}

function openUserModal(email) {
  document.getElementById('userModalTitle').textContent = email ? 'Edit User' : 'Add Permissions';
  document.getElementById('userRole').value        = '';
  document.getElementById('userForcePasswordChange').checked = false;
  aupClearPerson();
  if (email) {
    const u = _cachedUsers.find(x => x.email === email);
    if (u) {
      document.getElementById('userRole').value        = u.role || '';
      document.getElementById('userForcePasswordChange').checked = !!u.forcePasswordChange;
      if (u.userId) aupSelectPerson(u.userId);
    }
  }
  document.getElementById('userModal').classList.add('open');
}
function closeUserModal() { document.getElementById('userModal').classList.remove('open'); aupClearPerson(); }
function editUser(email) { openUserModal(email); }

async function saveUser() {
  const role = document.getElementById('userRole').value;
  const forcePasswordChange = document.getElementById('userForcePasswordChange').checked;
  if (!_aupSelectedPerson) { alert('Please select a member.'); return; }
  if (!role) { alert('Please select a role.'); return; }
  const { userId, name: displayName, email } = _aupSelectedPerson;
  const res = await SupaDB.adminUpsertUserRole({ userId, email, displayName, role, forcePasswordChange });
  if (res.error) { alert('Error: ' + res.error); return; }
  closeUserModal();
  showToast('User saved.');
  renderUsersTable();
}
```

Replace with:

```js
function applyUsersFilter() {
  const q = (document.getElementById('usrSearch').value || '').toLowerCase();
  let rows = _cachedUsers;
  if (q) rows = rows.filter(u =>
    u.email.toLowerCase().includes(q) ||
    (u.displayName || '').toLowerCase().includes(q) ||
    (u.roles || []).map(r => _roleLabels[r] || r).join(' ').toLowerCase().includes(q)
  );
  rows = rows.slice().sort((a, b) => _usrSortDir === 'desc'
    ? b.email.localeCompare(a.email)
    : a.email.localeCompare(b.email));
  document.getElementById('usrSortArrow').textContent = _usrSortDir === 'desc' ? ' ▾' : ' ▴';

  const tbody = document.getElementById('usersTable');
  const empty = document.getElementById('usersEmpty');
  if (!rows.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = rows.map(u => `
    <tr onclick="editUser('${u.email.replace(/'/g,"\\'")}')" style="cursor:pointer;">
      <td><strong>${u.email}</strong></td>
      <td style="color:var(--text-muted);">${u.displayName || '—'}</td>
      <td style="color:var(--text-muted);font-size:.82rem;">${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
      <td><div class="td-actions">
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteUser('${u.email.replace(/'/g,"\\'")}')">Remove</button>
      </div></td>
    </tr>`).join('');
}

function openUserModal(email) {
  document.getElementById('userModalTitle').textContent = email ? 'Edit User' : 'Add Permissions';
  document.getElementById('userRoleAdmin').checked = false;
  document.getElementById('userRoleEventManager').checked = false;
  document.getElementById('userForcePasswordChange').checked = false;
  aupClearPerson();
  if (email) {
    const u = _cachedUsers.find(x => x.email === email);
    if (u) {
      const roles = u.roles || [];
      document.getElementById('userRoleAdmin').checked = roles.includes('admin');
      document.getElementById('userRoleEventManager').checked = roles.includes('event_manager');
      document.getElementById('userForcePasswordChange').checked = !!u.forcePasswordChange;
      if (u.userId) aupSelectPerson(u.userId);
    }
  }
  document.getElementById('userModal').classList.add('open');
}
function closeUserModal() { document.getElementById('userModal').classList.remove('open'); aupClearPerson(); }
function editUser(email) { openUserModal(email); }

async function saveUser() {
  const roles = [];
  if (document.getElementById('userRoleAdmin').checked) roles.push('admin');
  if (document.getElementById('userRoleEventManager').checked) roles.push('event_manager');
  const forcePasswordChange = document.getElementById('userForcePasswordChange').checked;
  if (!_aupSelectedPerson) { alert('Please select a member.'); return; }
  if (!roles.length) { alert('Please select at least one role.'); return; }
  const { userId, name: displayName, email } = _aupSelectedPerson;
  const res = await SupaDB.adminUpsertUserRole({ userId, email, displayName, roles, forcePasswordChange });
  if (res.error) { alert('Error: ' + res.error); return; }
  closeUserModal();
  showToast('User saved.');
  renderUsersTable();
}
```

- [ ] **Step 4: Verify**

```bash
grep -n "userRole\b\|_roleBadgeClass\|<th>Role</th>" admin/dashboard.html
```

Expected: no matches for `id="userRole"` (only `userRoleAdmin`/`userRoleEventManager` should remain), no matches for `_roleBadgeClass`, no `<th>Role</th>`.

```bash
grep -n "setupUserAccount(_aupSelectedPerson.email)\|sendPasswordReset(_aupSelectedPerson.email)" admin/dashboard.html
```

Expected: one match each, inside the modal.

- [ ] **Step 5: Commit**

```bash
git add admin/dashboard.html
git commit -m "Consolidate Users table into a row-click modal with role checkboxes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end verification on staging

**Files:** none (verification only)

- [ ] **Step 1: Push to staging**

```bash
git push staging main
```

- [ ] **Step 2: Deploy the two edge functions to staging**

No Supabase CLI or working MCP connection may be available — if not, ask Scott to deploy `admin-create-user` and `admin-invite-user` to the staging project via the dashboard's Edge Functions editor, or `supabase functions deploy admin-create-user admin-invite-user --project-ref govvofbrhhpowtdnuzcw` if he has the CLI.

- [ ] **Step 3: Confirm the deployed dashboard has the changes**

```bash
curl -s https://sspratlen.github.io/HeritageHill-staging/admin/dashboard.html | grep -o "userRoleAdmin\|userRoleEventManager\|_aupSelectedPerson.email" | sort -u
```

Expected: all three strings present.

- [ ] **Step 4: Ask Scott to click through and confirm on staging**

1. Assign both Admin and Event Manager to a test member via Add Permissions — confirm both checkboxes save and both persist when reopening.
2. Click a row in the Users table (not a button) — confirm it opens the modal with roles pre-checked correctly.
3. From inside that modal, use "Set Up Account" and "Reset Password" — confirm they act on the right person without needing to type an email.
4. Confirm the Role column is gone from the table, and "Remove" still works from the row without also opening the modal.
5. Log in as (or otherwise verify) an Event Manager-only account — confirm they still only see Events/Sermons/Email tabs (the union logic didn't accidentally widen their access).
6. If any test account has *only* `small_group_leader`, confirm they're still redirected to `my-profile.html` as before.

- [ ] **Step 5: Stop here — do not touch production**

Per `CLAUDE.md`'s standing deployment rule, do not deploy the edge functions or push code to `origin` (production) until Scott explicitly approves promoting this specific change, after confirming Step 4 on staging. The schema change (Task 1) is additive and safe to apply to production independently of the code push, same as prior migrations in this series — but still only with explicit approval, and only after staging is fully verified.

---

## Self-Review Notes

- **Spec coverage:** Schema (Task 1), edge functions (Task 2), backend (Task 3), login gate + `applyRoleVisibility` (Task 4), remaining scalar checks (Task 5), Users table + modal (Task 6), rollout (Task 7) — every section of the design doc maps to a task.
- **Placeholder scan:** No TBD/TODO; every step has literal code, exact SQL, or an exact command.
- **Type/name consistency:** `roles` (plural, array) is spelled identically across `js/db.js`'s three functions, `adminUpsertUserRole`'s new callers, and `openUserModal`/`saveUser`. The new `isAdmin()` helper name was checked against the existing local variable `isAdmin` inside `membershipTable` — Task 5 explicitly renames that local variable to `canManageMembers` to avoid shadowing.
