# My Journey Treasure Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the My Journey tab's 4-column pipeline grid in `admin/dashboard.html` with a clickable treasure map. It's a winding trail on desktop and a vertical scroll on mobile. My Info moves to its own tab, which the map's "Base camp" opens.

**Architecture:** A new standalone renderer, `js/journey-map.js` (global `JourneyMap`), holds the milestone table and a pure `computeStatus(data)`. It also has a pure `buildSvg(status, layout, firstName)` that returns an SVG string, and a thin `render()` that injects the SVG, wires clicks and keys, and re-renders when the layout crosses the 640px container breakpoint. `admin/dashboard.html` only swaps its panel markup and `renderJourneyPanel()`, and adds a `myinfo` tab. The pure functions are tested under Node's built-in test runner; the file ends with a `module.exports` guard.

**Tech Stack:** Vanilla JS (no build step), inline SVG, and plain CSS. Tests use Node 24's `node:test` and `node:assert/strict`, with no dependencies.

**Spec:** `docs/superpowers/specs/2026-09-27-journey-treasure-map-design.md`

**Coordination (read first):** The "Heritage Hill Web Work" Claude session is making phased edits to `admin/dashboard.html` (`ROLE_TABS`, `ALL_TABS`, tab renderers), and it commits in the **same working directory** (`/Users/scottspratlen/Documents/Claude/Projects/HHCWebsite`, branch `main`). So:
- Do all work in a separate git worktree on branch `journey-treasure-map` (Task 0). Never edit files in the main checkout.
- Before merging into `main` (Task 7), message that session with `SendMessage` to `Heritage Hill Web Work`.
- Textual conflicts in `ROLE_TABS`/`ALL_TABS` are expected. Resolve them by keeping both sides' entries.

---

## File structure

| File | Responsibility |
|---|---|
| `js/journey-map.js` (create) | Milestone table, status computation, SVG building, DOM render and resize handling. No Supabase or dashboard knowledge. |
| `css/journey-map.css` (create) | Map container sizing, stop hover/focus states, SVG font. |
| `tests/journey-map.test.js` (create) | Node unit tests for `computeStatus` and `buildSvg`. |
| `tests/journey-map-preview.html` (create) | Standalone dev page that renders the map with stub data, for visual checks in a browser. |
| `admin/dashboard.html` (modify) | Link the CSS/JS, add the `myinfo` tab (sidebar link, panel, role lists, title), swap `panelJourney` content, and rewrite `renderJourneyPanel()`. |
| `admin/my-profile.html` (modify) | Open the panel named in `location.hash` on load (the fallback target for dots). |

---

### Task 0: Worktree

- [ ] **Step 1: Create the worktree from current `main`**

```bash
cd /Users/scottspratlen/Documents/Claude/Projects/HHCWebsite
git worktree add .worktrees/journey-treasure-map -b journey-treasure-map main
cd .worktrees/journey-treasure-map
git log --oneline -1
```
Expected: the worktree is created, and the last commit is the current `main` tip. `.worktrees/` is already in `.gitignore`.

Every path in later tasks is relative to this worktree root.

---

### Task 1: Milestone table and `computeStatus`

**Files:**
- Create: `js/journey-map.js`
- Test: `tests/journey-map.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/journey-map.test.js`:

```js
// Run with: node --test (from the repo root)
const test = require('node:test');
const assert = require('node:assert/strict');
const JourneyMap = require('../js/journey-map.js');

const KEYS = ['basecamp', 'baptism', 'membership', 'smallgroup', 'plant', 'discover', 'grow', 'disc', 'gifts', 'impactteam', 'serving'];

test('STOPS are in trail order with a tab for each', () => {
  assert.deepEqual(JourneyMap.STOPS.map(s => s.key), KEYS);
  JourneyMap.STOPS.forEach(s => assert.ok(s.tab, s.key + ' has a tab'));
  assert.equal(JourneyMap.STOPS[0].tab, 'myinfo');
});

test('computeStatus: empty data -> nothing done', () => {
  const st = JourneyMap.computeStatus({});
  KEYS.forEach(k => assert.equal(st[k], false, k));
});

test('computeStatus: everything done', () => {
  const st = JourneyMap.computeStatus({
    baptizedAt: '2025-05-01', memberSince: '2025-06-01',
    email: 'a@b.com',
    groups: [{ id: 1, name: 'Tue', leaderEmail: 'x@y.com' }],
    groupMemberships: [{ groupId: 1, leftAt: null }],
    gtRegistrations: [
      { part: 'about_us', attended: true }, { part: 'about_you', attended: true }, { part: 'get_involved', attended: true },
    ],
    discAttemptCount: 1, giftsAttemptCount: 2,
    teamMemberships: [{ teamId: 9, role: 'member', trained: true, leftAt: null }],
  });
  KEYS.filter(k => k !== 'basecamp').forEach(k => assert.equal(st[k], true, k));
  assert.equal(st.basecamp, false);
});

test('computeStatus: left groups/teams and registered-only Growth Track do not count', () => {
  const st = JourneyMap.computeStatus({
    groupMemberships: [{ groupId: 1, leftAt: '2025-01-01' }],
    teamMemberships: [{ teamId: 9, role: 'leader', trained: true, leftAt: '2025-01-01' }],
    gtRegistrations: [{ part: 'about_us', attended: false }],
  });
  assert.equal(st.smallgroup, false);
  assert.equal(st.impactteam, false);
  assert.equal(st.serving, false);
  assert.equal(st.plant, false);
});

test('computeStatus: leading a small group counts as small group and serving', () => {
  const st = JourneyMap.computeStatus({
    email: 'Lead@Church.org',
    groups: [{ id: 1, name: 'Tue', leaderEmail: 'lead@church.org' }],
  });
  assert.equal(st.smallgroup, true);
  assert.equal(st.serving, true);
  assert.equal(st.impactteam, false);
});

test('computeStatus: untrained team member is on a team but not serving; team leader is serving', () => {
  const member = JourneyMap.computeStatus({ teamMemberships: [{ teamId: 1, role: 'member', trained: false }] });
  assert.equal(member.impactteam, true);
  assert.equal(member.serving, false);
  const leader = JourneyMap.computeStatus({ teamMemberships: [{ teamId: 1, role: 'leader', trained: false }] });
  assert.equal(leader.serving, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test`
