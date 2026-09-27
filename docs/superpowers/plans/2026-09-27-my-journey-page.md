# My Journey Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "My Journey" nav item + panel to `admin/my-profile.html`, rendering the existing `MemberDashboard.renderJourneyPipeline()` visual against data the page already fetches, as the new default landing panel — with clickable stage headers that jump to the corresponding detailed panel.

**Architecture:** One small, backward-compatible extension to the shared `js/member-dashboard.js` component (four new optional click callbacks), and a wiring-only change to `admin/my-profile.html` (new nav item, new panel, one new render function using data already in memory, no new queries).

**Tech Stack:** Static HTML/JS (no build step).

**Full design context:** `docs/superpowers/specs/2026-09-27-my-journey-page-design.md`

**Testing note:** No automated test suite in this repo. Verification uses this repo's established pattern: reading deployed source via `curl`, and asking Scott to click through (no admin credentials available to Claude).

---

### Task 1: Extend `renderJourneyPipeline` with optional stage-click callbacks

**Files:**
- Modify: `js/member-dashboard.js` (`renderJourneyPipeline`)

- [ ] **Step 1: Add the stage-click wiring after the existing DISC/gifts post-render step**

Find:

```js
    const giftsBox = containerEl.querySelector('#jpGiftsResult');
    if (giftsBox) {
      if (opts.giftsAttempt && opts.giftsContent) {
        this.renderGiftsResult(giftsBox, opts.giftsAttempt, opts.giftsContent, opts.giftsAttemptCount);
      } else {
        giftsBox.innerHTML = '<p class="jp-empty">Not taken yet.</p>';
      }
    }
  },
```

Replace with:

```js
    const giftsBox = containerEl.querySelector('#jpGiftsResult');
    if (giftsBox) {
      if (opts.giftsAttempt && opts.giftsContent) {
        this.renderGiftsResult(giftsBox, opts.giftsAttempt, opts.giftsContent, opts.giftsAttemptCount);
      } else {
        giftsBox.innerHTML = '<p class="jp-empty">Not taken yet.</p>';
      }
    }

    // Optional, backward-compatible: pages that want each stage header to
    // navigate somewhere (e.g. a member's own profile jumping to the full
    // Baptism/Groups/Growth Track/Impact Teams panel) can pass
    // onFoundClick/onFilledClick/onFreedClick/onForgedClick. Callers that
    // don't pass these (e.g. admin/member-dashboard.html, viewing someone
    // else) get today's plain, non-interactive stage headers, unchanged.
    const stageClickHandlers = [opts.onFoundClick, opts.onFilledClick, opts.onFreedClick, opts.onForgedClick];
    containerEl.querySelectorAll('.jp-stage-head').forEach((el, i) => {
      if (stageClickHandlers[i]) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', stageClickHandlers[i]);
      }
    });
  },
```

- [ ] **Step 2: Verify**

```bash
grep -n "onFoundClick\|onFilledClick\|onFreedClick\|onForgedClick\|stageClickHandlers" js/member-dashboard.js
```

Expected: 5 matches (the four opts references plus the array declaration).

- [ ] **Step 3: Confirm the existing caller is unaffected**

```bash
grep -n "renderJourneyPipeline" admin/member-dashboard.html
```

Expected: one call site, and it does not pass any `on*Click` options — confirming its stage headers remain non-interactive after this change (no edit needed there).

- [ ] **Step 4: Commit**

```bash
git add js/member-dashboard.js
git commit -m "Add optional stage-click callbacks to renderJourneyPipeline

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Add the My Journey nav item and panel to `admin/my-profile.html`

**Files:**
- Modify: `admin/my-profile.html` (nav section, shell title, shell-content panel, `PANELS`/`PANEL_TITLES`, the init IIFE's render-calls sequence)

- [ ] **Step 1: Add the nav item, remove Baptism's default-active state**

Find:

```html
    <nav class="shell-nav">
      <div class="nav-section nav-stage" id="navFound">
        <span class="nav-stage-circle">01</span>
        <span class="nav-stage-text"><span class="nav-stage-name">Found</span><span class="nav-section-verse">by God</span></span>
      </div>
      <a onclick="switchPanel('baptism')" id="navBaptism" data-panel="baptism" class="active nav-sub">
```

Replace with:

```html
    <nav class="shell-nav">
      <div class="nav-section">
        <a onclick="switchPanel('journey')" id="navJourney" data-panel="journey" class="active nav-sub">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>
          My Journey
        </a>
      </div>
      <div class="nav-section nav-stage" id="navFound">
        <span class="nav-stage-circle">01</span>
        <span class="nav-stage-text"><span class="nav-stage-name">Found</span><span class="nav-section-verse">by God</span></span>
      </div>
      <a onclick="switchPanel('baptism')" id="navBaptism" data-panel="baptism" class="nav-sub">
```

- [ ] **Step 2: Change the static initial shell title**

Find:

```html
        <h1 id="shellTitle">Baptism</h1>
```

Replace with:

```html
        <h1 id="shellTitle">My Journey</h1>
