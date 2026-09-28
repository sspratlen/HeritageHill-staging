# Retire admin/my-profile.html Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redirect every remaining entry point away from `admin/my-profile.html` toward `admin/dashboard.html`, remove now-dead bridge/fallback code, then delete `admin/my-profile.html` and its exclusive stylesheet `css/dashboard-shell.css`.

**Architecture:** Pure navigation/dead-code cleanup across 7 files, followed by a `git rm` of 2 files. No new functionality, no schema changes. Single task — every edit is small and the file count is only large because the same one-line change repeats across independent entry points.

**Tech Stack:** Static HTML/JS, no build step.

---

### Task 1: Redirect all entry points, remove dead code, delete the retired files

**Files:**
- Modify: `admin/dashboard.html` (4 locations)
- Modify: `admin/test-gifts.html:18,112`
- Modify: `admin/test-personality.html:18,112`
- Modify: `js/main.js:142`
- Modify: `admin/register.html:236`
- Modify: `admin/tap-control.html:236`
- Modify: `connect/index.html:313`
- Delete: `admin/my-profile.html`
- Delete: `css/dashboard-shell.css`

- [ ] **Step 1: Remove the sidebar "Full Profile" bridge link in `admin/dashboard.html`**

Find (around line 425-429):
```html
    <div class="nav-section" id="navSectionProfile">My Profile</div>
    <a href="my-profile.html">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
      Full Profile
    </a>
  </nav>
```

Replace with:
```html
  </nav>
```

- [ ] **Step 2: Change the topbar avatar link from navigation to an in-page tab switch**

Find (around line 460):
```html
      <a href="my-profile.html" id="topbarAvatarLink" title="My Profile & Assessments" style="display:flex;align-items:center;text-decoration:none;"></a>
```

Replace with:
```html
      <a href="#" onclick="switchTab('myinfo');return false;" id="topbarAvatarLink" title="My Profile & Assessments" style="display:flex;align-items:center;text-decoration:none;"></a>
```

- [ ] **Step 3: Fix the now-false User Permissions prose in `admin/dashboard.html`**

Find (around line 1314):
```html
        <strong style="color:var(--text);">Event Manager</strong> — Events (including sign-ups), Sermons, Email.<br>
        Small group leaders no longer use this dashboard — they manage their group from their own <a href="my-profile.html" style="color:var(--primary);">My Profile</a> page instead.
      </div>
```

Replace with:
```html
        <strong style="color:var(--text);">Event Manager</strong> — Events (including sign-ups), Sermons, Email.
      </div>
```

- [ ] **Step 4: Remove the dead `my-profile.html` fallback in `renderJourneyPanel()`'s `onStopClick`, `admin/dashboard.html`**

Find:
```js
// Treasure-map view of the viewer's own journey (js/journey-map.js). Each
// stop opens its dashboard tab when this role can reach it; otherwise it
// falls back to the matching my-profile.html panel, or to My Info when
// there's no personal panel (Membership). As tabs get added to
// ROLE_TABS.member, their stops switch over with no change needed here.
function renderJourneyPanel() {
```

Replace with:
```js
// Treasure-map view of the viewer's own journey (js/journey-map.js). Each
// stop opens its dashboard tab when this role can reach it, or falls back
// to My Info when there's no tab for it (e.g. Membership). As tabs get
// added to ROLE_TABS.member, their stops switch over with no change needed
// here.
function renderJourneyPanel() {
```

Then find:
```js
    onStopClick: stop => {
      if (getAllowedTabs().includes(stop.tab)) switchTab(stop.tab);
      else if (stop.profilePanel) location.href = 'my-profile.html#' + stop.profilePanel;
      else switchTab('myinfo');
    },
```

Replace with:
```js
    onStopClick: stop => {
      if (getAllowedTabs().includes(stop.tab)) switchTab(stop.tab);
      else switchTab('myinfo');
    },
```

- [ ] **Step 5: Update `admin/test-gifts.html`'s back-link and post-save redirect**

Find (line 18):
```html
      <a href="my-profile.html">← My Profile</a>
```

Replace with:
```html
      <a href="dashboard.html">← Dashboard</a>
```

Find (line 112):
```js
      window.location.href = 'my-profile.html';
```

Replace with:
```js
      window.location.href = 'dashboard.html';
```

- [ ] **Step 6: Update `admin/test-personality.html`'s back-link and post-save redirect**

Apply the identical two find/replace pairs from Step 5 to `admin/test-personality.html` (same line numbers, same old/new text).

- [ ] **Step 7: Simplify `js/main.js`'s `renderNavAvatar()` to always link to the dashboard**

Find (line 142):
```js
    const dest = siteRootPrefix() + (roleData ? 'admin/dashboard.html' : 'admin/my-profile.html');
```

Replace with:
```js
    const dest = siteRootPrefix() + 'admin/dashboard.html';
```

- [ ] **Step 8: Redirect `admin/register.html` to the dashboard after self-registration**

Find (line 236):
```js
    if (session) { window.location.href = 'my-profile.html'; }
```

Replace with:
```js
    if (session) { window.location.href = 'dashboard.html'; }
```

- [ ] **Step 9: Redirect `admin/tap-control.html`'s roleless/leader-only fallback to the dashboard**

Find (line 236):
```js
    if (!roleData || (rlRoles.length === 1 && rlRoles[0] === 'small_group_leader')) { window.location.href = 'my-profile.html'; return; }
```

Replace with:
```js
    if (!roleData || (rlRoles.length === 1 && rlRoles[0] === 'small_group_leader')) { window.location.href = 'dashboard.html'; return; }
```

- [ ] **Step 10: Redirect `connect/index.html`'s post-account-creation session to the dashboard**

Find (line 313):
```js
    window.location.href = '../admin/my-profile.html';
```

Replace with:
```js
    window.location.href = '../admin/dashboard.html';
```

- [ ] **Step 11: Verify no reference to the retired file remains**

Run: `grep -rn "my-profile" admin/ js/ connect/ --include="*.html" --include="*.js"`
Expected: no output (empty).

- [ ] **Step 12: Delete the retired file and its exclusive stylesheet**

```bash
git rm admin/my-profile.html css/dashboard-shell.css
```

- [ ] **Step 13: Verify `css/portal.css` is untouched and still referenced by the two test pages**

Run: `grep -l "portal.css" admin/*.html`
Expected: `admin/test-gifts.html` and `admin/test-personality.html` (and no error about a missing file).

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "Retire admin/my-profile.html, redirect entry points to dashboard.html"
```

## Testing / rollout

No automated test suite. After merge, push to `staging` and verify via `curl` against the deployed site: confirm `grep -o my-profile` returns nothing across `admin/dashboard.html`, `js/main.js`, `admin/register.html`, `admin/tap-control.html`, `admin/test-gifts.html`, `admin/test-personality.html`, `connect/index.html`, and confirm `admin/my-profile.html` itself now 404s. Ask Scott to click through as a plain member and as a leader to confirm the topbar avatar switches to My Info in place, and that fresh self-registration (both `register.html` and the Connect page) lands on `dashboard.html`. Production only after staging verification and Scott's explicit go-ahead.