Expected: FAIL with `Cannot find module '../js/journey-map.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `js/journey-map.js`:

```js
// Heritage Hill — "My Journey" treasure map (admin/dashboard.html's My
// Journey tab). A trail of milestone stops drawn as inline SVG: a winding
// left-to-right trail on wide containers, a vertical scroll on narrow ones.
// Every stop is clickable whether or not it's done -- steps can be taken
// in any order, so there's deliberately no "you are here" marker.
//
// Pure pieces (STOPS, computeStatus, buildSvg) have no DOM dependency and
// are unit-tested under Node (tests/journey-map.test.js).
const JourneyMap = {
  // Trail order. `tab` is the admin/dashboard.html tab the stop opens;
  // `profilePanel` is the admin/my-profile.html panel used as a fallback
  // when the viewer's role can't reach `tab` yet (null = open 'myinfo').
  STOPS: [
    { key: 'basecamp',   label: 'Base camp',       stage: null,     tab: 'myinfo',      profilePanel: null },
    { key: 'baptism',    label: 'Baptism',         stage: 'Found',  tab: 'baptism',     profilePanel: 'baptism' },
    { key: 'membership', label: 'Membership',      stage: 'Found',  tab: 'people',      profilePanel: null },
    { key: 'smallgroup', label: 'Small group',     stage: 'Filled', tab: 'groups',      profilePanel: 'groups' },
    { key: 'plant',      label: 'Plant',           stage: 'Freed',  tab: 'growthtrack', profilePanel: 'growthtrack' },
    { key: 'discover',   label: 'Discover',        stage: 'Freed',  tab: 'growthtrack', profilePanel: 'growthtrack' },
    { key: 'grow',       label: 'Grow',            stage: 'Freed',  tab: 'growthtrack', profilePanel: 'growthtrack' },
    { key: 'disc',       label: 'DISC',            stage: 'Freed',  tab: 'growthtrack', profilePanel: 'growthtrack' },
    { key: 'gifts',      label: 'Spiritual gifts', stage: 'Freed',  tab: 'growthtrack', profilePanel: 'growthtrack' },
    { key: 'impactteam', label: 'Impact team',     stage: 'Forged', tab: 'impactteams', profilePanel: 'impactteams' },
    { key: 'serving',    label: 'Serving',         stage: 'Forged', tab: 'impactteams', profilePanel: 'impactteams' },
  ],

  // Same "done" rules MemberDashboard.renderJourneyPipeline uses, so the map
  // and the admin per-member view never disagree: active = no leftAt,
  // Growth Track counts only when attended, leading a group is service.
  computeStatus(d) {
    const active = arr => (arr || []).filter(m => !m.leftAt);
    const email = (d.email || '').toLowerCase();
    const leadsGroup = !!email && (d.groups || []).some(g => g.leaderEmail && g.leaderEmail.toLowerCase() === email);
    const attended = part => (d.gtRegistrations || []).some(r => r.part === part && r.attended);
    const teams = active(d.teamMemberships);
    return {
      basecamp: false,
      baptism: !!d.baptizedAt,
      membership: !!d.memberSince,
      smallgroup: active(d.groupMemberships).length > 0 || leadsGroup,
      plant: attended('about_us'),
      discover: attended('about_you'),
      grow: attended('get_involved'),
      disc: (d.discAttemptCount || 0) > 0,
      gifts: (d.giftsAttemptCount || 0) > 0,
      impactteam: teams.length > 0,
      serving: teams.some(m => m.trained || m.role === 'leader') || leadsGroup,
    };
  },
};