```

- [ ] **Step 3: Add the panel, remove Baptism's default-active state**

Find:

```html
      <div class="shell-panel active" id="panelBaptism">
        <div id="baptismCardBox"><p style="color:var(--text-muted);">Loading…</p></div>
      </div>
```

Replace with:

```html
      <div class="shell-panel active" id="panelJourney">
        <div id="journeyPipelineBox"></div>
      </div>

      <div class="shell-panel" id="panelBaptism">
        <div id="baptismCardBox"><p style="color:var(--text-muted);">Loading…</p></div>
      </div>
```

- [ ] **Step 4: Register the new panel**

Find:

```js
const PANELS = ['baptism', 'events', 'groups', 'growthtrack', 'impactteams', 'account'];
const PANEL_TITLES = { baptism: 'Baptism', events: 'Events', groups: 'Small Groups', growthtrack: 'Growth Track', impactteams: 'Impact Teams', account: 'My Info' };
```

Replace with:

```js
const PANELS = ['journey', 'baptism', 'events', 'groups', 'growthtrack', 'impactteams', 'account'];
const PANEL_TITLES = { journey: 'My Journey', baptism: 'Baptism', events: 'Events', groups: 'Small Groups', growthtrack: 'Growth Track', impactteams: 'Impact Teams', account: 'My Info' };
```

- [ ] **Step 5: Add `renderJourneyPanel()` and call it after the existing panel-render calls**

Find:

```js
  renderBaptismPanel();
  renderEventsPanel();
  renderGroupsPanel();
  renderGrowthTrackPanel();
  renderImpactTeamsPanel();
})();

function renderBaptismPanel() {
```

Replace with:

```js
  renderJourneyPanel();
  renderBaptismPanel();
  renderEventsPanel();
  renderGroupsPanel();
  renderGrowthTrackPanel();
  renderImpactTeamsPanel();
})();

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
    onFoundClick: () => switchPanel('baptism'),
    onFilledClick: () => switchPanel('groups'),
    onFreedClick: () => switchPanel('growthtrack'),
    onForgedClick: () => switchPanel('impactteams'),
  });
}

function renderBaptismPanel() {
```

- [ ] **Step 6: Verify**

```bash
grep -n "id=\"navJourney\"\|id=\"panelJourney\"\|id=\"journeyPipelineBox\"\|function renderJourneyPanel" admin/my-profile.html
```

Expected: one match each (4 total).

```bash
grep -n "class=\"active nav-sub\"\|class=\"shell-panel active\"" admin/my-profile.html
```

Expected: exactly one match each, both on the new Journey nav item/panel — confirming Baptism's nav item and panel no longer carry the `active` class (only one thing can be pre-active at a time).

- [ ] **Step 7: Commit**

```bash
git add admin/my-profile.html
git commit -m "Add My Journey nav item and panel as the new default landing view

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: End-to-end verification on staging

**Files:** none (verification only)

- [ ] **Step 1: Push to staging**

```bash
git push staging main
```

- [ ] **Step 2: Confirm the deployed page has the changes**

```bash
curl -s https://sspratlen.github.io/HeritageHill-staging/admin/my-profile.html | grep -o "navJourney\|panelJourney\|journeyPipelineBox" | sort -u
curl -s https://sspratlen.github.io/HeritageHill-staging/js/member-dashboard.js | grep -o "onFoundClick\|stageClickHandlers" | sort -u
```

Expected: all strings present in both.

- [ ] **Step 3: Ask Scott to click through and confirm on staging**

1. Log in as a plain (non-staff) member and confirm clicking the profile picture (from any public page) lands directly on the new "My Journey" panel.
2. Confirm the 4-column Found/Filled/Freed/Forged grid shows real data: baptism status, membership status, small groups, Growth Track history, DISC result, Spiritual Gifts result (shown individually, not merged), Impact Teams.
3. Click each of the four stage headers — confirm Found→Baptism, Filled→Small Groups, Freed→Growth Track, Forged→Impact Teams each correctly switch to that panel.
4. Confirm the Baptism nav item/panel still works normally when clicked directly (it's just no longer the default).
5. As an admin, open `admin/member-dashboard.html` for any member and confirm that page's journey pipeline is visually and functionally unchanged (stage headers still non-clickable there).

- [ ] **Step 4: Stop here — do not touch production**

Per `CLAUDE.md`'s standing deployment rule, do not push to `origin` (production) until Scott explicitly approves promoting this specific change, after confirming Step 3 on staging.

---

## Self-Review Notes

- **Spec coverage:** Shared-component extension (Task 1), nav/panel wiring (Task 2), rollout checklist (Task 3) — every part of the design doc maps to a task.
- **Placeholder scan:** No TBD/TODO; every step has literal code or an exact command.
- **Type/name consistency:** `onFoundClick`/`onFilledClick`/`onFreedClick`/`onForgedClick` are spelled identically in the component (Task 1) and the caller (Task 2, Step 5). `journeyPipelineBox`/`panelJourney`/`navJourney`/`'journey'` are used consistently across the HTML, `PANELS`/`PANEL_TITLES`, and the new render function.
