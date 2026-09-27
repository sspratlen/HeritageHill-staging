# Unified Dashboard Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let everyone (not just staff) log into `admin/dashboard.html`, landing on a working "My Journey"/"My Info" personal experience, with a bridge link to `my-profile.html` for everything not yet migrated — while fixing a real fail-open bug found during design (an unrecognized/empty role currently defaults to full admin tab access).

**Architecture:** A shared `getAllowedTabs()` helper replaces three duplicated, differently-buggy copies of the same "which tabs can this person see" logic. The auth gate stops redirecting non-staff away and instead lazily provisions their profile (mirroring `my-profile.html`'s existing pattern). Two new tabs (`journey`, `account`) are added using content and CSS ported from `my-profile.html`, adapted to `dashboard.html`'s own existing button/form conventions rather than loading a second, colliding stylesheet.

**Tech Stack:** Static HTML/JS (no build step), Supabase.

**Full design context:** `docs/superpowers/specs/2026-09-27-unified-dashboard-shell-design.md`

**Testing note:** No automated test suite in this repo. Verification uses this repo's established pattern: reading deployed source via `curl`, and asking Scott to click through as different role types (no admin credentials available to Claude).

**Risk note:** This plan rewrites the auth gate of a live, daily-use admin tool. Task 6's staging verification checklist is not optional — do not skip ahead to production without it, per `CLAUDE.md`'s standing deployment rule.

---

### Task 1: Shared `getAllowedTabs()` helper (fixes a real fail-open bug)

**Files:**
- Modify: `admin/dashboard.html` (`ROLE_TABS`, `ALL_TABS`, `applyRoleVisibility`, `switchTab`)

- [ ] **Step 1: Add `member` to `ROLE_TABS`, add `journey`/`account` to every tier, add `journey`/`account` to `ALL_TABS`**

Find:

```js
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users'],
  event_manager:       ['events','sermons','email'],
};
```

Replace with:

```js
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users','journey','account'],
  event_manager:       ['events','sermons','email','journey','account'],
  member:              ['journey','account'],
};
```

Find:

```js
const ALL_TABS = ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users'];
```

Replace with:

```js
const ALL_TABS = ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users','journey','account'];
```

- [ ] **Step 2: Add the shared helper, right before `applyRoleVisibility`**

Find:

```js
function isAdmin() { return (window._userRoles || []).includes('admin'); }

function applyRoleVisibility() {
```

Replace with:

```js
function isAdmin() { return (window._userRoles || []).includes('admin'); }

// Shared by applyRoleVisibility, switchTab, and the auth-guard IIFE below --
// previously each computed this independently and all three fell back to
// ROLE_TABS.admin on an empty/unrecognized role combination. That fallback
// was harmless only because the auth gate used to redirect anyone who could
// hit it (no role, or small_group_leader-only) away before this code ever
// ran. Now that the gate no longer redirects those people away, this MUST
// fall back to the minimal ROLE_TABS.member tier instead, or a plain member
// would see the entire admin console.
function getAllowedTabs() {
  if (isAdmin()) return ROLE_TABS.admin;
  const union = Array.from(new Set((window._userRoles || []).flatMap(r => ROLE_TABS[r] || [])));
  return union.length ? union : ROLE_TABS.member;
}

function applyRoleVisibility() {
```

- [ ] **Step 3: Use the helper in `applyRoleVisibility`**

Find:

```js
function applyRoleVisibility() {
  const allowed = isAdmin()
    ? ROLE_TABS.admin
    : Array.from(new Set((window._userRoles || []).flatMap(r => ROLE_TABS[r] || [])));
  const effectiveAllowed = allowed.length ? allowed : ROLE_TABS.admin;
```

Replace with:

```js
function applyRoleVisibility() {
  const effectiveAllowed = getAllowedTabs();
```

- [ ] **Step 4: Use the helper in `switchTab`**

Find:

```js
function switchTab(tab) {
  // Block access to tabs the current role doesn't have
  const allowed = isAdmin()
    ? ROLE_TABS.admin
    : Array.from(new Set((window._userRoles || []).flatMap(r => ROLE_TABS[r] || [])));
  const effectiveAllowed = allowed.length ? allowed : ROLE_TABS.admin;
  if (!effectiveAllowed.includes(tab)) return;
```

Replace with:

```js
function switchTab(tab) {
  // Block access to tabs the current role doesn't have
  const effectiveAllowed = getAllowedTabs();
  if (!effectiveAllowed.includes(tab)) return;
```

- [ ] **Step 5: Verify**

```bash
grep -n "ROLE_TABS.member\|function getAllowedTabs" admin/dashboard.html
```

Expected: at least 2 matches (the `ROLE_TABS` object's `member` key, and the new function definition — plus its internal fallback reference).

```bash
grep -n "ROLE_TABS.admin;" admin/dashboard.html
```

Expected: exactly one remaining match — inside `getAllowedTabs()` itself (the legitimate admin case). If `applyRoleVisibility`/`switchTab` still show their own `: ROLE_TABS.admin` fallback, the find/replace didn't fully apply.

- [ ] **Step 6: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add shared getAllowedTabs() helper; fix fail-open fallback to member tier

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Auth-gate rewrite — stop redirecting non-staff, add self-registration

**Files:**
- Modify: `admin/dashboard.html` (the post-login IIFE)

- [ ] **Step 1: Replace the whole IIFE**

Find:

```js
(async () => {
  const user = await SupaDB.getUser();
  if (!user) { window.location.href = 'login.html?next=dashboard.html'; return; }
  window._currentUser = user;
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
  // Force password change before loading dashboard
  if (roleData && roleData.forcePasswordChange) {
    await new Promise(resolve => {
      window._passwordChangeDone = resolve;
      document.getElementById('forcePasswordModal').style.display = 'flex';
    });
  }
  applyRoleVisibility();
  SupaDB.getMyProfile().then(profile => {
    const link = document.getElementById('topbarAvatarLink');
    if (!link) return;
    link.innerHTML = buildAvatarHtml({
      name: profile ? profile.name : (window._currentUserName || ''),
      email: window._currentUser ? window._currentUser.email : '',
      avatarUrl: profile ? profile.avatarUrl : null,
    }, 34);
  }).catch(() => {});
  const allowed = isAdmin()
    ? ROLE_TABS.admin
    : Array.from(new Set(window._userRoles.flatMap(r => ROLE_TABS[r] || [])));
  const effectiveAllowed = allowed.length ? allowed : ROLE_TABS.admin;
  const urlTab = new URLSearchParams(window.location.search).get('tab');
  const startTab = (urlTab && effectiveAllowed.includes(urlTab)) ? urlTab : effectiveAllowed[0];
  switchTab(startTab);
  if (isAdmin()) updateStats();
  if (isAdmin()) {
    SupaDB.adminGetAllMemberProfiles().then(ps => {
      const n = ps.filter(p => p.status === 'pending').length;
      const b = document.getElementById('peopleBadge');
      if (n) { b.style.display = ''; b.textContent = n; }
    }).catch(() => {});
  }
})();
```

Replace with:

```js
(async () => {
  const user = await SupaDB.getUser();
  if (!user) { window.location.href = 'login.html?next=dashboard.html'; return; }
  window._currentUser = user;
  const roleData = await SupaDB.getUserRoleByEmail(user.email);
  window._userRoles = (roleData && roleData.roles) || [];
  window._currentUserName = (roleData && roleData.displayName) ? roleData.displayName : '';

  // Every authenticated visitor gets a profile row -- self-registered
  // members are lazily provisioned here, the same way my-profile.html
  // already does it. This page no longer redirects anyone away.
  _profile = await SupaDB.getMyProfile();
  if (!_profile) {
    const r = await SupaDB.createMyProfile();
    if (!r.error) _profile = await SupaDB.getMyProfile();
  }
  if (!_profile) { alert('Could not load your profile. Please try again.'); return; }
  if (_profile.status === 'pending' && !roleData) document.getElementById('pendingBanner').style.display = '';

  // Force password change before loading dashboard
  if (roleData && roleData.forcePasswordChange) {
    await new Promise(resolve => {
      window._passwordChangeDone = resolve;
      document.getElementById('forcePasswordModal').style.display = 'flex';
    });
  }
  applyRoleVisibility();
  const topbarLink = document.getElementById('topbarAvatarLink');
  if (topbarLink) {
    topbarLink.innerHTML = buildAvatarHtml({
      name: _profile.name || window._currentUserName || '',
      email: window._currentUser.email,
      avatarUrl: _profile.avatarUrl,
    }, 34);
  }
  const effectiveAllowed = getAllowedTabs();
  const urlTab = new URLSearchParams(window.location.search).get('tab');
  const startTab = (urlTab && effectiveAllowed.includes(urlTab)) ? urlTab : effectiveAllowed[0];
  switchTab(startTab);
  await loadMyJourneyData();
  if (isAdmin()) updateStats();
  if (isAdmin()) {
    SupaDB.adminGetAllMemberProfiles().then(ps => {
      const n = ps.filter(p => p.status === 'pending').length;
      const b = document.getElementById('peopleBadge');
      if (n) { b.style.display = ''; b.textContent = n; }
    }).catch(() => {});
  }
})();
```

(`loadMyJourneyData()` is a new function added in Task 6 — this step wires the call site now; the function itself doesn't exist yet, which is fine since it isn't invoked until page load, by which point Task 6 will already be part of the same merged branch.)

- [ ] **Step 2: Declare the two new page-level variables Task 6 will populate**

Find:

```js
const ALL_TABS = ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users','journey','account'];
```

Replace with:

```js
const ALL_TABS = ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users','journey','account'];
let _profile = null, _journeyData = null;
```

- [ ] **Step 3: Verify**

```bash
grep -n "window.location.href = 'my-profile.html'" admin/dashboard.html
```

Expected: zero matches — the redirect is gone.

```bash
grep -n "let _profile = null, _journeyData = null;" admin/dashboard.html
```

Expected: one match.

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html
git commit -m "Stop redirecting non-staff away; add self-registration to the auth gate

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Port the CSS the Account panel needs

**Files:**
- Modify: `admin/dashboard.html` (inline `<style>` block)

- [ ] **Step 1: Add the missing rules right after the existing `.btn-ghost:hover` rule**

Find:

```css
    .btn-ghost { background: transparent; color: var(--text-muted); border-color: var(--border); }
    .btn-ghost:hover { background: var(--bg); color: var(--text); }
```

Replace with:

```css
    .btn-ghost { background: transparent; color: var(--text-muted); border-color: var(--border); }
    .btn-ghost:hover { background: var(--bg); color: var(--text); }
    /* Ported from css/portal.css for the new My Journey/My Info tabs --
       intentionally NOT loading portal.css itself, since its .btn-primary/
       .btn-ghost are full standalone button styles that collide with this
       file's own .btn-primary/.btn-ghost (modifier classes meant to pair
       with .btn). Only the non-colliding rules below were ported; the new
       panels' buttons use this file's existing class="btn btn-primary"
       convention instead of portal.css's bare class="btn-primary". */
    .portal-card { background: #fff; border-radius: var(--radius-lg); box-shadow: 0 1px 3px rgba(0,0,0,.08); padding: 28px; margin-bottom: 20px; }
    .portal-card h2 { font-size: 1.2rem; margin-bottom: 4px; }
    .portal-card .sub { color: var(--text-muted); font-size: .9rem; margin-bottom: 20px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: 6px; }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%; padding: .65rem 1rem; border: 1.5px solid var(--border); border-radius: 10px;
      font-family: inherit; font-size: .9375rem; outline: none; background: #fff; transition: border-color .2s;
    }
    .form-group textarea { resize: vertical; min-height: 44px; }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
      border-color: var(--primary); box-shadow: 0 0 0 3px rgba(188,122,30,.15);
    }
    .msg-error {
      background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.3); color: #dc2626;
      border-radius: 8px; padding: 10px 14px; font-size: .875rem; margin-top: 12px; display: none;
    }
    .msg-error.show { display: block; }
    .msg-success {
      background: rgba(34,197,94,.08); border: 1px solid rgba(34,197,94,.3); color: #16a34a;
      border-radius: 8px; padding: 10px 14px; font-size: .875rem; margin-top: 12px; display: none;
    }
    .msg-success.show { display: block; }
    .toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .banner-pending {
      background: rgba(188,122,30,.1); border: 1px solid rgba(188,122,30,.35); color: #92400e;
      border-radius: 10px; padding: 12px 16px; font-size: .9rem; margin-bottom: 20px;
    }
```

(`var(--error)`/`var(--success)` from the original portal.css rules were replaced with literal hex colors, since those custom properties are only defined in `portal.css`'s own `:root` block, not in `dashboard.html`'s. The literal colors match portal.css's own token values.)

- [ ] **Step 2: Verify**

```bash
grep -n "\.portal-card {" admin/dashboard.html
```

Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Port the CSS the new My Info panel needs, without loading portal.css

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Sidebar nav, pendingBanner, and the two new panels

**Files:**
- Modify: `admin/dashboard.html` (sidebar nav, topbar area, tab-panel content)

- [ ] **Step 1: Add the new nav section at the end of the sidebar**

Find:

```html
    <a onclick="switchTab('users')" id="sideUsers" data-tab="users">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      User Permissions
    </a>
  </nav>
```

Replace with:

```html
    <a onclick="switchTab('users')" id="sideUsers" data-tab="users">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      User Permissions
    </a>

    <div class="nav-section" id="navSectionProfile">My Profile</div>
    <a onclick="switchTab('journey')" id="sideJourney" data-tab="journey">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>
      My Journey
    </a>
    <a onclick="switchTab('account')" id="sideAccount" data-tab="account">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      My Info
    </a>
    <a href="my-profile.html">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
      Full Profile
    </a>
  </nav>
```

- [ ] **Step 2: Add the pendingBanner, right after wherever the first `tab-panel` div opens**

Find:

```html
    <div class="tab-panel" id="panelEvents">
```

Replace with:

```html
    <div id="pendingBanner" class="banner-pending" style="display:none;">
      Your profile is awaiting approval from church staff. You can take your
      assessments now — results will appear to staff once you're approved.
    </div>

    <div class="tab-panel" id="panelEvents">
```

- [ ] **Step 3: Add the two new tab-panel divs, right before `</nav>`'s sibling content ends (immediately after the last existing tab-panel, before the closing `.main`/body scripts)**

Find:

```html
    <div class="tab-panel" id="panelUsers">
```

(Use this as an anchor purely to confirm you're in the right region of the file — do not modify it. Instead, find the closing of the LAST tab-panel div in the file, which is `panelUsers`'s own content, and insert the two new panels as siblings immediately after that panel's closing `</div>`. Locate it by reading the file around `id="panelUsers"` and finding where that specific `<div>` block closes, then insert:)

```html
      <div class="tab-panel" id="panelJourney">
        <div id="journeyPipelineBox"></div>
      </div>

      <div class="tab-panel" id="panelAccount">
        <div class="portal-card" id="profileCard">
          <h2>My Information</h2>
          <p class="sub">Keep your contact info and group up to date.</p>
          <div class="form-group"><label>Full Name</label><input id="pfName" /></div>
          <div class="form-group"><label>Email</label><input id="pfEmail" disabled /></div>
          <div class="form-group"><label>Phone</label><input id="pfPhone" /></div>
          <div class="form-group"><label>Small Group</label><select id="pfGroup"></select></div>
          <div class="form-group"><label>How long at Heritage Hill?</label>
            <select id="pfYears">
              <option value="">— Select —</option>
              <option>Less than 1 year</option><option>1–3 years</option>
              <option>3–5 years</option><option>More than 5 years</option>
            </select></div>
          <div class="toggle-row" style="margin:18px 0;">
            <div><strong>Share my results with my group leader</strong>
              <div class="sub" style="margin:0;">Your leader can see your personality and gifts to help you find your place.</div></div>
            <input type="checkbox" id="pfShare" style="width:22px;height:22px;" />
          </div>
          <button class="btn btn-primary" onclick="saveProfile()">Save Changes</button>
          <div class="msg-success" id="pfSaved">Saved.</div>
          <div class="msg-error" id="pfError"></div>
        </div>

        <div class="portal-card">
          <h2>Profile Photo</h2>
          <p class="sub">Shown next to your name across the site.</p>
          <div style="display:flex; align-items:center; gap:16px; margin-bottom:14px;">
            <div id="avatarPreview" style="width:80px; height:80px; border-radius:50%; background:#F4F4F2; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;"></div>
            <div>
              <input type="file" id="avatarFile" accept="image/*" onchange="handleAvatarFile(this)" style="display:none;" />
              <button type="button" class="btn btn-primary" onclick="document.getElementById('avatarFile').click()">Choose Photo</button>
              <button type="button" class="btn btn-ghost" onclick="saveAvatar()" id="avatarSaveBtn" style="display:none; margin-left:8px;">Save Photo</button>
              <br />
              <button type="button" class="btn btn-ghost" onclick="removeAvatar()" id="avatarRemoveBtn" style="margin-top:8px; display:none;">Remove Photo</button>
            </div>
          </div>
          <div class="msg-success" id="avatarSaved">Saved.</div>
          <div class="msg-error" id="avatarError"></div>
        </div>

        <div class="portal-card">
          <h2>Change Password</h2>
          <div class="form-group"><label>New Password</label><input type="password" id="pwNew" /></div>
          <div class="form-group"><label>Confirm</label><input type="password" id="pwConfirm" /></div>
          <button class="btn btn-primary" onclick="changePassword()">Update Password</button>
          <div class="msg-success" id="pwSaved">Password updated.</div>
          <div class="msg-error" id="pwError"></div>
        </div>
      </div>
```

(This is the exact HTML from `admin/my-profile.html`'s `panelAccount`, with every bare `class="btn-primary"`/`class="btn-ghost"` changed to `class="btn btn-primary"`/`class="btn btn-ghost"` to match this file's own button convention, per Task 3's note. Field IDs — `pfName`, `pfEmail`, `pfPhone`, `pfGroup`, `pfYears`, `pfShare`, `pwNew`, `pwConfirm`, `avatarPreview`, `avatarFile`, `avatarSaveBtn`, `avatarRemoveBtn` — are unchanged so Task 5's ported JS functions work without modification.)

- [ ] **Step 4: Verify**

```bash
grep -n "id=\"sideJourney\"\|id=\"sideAccount\"\|id=\"pendingBanner\"\|id=\"panelJourney\"\|id=\"panelAccount\"\|id=\"journeyPipelineBox\"" admin/dashboard.html
```

Expected: one match each (6 total).

```bash
grep -c 'class="btn-primary"\|class="btn-ghost"' admin/dashboard.html
```

Expected: `0` — confirming every button in the newly-added Account panel uses `class="btn btn-primary"`/`class="btn btn-ghost"`, not the bare portal.css-style classes.

- [ ] **Step 5: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add My Profile nav section, pendingBanner, and Journey/Account panels

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Port the Account/avatar JS functions

**Files:**
- Modify: `admin/dashboard.html` (add new functions; a good anchor point is right before the closing `</script>` tag, or immediately after `escapeHtml`'s definition — pick whichever is closer to the end of the existing script for a clean append)

- [ ] **Step 1: Add the functions, appended right after the existing `escapeHtml` function**

Find:

```js
function escapeHtml(s) {
```

(Read enough context around this to find where `escapeHtml`'s function body ends — insert the new code immediately after its closing `}`, not inside it.)

Insert immediately after `escapeHtml`'s closing brace:

```js

async function saveProfile() {
  const r = await SupaDB.updateMyProfile({
    name: document.getElementById('pfName').value.trim(),
    phone: document.getElementById('pfPhone').value.trim(),
    groupId: document.getElementById('pfGroup').value || null,
    yearsAttending: document.getElementById('pfYears').value,
    shareWithLeader: document.getElementById('pfShare').checked,
  });
  const ok = document.getElementById('pfSaved'), err = document.getElementById('pfError');
  ok.classList.toggle('show', !r.error);
  err.classList.toggle('show', !!r.error);
  if (r.error) err.textContent = r.error;
  setTimeout(() => ok.classList.remove('show'), 2500);
}

async function changePassword() {
  const pw = document.getElementById('pwNew').value;
  const err = document.getElementById('pwError'), ok = document.getElementById('pwSaved');
  err.classList.remove('show'); ok.classList.remove('show');
  if (pw.length < 8) { err.textContent = 'At least 8 characters.'; err.classList.add('show'); return; }
  if (pw !== document.getElementById('pwConfirm').value) {
    err.textContent = 'Passwords do not match.'; err.classList.add('show'); return;
  }
  try {
    await SupaDB.updatePassword(pw);
    ok.classList.add('show');
    document.getElementById('pwNew').value = ''; document.getElementById('pwConfirm').value = '';
  } catch (e) {
    err.textContent = (e && e.message) || 'Could not update password.';
    err.classList.add('show');
  }
}

let _pendingAvatarUrl = null;

function isSafeAvatarUrl(url) {
  return typeof url === 'string' && /^(data:image\/|https:\/\/)/i.test(url);
}

function renderAvatarPreview(avatarUrl) {
  const box = document.getElementById('avatarPreview');
  if (avatarUrl && isSafeAvatarUrl(avatarUrl)) {
    box.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="Profile" style="width:100%;height:100%;object-fit:cover;" />`;
  } else {
    box.innerHTML = `<svg width="36" height="36" fill="none" stroke="#6B6B6B" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
  }
}

function handleAvatarFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const SIZE = 160;
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
      _pendingAvatarUrl = canvas.toDataURL('image/jpeg', 0.8);
      renderAvatarPreview(_pendingAvatarUrl);
      document.getElementById('avatarSaveBtn').style.display = '';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function saveAvatar() {
  if (!_pendingAvatarUrl) return;
  const err = document.getElementById('avatarError'), ok = document.getElementById('avatarSaved');
  err.classList.remove('show'); ok.classList.remove('show');
  const r = await SupaDB.updateMyAvatar(_pendingAvatarUrl);
  if (r.error) { err.textContent = r.error; err.classList.add('show'); return; }
  ok.classList.add('show');
  document.getElementById('avatarSaveBtn').style.display = 'none';
  document.getElementById('avatarRemoveBtn').style.display = '';
  _pendingAvatarUrl = null;
  setTimeout(() => ok.classList.remove('show'), 2500);
}

async function removeAvatar() {
  const err = document.getElementById('avatarError'), ok = document.getElementById('avatarSaved');
  err.classList.remove('show'); ok.classList.remove('show');
  const r = await SupaDB.updateMyAvatar(null);
  if (r.error) { err.textContent = r.error; err.classList.add('show'); return; }
  renderAvatarPreview(null);
  document.getElementById('avatarRemoveBtn').style.display = 'none';
  document.getElementById('avatarSaveBtn').style.display = 'none';
  _pendingAvatarUrl = null;
  ok.classList.add('show');
  setTimeout(() => ok.classList.remove('show'), 2500);
}
```

(Ported verbatim from `admin/my-profile.html` — no logic changes. `signOut()` was deliberately NOT ported; `dashboard.html` already has its own sign-out mechanism.)

- [ ] **Step 2: Verify**

```bash
grep -n "^async function saveProfile\|^async function changePassword\|^function renderAvatarPreview\|^function handleAvatarFile\|^async function saveAvatar\|^async function removeAvatar\|^function isSafeAvatarUrl" admin/dashboard.html
```

Expected: one match each (7 total).

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Port Account/avatar/password functions from my-profile.html

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Personal-data fetch, `renderJourneyPanel()`, and `switchTab` wiring

**Files:**
- Modify: `admin/dashboard.html` (new `loadMyJourneyData()`/`renderJourneyPanel()` functions, `switchTab`'s `titles` map and dispatch chain)

- [ ] **Step 1: Add `loadMyJourneyData()` and `renderJourneyPanel()`, right after the ported avatar functions from Task 5**

Find:

```js
async function removeAvatar() {
  const err = document.getElementById('avatarError'), ok = document.getElementById('avatarSaved');
  err.classList.remove('show'); ok.classList.remove('show');
  const r = await SupaDB.updateMyAvatar(null);
  if (r.error) { err.textContent = r.error; err.classList.add('show'); return; }
  renderAvatarPreview(null);
  document.getElementById('avatarRemoveBtn').style.display = 'none';
  document.getElementById('avatarSaveBtn').style.display = 'none';
  _pendingAvatarUrl = null;
  ok.classList.add('show');
  setTimeout(() => ok.classList.remove('show'), 2500);
}
```

Replace with:

```js
async function removeAvatar() {
  const err = document.getElementById('avatarError'), ok = document.getElementById('avatarSaved');
  err.classList.remove('show'); ok.classList.remove('show');
  const r = await SupaDB.updateMyAvatar(null);
  if (r.error) { err.textContent = r.error; err.classList.add('show'); return; }
  renderAvatarPreview(null);
  document.getElementById('avatarRemoveBtn').style.display = 'none';
  document.getElementById('avatarSaveBtn').style.display = 'none';
  _pendingAvatarUrl = null;
  ok.classList.add('show');
  setTimeout(() => ok.classList.remove('show'), 2500);
}

// Fills the Account form and loads everything My Journey needs -- runs
// once at page load for every logged-in person (staff or not), same data
// shape as admin/my-profile.html's identically-named block. This is
// separate from the admin-only bulk data loads elsewhere in this file
// (those stay gated behind isAdmin()); this one always runs, since every
// visitor has their own personal journey regardless of role.
async function loadMyJourneyData() {
  document.getElementById('pfName').value  = _profile.name;
  document.getElementById('pfEmail').value = _profile.email;
  document.getElementById('pfPhone').value = _profile.phone;
  document.getElementById('pfYears').value = _profile.yearsAttending || '';
  document.getElementById('pfShare').checked = _profile.shareWithLeader;
  renderAvatarPreview(_profile.avatarUrl);
  if (_profile.avatarUrl) document.getElementById('avatarRemoveBtn').style.display = '';
  const groups = await SupaDB.getPublishedGroups();
  const sel = document.getElementById('pfGroup');
  sel.innerHTML = '<option value="">— Not in a group —</option>' +
    groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
  sel.value = _profile.groupId || '';

  const [attempts, content, gtRegs, memberships, semesters, teamMemberships, teams, milestones, events] = await Promise.all([
    SupaDB.getMyAttempts(), SupaDB.getAssessmentContent(),
    SupaDB.getGrowthTrackRegistrationsForUser(window._currentUser.id), SupaDB.getGroupMembershipsForUser(window._currentUser.id),
    SupaDB.getSemesters(),
    SupaDB.getImpactTeamMembershipsForUser(window._currentUser.id), SupaDB.getPublishedImpactTeams(),
    SupaDB.getMyMilestones(_profile.personId),
    SupaDB.adminGetAllEvents(),
  ]);
  _journeyData = {
    content: Assessments.splitContent(content), gtRegs, memberships, groups, semesters, teamMemberships, teams, events,
    discAttempts: attempts.filter(a => a.assessmentType === 'disc'),
    giftsAttempts: attempts.filter(a => a.assessmentType === 'gifts'),
    baptism: milestones.find(m => m.milestone === 'baptized'),
  };
}

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
  });
}
```

(No stage-click callbacks are wired here — unlike `my-profile.html`, this page's "Full Profile" bridge link already handles navigating to the not-yet-migrated Baptism/Groups/Growth Track/Impact Teams content, so clicking a stage header here doesn't need to jump anywhere within this page yet.)

- [ ] **Step 2: Wire `switchTab`'s titles map and dispatch chain**

Find:

```js
  const titles = {events:'Events',connect:'Connect Submissions',groups:'Small Groups',signups:'Sign-Up Requests',applications:'Leader Applications',subscribers:'Newsletter Subscribers',prayer:'Prayer Requests',retreat:'Retreat 2026',attendance:'Attendance',sermons:'Sermons',email:'Email',settings:'Settings',users:'User Permissions',people:'Membership',baptism:'Baptism',analytics:'Analytics',growthtrack:'Growth Track',impactteams:'Impact Teams'};
```

Replace with:

```js
  const titles = {events:'Events',connect:'Connect Submissions',groups:'Small Groups',signups:'Sign-Up Requests',applications:'Leader Applications',subscribers:'Newsletter Subscribers',prayer:'Prayer Requests',retreat:'Retreat 2026',attendance:'Attendance',sermons:'Sermons',email:'Email',settings:'Settings',users:'User Permissions',people:'Membership',baptism:'Baptism',analytics:'Analytics',growthtrack:'Growth Track',impactteams:'Impact Teams',journey:'My Journey',account:'My Info'};
```

Find:

```js
  else if(tab==='impactteams') renderImpactTeamsTable();
}
```

Replace with:

```js
  else if(tab==='impactteams') renderImpactTeamsTable();
  else if(tab==='journey') renderJourneyPanel();
}
```

(No dispatch entry is needed for `'account'` — its form fields are filled once by `loadMyJourneyData()` at page load, the same way `my-profile.html`'s Account panel doesn't re-render on tab switch either.)

- [ ] **Step 3: Verify**

```bash
grep -n "async function loadMyJourneyData\|function renderJourneyPanel\|journey:'My Journey'\|tab==='journey'" admin/dashboard.html
```

Expected: one match each (4 total).

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html
git commit -m "Load personal journey data and wire My Journey into switchTab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end verification on staging

**Files:** none (verification only)

- [ ] **Step 1: Push to staging**

```bash
git push staging main
```

- [ ] **Step 2: Confirm the deployed page has the changes**

```bash
curl -s https://sspratlen.github.io/HeritageHill-staging/admin/dashboard.html | grep -o "sideJourney\|sideAccount\|getAllowedTabs\|ROLE_TABS.member\|pendingBanner" | sort -u
```

Expected: all five strings present.

- [ ] **Step 3: Ask Scott to click through and confirm on staging**

Given this rewrites the auth gate of the live admin tool, this checklist is not optional:

1. **A plain member with no staff role** — log in (or self-register) and confirm: no redirect away, lands on "My Journey" by default, sees ONLY "My Journey"/"My Info"/"Full Profile" in the sidebar (no admin tabs, no stats row, no admin-only data of any kind), the pending banner shows if applicable, and "Full Profile" correctly opens `my-profile.html` for Baptism/Groups/Growth Track/Impact Teams/Events.
2. **An admin** — confirm every existing admin tab is still present and working exactly as before, PLUS the new "My Journey"/"My Info" tabs appear and show correct personal data, PLUS "Full Profile" still works as a bridge.
3. **An event_manager** — confirm they still only see Events/Sermons/Email (their existing scope) plus the two new personal tabs — nothing more.
4. **My Info panel** — update your name/phone/group, save, confirm it persists; upload/remove a profile photo; change your password (carefully — confirm you can still log in afterward).
5. **My Journey panel** — confirm real data renders (baptism, membership, small groups, Growth Track, DISC/Gifts, Impact Teams), matching what the same person sees on `my-profile.html`'s own My Journey.
6. **The fail-open fix specifically** — this is the most important check: confirm a plain member absolutely cannot reach any admin-only tab, table, or data, under any circumstance (including by manually editing the `?tab=` URL parameter to an admin tab name).

- [ ] **Step 4: Stop here — do not touch production**

Per `CLAUDE.md`'s standing deployment rule, do not push to `origin` (production) until Scott explicitly approves promoting this specific change, after confirming every item in Step 3 on staging. Given this rewrites the auth gate of the live, daily-use admin tool, treat this approval gate as especially firm — this is the highest-risk change of this entire work session.

---

## Self-Review Notes

- **Spec coverage:** Fail-open fix + shared helper (Task 1), auth-gate rewrite (Task 2), CSS (Task 3), nav/panels (Task 4), ported functions (Task 5), data-fetch + wiring (Task 6), rollout (Task 7) — every section of the design doc maps to a task.
- **Placeholder scan:** No TBD/TODO. Task 4 Step 3's find/replace instruction is slightly less literal than others (it asks the implementer to locate a closing `</div>` rather than giving an exact multi-hundred-line find block for the entire `panelUsers` panel) — this is a deliberate, bounded exception given how large that panel's existing content is; the *insertion content* itself is fully literal and complete.
- **Type/name consistency:** `_profile`/`_journeyData` are declared once (Task 2) and consumed with identical names in `loadMyJourneyData()`/`renderJourneyPanel()` (Task 6). `getAllowedTabs()` is defined once (Task 1) and consumed identically in `applyRoleVisibility`, `switchTab`, and the auth-guard IIFE (Tasks 1 and 2). Every field ID used by the ported Account panel HTML (Task 4) matches exactly what the ported JS functions (Task 5) and `loadMyJourneyData()` (Task 6) read/write.