if (typeof module !== 'undefined') module.exports = JourneyMap;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: 6 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add js/journey-map.js tests/journey-map.test.js
git commit -m "Add JourneyMap milestone table and status computation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `buildSvg` for the desktop and mobile layouts

**Files:**
- Modify: `js/journey-map.js` (add members to the `JourneyMap` object, after `computeStatus`)
- Test: `tests/journey-map.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/journey-map.test.js`:

```js
const count = (s, needle) => s.split(needle).length - 1;

test('buildSvg desktop: 11 clickable stops, seals only on done stops', () => {
  const st = JourneyMap.computeStatus({ baptizedAt: '2025-05-01', discAttemptCount: 1 });
  const svg = JourneyMap.buildSvg(st, 'desktop', 'Scott');
  assert.match(svg, /^<div class="jm-map jm-desktop">/);
  assert.match(svg, /viewBox="0 0 680 320"/);
  assert.equal(count(svg, 'class="jm-stop'), 11);
  assert.equal(count(svg, 'class="jm-stop jm-done"'), 2);
  assert.match(svg, /data-key="baptism"/);
  assert.match(svg, /Scott's journey/);
  ['Found', 'Filled', 'Freed', 'Forged'].forEach(n => assert.match(svg, new RegExp('>' + n + '<')));
});

test('buildSvg mobile: vertical viewBox and stage ribbons', () => {
  const svg = JourneyMap.buildSvg(JourneyMap.computeStatus({}), 'mobile', 'Scott');
  assert.match(svg, /^<div class="jm-map jm-mobile">/);
  assert.match(svg, /viewBox="0 0 300 630"/);
  assert.equal(count(svg, 'class="jm-stop'), 11);
  assert.equal(count(svg, 'class="jm-ribbon"'), 4);
});

test('buildSvg: done segments are red, others faded', () => {
  const st = JourneyMap.computeStatus({ baptizedAt: '2025-05-01' });
  const svg = JourneyMap.buildSvg(st, 'desktop', 'Scott');
  assert.equal(count(svg, 'class="jm-trail jm-trail-done"'), 1);
  assert.equal(count(svg, 'class="jm-trail"'), 9);
});

test('buildSvg: escapes the name and falls back to "Your journey"', () => {
  assert.match(JourneyMap.buildSvg(JourneyMap.computeStatus({}), 'desktop', '<b>'), /&lt;b&gt;'s journey/);
  assert.match(JourneyMap.buildSvg(JourneyMap.computeStatus({}), 'desktop', ''), />Your journey</);
});

test('buildSvg: each stop has an accessible label with its status', () => {
  const svg = JourneyMap.buildSvg(JourneyMap.computeStatus({ baptizedAt: '2025-05-01' }), 'desktop', 'S');
  assert.match(svg, /aria-label="Baptism: done"/);
  assert.match(svg, /aria-label="Membership: not yet"/);
  assert.match(svg, /aria-label="Base camp: my info"/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test`
Expected: the 5 new tests FAIL with `JourneyMap.buildSvg is not a function`. The 6 from Task 1 still pass.

- [ ] **Step 3: Write the implementation**

In `js/journey-map.js`, insert the following into the `JourneyMap` object directly after the closing `},` of `computeStatus` (before the object's final `};`):

```js
  BREAKPOINT: 640, // container px; at or below this, draw the vertical scroll

  // Desktop trail (viewBox 680x320): [x, y, label position] per stop.
  DESKTOP_PTS: {
    basecamp: [48, 262, 'below'],  baptism: [112, 246, 'below'], membership: [168, 206, 'right'],
    smallgroup: [222, 158, 'above'], plant: [285, 196, 'below'],  discover: [345, 214, 'below'],
    grow: [398, 160, 'right'],      disc: [446, 108, 'above'],    gifts: [512, 94, 'above'],
    impactteam: [568, 162, 'below'], serving: [632, 108, 'below'],
  },
  DESKTOP_STAGES: [['Found', 96, 302], ['Filled', 170, 116], ['Freed', 372, 294], ['Forged', 596, 240]],

  // Parchment palette -- fixed, it's part of the map art (not themed).
  C: { paper: '#F2E3C0', ink: '#5C3D1E', faded: '#9C7A4E', rule: '#B89A66', frame: '#8B6B3E', seal: '#A32D2D', tan: '#C9AE7C', ribbon: '#E6D2A8' },

  _esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  _layout(name) {
    if (name === 'desktop') return { w: 680, h: 320, pts: this.DESKTOP_PTS, curve: 'h' };
    // Mobile: stops alternate left/right columns down the scroll, labels
    // on the inside of each column.
    const pts = {};
    this.STOPS.forEach((s, i) => {
      const left = i % 2 === 0;
      pts[s.key] = [left ? 80 : 220, 90 + i * 48, left ? 'right' : 'left'];
    });
    return { w: 300, h: 90 + (this.STOPS.length - 1) * 48 + 60, pts, curve: 'v' };
  },

  // S-curve between two stops: horizontal easing on desktop, vertical on mobile.
  _seg([x0, y0], [x1, y1], curve) {
    if (curve === 'h') { const mx = (x0 + x1) / 2; return `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`; }
    const my = (y0 + y1) / 2;
    return `M${x0},${y0} C${x0},${my} ${x1},${my} ${x1},${y1}`;
  },

  _label(x, y, pos, text) {
    const t = this._esc(text);
    if (pos === 'below') return `<text x="${x}" y="${y + 26}" text-anchor="middle">${t}</text>`;
    if (pos === 'above') return `<text x="${x}" y="${y - 16}" text-anchor="middle">${t}</text>`;
    if (pos === 'right') return `<text x="${x + 16}" y="${y + 4}">${t}</text>`;
    return `<text x="${x - 16}" y="${y + 4}" text-anchor="end">${t}</text>`;
  },

  _marker(stop, x, y, done) {
    const C = this.C;
    if (stop.key === 'basecamp') {
      return `<path d="M${x - 12},${y + 9} L${x},${y - 12} L${x + 12},${y + 9} Z" fill="${C.tan}" stroke="${C.ink}" stroke-width="1.5"/>`
        + `<path d="M${x},${y - 12} L${x},${y + 9}" stroke="${C.ink}" stroke-width="1"/>`;
    }
    if (stop.key === 'serving') {
      const col = done ? C.seal : C.faded;
      return `<path d="M${x - 10},${y - 10} l20,20 M${x + 10},${y - 10} l-20,20" stroke="${col}" stroke-width="4" stroke-linecap="round"/>`;
    }
    return done
      ? `<circle cx="${x}" cy="${y}" r="9" fill="${C.seal}"/>`
      : `<circle cx="${x}" cy="${y}" r="8" fill="${C.paper}" stroke="${C.ink}" stroke-dasharray="3 2"/>`;
  },

  _compass(x, y) {
    const C = this.C;
    return `<g transform="translate(${x},${y})"><circle r="18" fill="none" stroke="${C.frame}"/>`
      + `<polygon points="0,-16 4,0 0,16 -4,0" fill="${C.ink}"/><polygon points="-16,0 0,-4 16,0 0,4" fill="${C.faded}"/>`
      + `<text y="-22" text-anchor="middle" font-size="11" fill="${C.ink}">N</text></g>`;
  },

  // Returns the full map markup (wrapper div + SVG) as a string.
  buildSvg(status, layoutName, firstName) {
    const C = this.C, L = this._layout(layoutName), mobile = layoutName !== 'desktop';
    const title = firstName ? `${this._esc(firstName)}'s journey` : 'Your journey';
    const out = [];

    // Frame + decorations
    if (mobile) {
      out.push(`<rect x="4" y="14" width="${L.w - 8}" height="${L.h - 28}" fill="${C.paper}" stroke="${C.frame}" stroke-width="2"/>`);
      out.push(`<rect x="0" y="4" width="${L.w}" height="16" rx="8" fill="${C.tan}" stroke="${C.frame}"/>`);
      out.push(`<rect x="0" y="${L.h - 20}" width="${L.w}" height="16" rx="8" fill="${C.tan}" stroke="${C.frame}"/>`);
      out.push(this._compass(262, 56));
      out.push(`<text x="${L.w / 2}" y="54" text-anchor="middle" font-size="17" font-style="italic" fill="${C.ink}">${title}</text>`);
    } else {
      out.push(`<rect x="4" y="4" width="672" height="312" rx="6" fill="${C.paper}" stroke="${C.frame}" stroke-width="2"/>`);
      out.push(`<rect x="12" y="12" width="656" height="296" rx="4" fill="none" stroke="${C.rule}" stroke-width="0.75"/>`);
      out.push(`<g stroke="${C.rule}" fill="none" stroke-width="1"><path d="M470,262 l10,-12 l10,12 M488,262 l8,-9 l8,9"/>`
        + `<path d="M250,64 l12,-14 l12,14 M270,64 l9,-10 l9,10"/><path d="M40,150 q6,-4 12,0 t12,0 M52,162 q6,-4 12,0 t12,0"/>`
        + `<path d="M150,64 q6,-4 12,0 t12,0 t12,0"/></g>`);
      out.push(this._compass(58, 62));
      out.push(`<text x="340" y="42" text-anchor="middle" font-size="20" font-style="italic" fill="${C.ink}">${title}</text>`);
    }

    // Trail: each segment is red once the stop it leads INTO is done.
    for (let i = 1; i < this.STOPS.length; i++) {
      const a = L.pts[this.STOPS[i - 1].key], b = L.pts[this.STOPS[i].key];
      const done = status[this.STOPS[i].key];
      out.push(done
        ? `<path class="jm-trail jm-trail-done" d="${this._seg(a, b, L.curve)}" fill="none" stroke="${C.seal}" stroke-width="2.5" stroke-dasharray="7 6"/>`
        : `<path class="jm-trail" d="${this._seg(a, b, L.curve)}" fill="none" stroke="${C.faded}" stroke-width="2" stroke-dasharray="3 7"/>`);
    }

    // Stage names: script labels on desktop, ribbons at each stage's first stop on mobile.
    if (mobile) {
      let prev = null;
      this.STOPS.forEach(s => {
        if (s.stage && s.stage !== prev) {
          const [x, y] = L.pts[s.key], rx = x < L.w / 2 ? 8 : 238;
          out.push(`<g class="jm-ribbon"><rect x="${rx}" y="${y - 9}" width="54" height="18" fill="${C.ribbon}" stroke="${C.frame}" stroke-width="0.75"/>`
            + `<text x="${rx + 27}" y="${y + 4}" text-anchor="middle" font-size="11" font-style="italic" fill="${C.ink}">${s.stage}</text></g>`);
        }
        prev = s.stage;
      });
    } else {
      out.push(`<g font-size="15" font-style="italic" fill="${C.frame}">`
        + this.DESKTOP_STAGES.map(([n, x, y]) => `<text x="${x}" y="${y}">${n}</text>`).join('') + `</g>`);
    }

    // Stops: a transparent 18px hit circle under each marker keeps tap targets large.
    this.STOPS.forEach(s => {
      const [x, y, pos] = L.pts[s.key], done = !!status[s.key];
      const aria = s.key === 'basecamp' ? 'my info' : (done ? 'done' : 'not yet');
      out.push(`<g class="jm-stop${done ? ' jm-done' : ''}" data-key="${s.key}" role="button" tabindex="0" aria-label="${this._esc(s.label)}: ${aria}" font-size="11" fill="${C.ink}">`
        + `<circle cx="${x}" cy="${y}" r="18" fill="none" pointer-events="all"/>`
        + this._marker(s, x, y, done) + this._label(x, y, pos, s.label) + `</g>`);
    });

    return `<div class="jm-map jm-${mobile ? 'mobile' : 'desktop'}">`
      + `<svg viewBox="0 0 ${L.w} ${L.h}" role="group" aria-label="${title}">${out.join('')}</svg></div>`;
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: 11 tests pass, 0 fail. If `'class="jm-trail"'` counts 9 in the done-segments test, the red segment is basecamp→baptism, which is correct: only baptism is done, and there are 10 segments in total.

- [ ] **Step 5: Commit**

```bash
git add js/journey-map.js tests/journey-map.test.js
git commit -m "Build treasure-map SVG for desktop trail and mobile scroll layouts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `render()`, CSS, and a preview page

**Files:**
- Modify: `js/journey-map.js` (add `render` after `buildSvg`)
- Create: `css/journey-map.css`
- Create: `tests/journey-map-preview.html`

- [ ] **Step 1: Add `render` to `JourneyMap`**

Insert directly after `buildSvg`'s closing `},`:

```js
  // Draws the map into containerEl and wires each stop to
  // opts.onStopClick(stop). Re-renders on resize only when the container
  // crosses BREAKPOINT; calling render() again on the same container
  // replaces the previous resize listener instead of stacking another.
  render(containerEl, data, opts = {}) {
    const layoutFor = () => ((containerEl.clientWidth || window.innerWidth) > this.BREAKPOINT ? 'desktop' : 'mobile');
    const status = this.computeStatus(data);
    const draw = () => {
      containerEl._jmLayout = layoutFor();
      containerEl.innerHTML = this.buildSvg(status, containerEl._jmLayout, data.firstName);
      containerEl.querySelectorAll('.jm-stop').forEach(el => {
        const stop = this.STOPS.find(s => s.key === el.dataset.key);
        const go = () => { if (opts.onStopClick) opts.onStopClick(stop); };
        el.addEventListener('click', go);
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      });
    };
    draw();
    if (containerEl._jmResize) window.removeEventListener('resize', containerEl._jmResize);
    let timer;
    containerEl._jmResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (layoutFor() !== containerEl._jmLayout) draw(); }, 150);
    };
    window.addEventListener('resize', containerEl._jmResize);
  },
```

- [ ] **Step 2: Create `css/journey-map.css`**

```css
/* Heritage Hill — "My Journey" treasure map (js/journey-map.js).
   Map colors live in the SVG itself (fixed parchment art); this file only
   handles sizing, the serif face, and interactive states. */

.jm-map svg { display: block; width: 100%; height: auto; }
.jm-map.jm-mobile svg { max-width: 420px; margin: 0 auto; }
.jm-map text { font-family: Georgia, 'Times New Roman', serif; }

.jm-stop { cursor: pointer; outline: none; }
.jm-stop:hover circle:not([pointer-events]),
.jm-stop:hover path { filter: brightness(1.15); }
.jm-stop:hover text { text-decoration: underline; }
.jm-stop:focus-visible circle[pointer-events] { stroke: #BA7517; stroke-width: 2; stroke-dasharray: 3 3; }
```

- [ ] **Step 3: Create `tests/journey-map-preview.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Journey map preview</title>
  <link rel="stylesheet" href="../css/journey-map.css" />
  <style>
    body { font-family: sans-serif; margin: 0; padding: 16px; background: #fafaf8; }
    #box { max-width: 1000px; margin: 0 auto; }
    #log { max-width: 1000px; margin: 12px auto; font-size: 14px; color: #555; }
  </style>
</head>
<body>
  <!-- Dev-only: renders JourneyMap with stub data. Serve the repo root
       (python3 -m http.server 8765) and open /tests/journey-map-preview.html.
       Resize the window across ~672px to see the layout switch. -->
  <div id="box"></div>
  <div id="log">Click a stop…</div>
  <script src="../js/journey-map.js"></script>
  <script>
    JourneyMap.render(document.getElementById('box'), {
      firstName: 'Scott', baptizedAt: '2025-05-01', memberSince: '2025-06-01', email: 'scott@example.com',
      groups: [{ id: 1, name: 'Tuesday Night', leaderEmail: 'someone@example.com' }],
      groupMemberships: [{ groupId: 1, leftAt: null }],
      gtRegistrations: [{ part: 'about_us', attended: true }, { part: 'get_involved', attended: true }],
      discAttemptCount: 1, giftsAttemptCount: 0,
      teamMemberships: [], teams: [],
    }, { onStopClick: s => { document.getElementById('log').textContent = 'Clicked ' + s.key + ' → tab ' + s.tab; } });
  </script>
</body>
</html>
```

- [ ] **Step 4: Verify tests still pass**

Run: `node --test`
Expected: 11 pass, 0 fail.

- [ ] **Step 5: Visual check in the browser**

Add a launch config if one isn't already there. Create or extend `.claude/launch.json` in the worktree:
```json
{ "version": "0.0.1", "configurations": [ { "name": "journey-map-preview", "runtimeExecutable": "python3", "runtimeArgs": ["-m", "http.server", "8765"], "port": 8765 } ] }
```
Start it with `preview_start` (name `journey-map-preview`), then navigate to `http://localhost:8765/tests/journey-map-preview.html`. Check each of these:
- At desktop width: winding trail, red seals on Baptism, Membership, Small group, Plant, Grow, and DISC; hollow dots elsewhere; red trail segments only into those stops; a tent at the start and a faded X at the end; no overlapping labels.
- Click Baptism and confirm the log reads `Clicked baptism → tab baptism`. Tab to a stop, press Enter, and confirm it also fires.
- Use `resize_window` preset `mobile`, reload, and confirm the vertical scroll: four ribbons (Found, Filled, Freed, Forged) and labels that don't clip at the edges. Then reset with preset `desktop`.

If labels overlap, adjust only the `DESKTOP_PTS` coordinates and positions, and rerun the tests. The tests don't check coordinates.

- [ ] **Step 6: Commit**

```bash
git add js/journey-map.js css/journey-map.css tests/journey-map-preview.html
git commit -m "Add JourneyMap.render, map CSS, and a stub-data preview page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Don't commit `.claude/launch.json`. `.claude/` is untracked in this repo.)

---

### Task 4: `my-profile.html` opens the panel named in the URL hash

**Files:**
- Modify: `admin/my-profile.html` (the end of the async init IIFE, currently lines 270–276)

- [ ] **Step 1: Add the hash read after the panel renders**

Find:
```js
  renderJourneyPanel();
  renderBaptismPanel();
  renderEventsPanel();
  renderGroupsPanel();
  renderGrowthTrackPanel();
  renderImpactTeamsPanel();
})();
```
Replace with:
```js
  renderJourneyPanel();
  renderBaptismPanel();
  renderEventsPanel();
  renderGroupsPanel();
  renderGrowthTrackPanel();
  renderImpactTeamsPanel();

  // Deep link from dashboard.html's journey map (e.g. my-profile.html#groups)
  // for tabs the viewer's role can't reach on the dashboard yet.
  const hashPanel = location.hash.slice(1);
  if (PANELS.includes(hashPanel)) switchPanel(hashPanel);
})();
```

- [ ] **Step 2: Verify**

Run: `grep -n "hashPanel" admin/my-profile.html`
Expected: 2 matching lines inside the IIFE, before `})();`. `PANELS` (line ~214) is `['journey','baptism','events','groups','growthtrack','impactteams','account']`, which covers every `profilePanel` value in `JourneyMap.STOPS`.

- [ ] **Step 3: Commit**

```bash
git add admin/my-profile.html
git commit -m "Let my-profile.html open a panel from the URL hash

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wire the map and the My Info tab into `admin/dashboard.html`

**Files:**
- Modify: `admin/dashboard.html`. Line numbers are as of `main` at `a6efd9c` and may have shifted; match on the find text, not the numbers.

- [ ] **Step 1: Link the CSS (head, around line 14)**

Find:
```html
  <link rel="stylesheet" href="../css/journey-pipeline.css" />
```
Replace with:
```html
  <link rel="stylesheet" href="../css/journey-pipeline.css" />
  <link rel="stylesheet" href="../css/journey-map.css" />
```
(Keep `journey-pipeline.css`, because the Baptism tab's personal card still uses `jp-*` classes.)

- [ ] **Step 2: Load the JS (around line 2545)**

Find:
```html
<script src="../js/member-dashboard.js"></script>
```
Replace with:
```html
<script src="../js/member-dashboard.js"></script>
<script src="../js/journey-map.js"></script>
```

- [ ] **Step 3: Add the sidebar link under My Journey (around line 322)**

Find:
```html
    <a onclick="switchTab('journey')" id="sideJourney" data-tab="journey">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>
      My Journey
    </a>
```
Replace with:
```html
    <a onclick="switchTab('journey')" id="sideJourney" data-tab="journey">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>
      My Journey
    </a>
    <a onclick="switchTab('myinfo')" id="sideMyinfo" data-tab="myinfo">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 20l9-16 9 16z"/><path d="M12 4v16"/></svg>
      My Info
    </a>
```
(The tent icon matches Base camp on the map.)

- [ ] **Step 4: Split `panelJourney` into the map and a new `panelMyinfo`**

Find the opening of the journey panel:
```html
    <div class="tab-panel" id="panelJourney">
      <div id="journeyPipelineBox"></div>

      <div class="portal-card" id="profileCard">
```
Replace with:
```html
    <div class="tab-panel" id="panelJourney">
      <div id="journeyMapBox"></div>
    </div>

    <div class="tab-panel" id="panelMyinfo">
      <div class="portal-card" id="profileCard">
```
Leave the rest of the three cards and the panel's closing `</div>` (just before `<!-- PEOPLE (admin) -->`) exactly as they are. That closing tag now closes `panelMyinfo`.

Verify: `grep -n 'id="panelJourney"\|id="panelMyinfo"\|journeyPipelineBox\|journeyMapBox' admin/dashboard.html`
Expected: `panelJourney`, `journeyMapBox`, and `panelMyinfo` each appear once in the markup. `journeyPipelineBox` still appears once, in `renderJourneyPanel()`, and Step 7 removes it.

- [ ] **Step 5: Add `myinfo` to every `ROLE_TABS` tier and to `ALL_TABS`**

In `const ROLE_TABS = {...}`, append `,'myinfo'` as the last element of each tier's array (`admin`, `event_manager`, `member`, and any tier the other session has added since). Example as of `a6efd9c`:
```js
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users','journey','myinfo'],
  event_manager:       ['events','sermons','email','journey','baptism','myinfo'],
  member:              ['journey','baptism','myinfo'],
};
```
Appending at the end matters. `startTab` falls back to `effectiveAllowed[0]`, so `myinfo` must never be first.

In `const ALL_TABS = [...]`, append `,'myinfo'` as the last element in the same way.

- [ ] **Step 6: Add the tab title**

In `switchTab`'s `const titles = {...}`, find `journey:'My Journey'}` and replace it with `journey:'My Journey',myinfo:'My Info'}`.

No render branch is needed. `loadMyJourneyData()` fills the form synchronously at page load, before its first `await`.

- [ ] **Step 7: Replace `renderJourneyPanel()`**

Find the whole function:
```js
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
    onFoundClick: () => switchTab('baptism'),
  });
}
```
(If the other session has since added more `onXClick` lines, they're superseded here. The map routes every stop itself.)

Replace with:
```js
// Treasure-map view of the viewer's own journey (js/journey-map.js). Each
// stop opens its dashboard tab when this role can reach it; otherwise it
// falls back to the matching my-profile.html panel, or to My Info when
// there's no personal panel (Membership). As tabs get added to
// ROLE_TABS.member, their stops switch over with no change needed here.
function renderJourneyPanel() {
  JourneyMap.render(document.getElementById('journeyMapBox'), {
    firstName: (_profile.name || '').trim().split(/\s+/)[0],
    memberSince: _profile.memberSince, baptizedAt: _journeyData.baptism ? _journeyData.baptism.achievedAt : null,
    groupMemberships: _journeyData.memberships, groups: _journeyData.groups, email: _profile.email,
    gtRegistrations: _journeyData.gtRegs,
    discAttemptCount: _journeyData.discAttempts.length, giftsAttemptCount: _journeyData.giftsAttempts.length,
    teamMemberships: _journeyData.teamMemberships, teams: _journeyData.teams,
  }, {
    onStopClick: stop => {
      if (getAllowedTabs().includes(stop.tab)) switchTab(stop.tab);
      else if (stop.profilePanel) location.href = 'my-profile.html#' + stop.profilePanel;
      else switchTab('myinfo');
    },
  });
}
```
`my-profile.html` sits in the same `admin/` directory, so the relative href keeps the staging `/HeritageHill-staging/` subpath (see the `location.origin` gotcha in CLAUDE.md).

- [ ] **Step 8: Verify there are no stray references**

Run:
```bash
grep -n "journeyPipelineBox\|onFoundClick" admin/dashboard.html
grep -c "'myinfo'" admin/dashboard.html
node --test
```
Expected: the first grep prints nothing. The count is at least 5 (3 role tiers, `ALL_TABS`, and the `switchTab` and fallback calls). All tests pass.

- [ ] **Step 9: Commit**

```bash
git add admin/dashboard.html
git commit -m "Replace My Journey pipeline with the treasure map; split out My Info tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Local smoke check of the dashboard markup

No admin credentials are available (CLAUDE.md), so a full logged-in run isn't possible locally. Check what can be checked:

- [ ] **Step 1: Serve the worktree and load the dashboard**

With the `journey-map-preview` server from Task 3, navigate to `http://localhost:8765/admin/dashboard.html`. It redirects or shows the auth gate, which is expected. Run `read_console_messages` with `onlyErrors: true`.
Expected: no `SyntaxError` or `ReferenceError` from `dashboard.html` or `journey-map.js`. Auth or network errors are fine.

- [ ] **Step 2: Confirm the new symbols are live in the page**

Run `javascript_tool`: `[typeof JourneyMap, !!document.getElementById('panelMyinfo'), !!document.getElementById('journeyMapBox'), ALL_TABS.includes('myinfo')]`
Expected: `["object", true, true, true]`.

---

### Task 7: Merge to `main`, push to staging, verify

- [ ] **Step 1: Give the other session a heads-up**

Use `SendMessage` to `Heritage Hill Web Work`: "Journey treasure map is about to merge to main. It replaces `renderJourneyPanel()` wholesale (no more `onXClick` options), moves the My Info cards into a new `panelMyinfo`, and appends `'myinfo'` to every `ROLE_TABS` tier and `ALL_TABS`. Any new `onXClick` wiring you had planned isn't needed: adding a tab to `ROLE_TABS.member` makes its map stops open it automatically." Wait for a reply, or for its `ListAgents` row to show idle, before merging.

- [ ] **Step 2: Merge `main` into the branch and resolve conflicts**

```bash
git fetch staging
git merge main
```
If `ROLE_TABS`/`ALL_TABS` conflict, keep every entry from both sides, with `'myinfo'` last in each array. If `renderJourneyPanel()` conflicts, take this branch's version. Then run `node --test` and repeat the Task 5 Step 8 greps.

- [ ] **Step 3: Fast-forward `main`**

From the main checkout (`/Users/scottspratlen/Documents/Claude/Projects/HHCWebsite`):
```bash
git merge --ff-only journey-treasure-map
git log --oneline -6
```

- [ ] **Step 4: Ask Scott before pushing to staging, then push**

After Scott confirms:
```bash
git push staging main
gh run list --repo sspratlen/HeritageHill-staging --limit 3
```
Poll `gh run list` until the Pages deploy completes. If it's stuck, see the CLAUDE.md gotcha (`gh run rerun <id>`).

- [ ] **Step 5: Verify what shipped**

```bash
curl -s https://sspratlen.github.io/HeritageHill-staging/js/journey-map.js | grep -c "buildSvg"
curl -s https://sspratlen.github.io/HeritageHill-staging/admin/dashboard.html | grep -c "journeyMapBox\|panelMyinfo\|journey-map.js"
```
Expected: at least 1, and at least 3.

- [ ] **Step 6: Hand off to Scott for click-through**

Ask Scott to test on staging as a plain member and as an admin, on desktop and on a phone:
1. The map shows real milestones correctly: seals on the right stops, and the trail red only into done stops.
2. Each stop opens the right place. As a member, Baptism opens the Baptism tab. Small group, Growth Track, and Impact team stops open `my-profile.html` on the matching panel. Membership and Base camp open My Info.
3. The My Info tab saves profile, photo, and password changes.
4. As an admin, stops open the admin tabs.
5. `admin/member-dashboard.html` (viewing someone else's journey) is unchanged.

Production is a separate step, only after Scott explicitly approves (CLAUDE.md deployment checklist).

- [ ] **Step 7: Clean up the worktree**

```bash
cd /Users/scottspratlen/Documents/Claude/Projects/HHCWebsite
git worktree remove .worktrees/journey-treasure-map
git branch -d journey-treasure-map
```
