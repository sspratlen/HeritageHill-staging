// Heritage Hill — "My Journey" treasure map (admin/dashboard.html's My
// Journey tab). A trail of milestone stops drawn as inline SVG: a winding
// left-to-right trail on wide containers, a vertical scroll on narrow ones.
// Every stop is clickable whether or not it's done -- steps can be taken
// in any order, so there's deliberately no "you are here" marker.
//
// Pure pieces (STOPS, computeStatus, buildSvg) have no DOM dependency and
// are unit-tested under Node (tests/journey-map.test.js).
const JourneyMap = {
  // Trail order. `tab` is the admin/dashboard.html tab the stop opens.
  // `profilePanel` is currently unused (retained for future per-panel
  // deep-linking); when the viewer's role can't reach `tab` yet, the
  // dashboard falls back to opening the 'myinfo' tab.
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

  // Mostly the same "done" rules as MemberDashboard.renderJourneyPipeline:
  // active = no leftAt, Growth Track counts only when attended, leading a
  // group counts as service (Serving). One deliberate difference, per Scott:
  // leading a small group also marks the Small group stop done here, while
  // the pipeline's Filled card only lists groups the person attends.
  // Null/undefined data (journey load failed) -> every stop not done.
  computeStatus(d) {
    d = d || {};
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

  BREAKPOINT: 640, // container px; at or below this, draw the vertical scroll

  // Desktop trail (viewBox 680x360): [x, y, label position] per stop. The
  // title band is y 12-64; below it the map is split into one column per
  // stage (DESKTOP_SECTIONS, x ranges), divided by dashed vertical lines,
  // with each stage's header in its column's upper-left corner. Stops stay
  // below y~130 so they clear the headers, and every label stays inside
  // its own column.
  DESKTOP_PTS: {
    basecamp: [40, 300, 'below'],   baptism: [95, 250, 'below'],   membership: [155, 170, 'above'],
    smallgroup: [245, 215, 'below'],
    // Freed zigzags peak/valley with labels on the outside (above peaks,
    // below valleys) so none of them sit on the trail.
    plant: [330, 170, 'above'],     discover: [375, 270, 'below'], grow: [425, 170, 'above'],
    disc: [470, 270, 'below'],      gifts: [515, 170, 'above'],
    impactteam: [600, 270, 'below'], serving: [645, 170, 'above'],
  },
  DESKTOP_SECTIONS: [['Found', 12, 190], ['Filled', 190, 300], ['Freed', 300, 565], ['Forged', 565, 668]],

  // Matches the sidebar's own stage header (admin/dashboard.html's
  // .nav-stage-circle/.nav-stage-name/.nav-section-verse): a numbered
  // circle, a bold name, and a small italic verse caption underneath.
  STAGE_INFO: {
    Found:  { num: '01', verse: 'by God' },
    Filled: { num: '02', verse: 'by the Spirit' },
    Freed:  { num: '03', verse: 'to live like Jesus' },
    Forged: { num: '04', verse: 'for mission' },
  },

  // Site palette -- mirrors admin/dashboard.html's :root custom properties
  // (--bg-card, --text, --text-muted, --border, --primary-dark, --primary,
  // --bg). Kept as literal hex rather than var(--x) since this module has
  // no dependency on which page embeds it (e.g. the standalone preview
  // page, which doesn't load the dashboard's stylesheet).
  C: { paper: '#FFFFFF', ink: '#1C1C1E', faded: '#6B6B6B', rule: '#E4E4E4', divider: '#A8A8A8', frame: '#9A6118', seal: '#BC7A1E', tan: '#F4F4F2' },

  _esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  // Returns { w, h, pts, sections, curve }. `sections` is one box per stage,
  // in stage order ({ stage, x0, x1, y0, y1 }); Base camp belongs to Found.
  _layout(name) {
    if (name === 'desktop') {
      const sections = this.DESKTOP_SECTIONS.map(([stage, x0, x1]) => ({ stage, x0, x1, y0: 64, y1: 348 }));
      return { w: 680, h: 360, pts: this.DESKTOP_PTS, sections, curve: 'h' };
    }
    // Mobile: stages stack as horizontal bands down the scroll. Each band
    // has a header row, then its stops 48px apart, alternating left/right
    // columns (continuing the zigzag across bands) with labels on the
    // inside of each column.
    const HEAD = 56, STEP = 48, TAIL = 28, pts = {}, sections = [];
    let top = 70;
    ['Found', 'Filled', 'Freed', 'Forged'].forEach(stage => {
      const stops = this.STOPS.filter(s => (s.stage || 'Found') === stage);
      stops.forEach((s, j) => {
        const left = this.STOPS.indexOf(s) % 2 === 0;
        pts[s.key] = [left ? 80 : 220, top + HEAD + j * STEP, left ? 'right' : 'left'];
      });
      const bottom = top + HEAD + (stops.length - 1) * STEP + TAIL;
      sections.push({ stage, x0: 4, x1: 296, y0: top, y1: bottom });
      top = bottom;
    });
    return { w: 300, h: top + 26, pts, sections, curve: 'v' };
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

  // Matches the sidebar's stage header: a numbered circle, a bold name,
  // and a small italic verse caption underneath. `align` is 'left' (circle
  // then text growing rightward, desktop) or 'right' (text ending at x,
  // circle to its right -- used for mobile's right-hand column so the
  // label doesn't run off the edge).
  _stageHeader(stage, x, y, align, big) {
    const C = this.C, info = this.STAGE_INFO[stage];
    const r = big ? 11 : 8, numSize = big ? 9 : 7.5, nameSize = big ? 14 : 10.5, verseSize = big ? 10 : 8;
    const gap = r + (big ? 8 : 6);
    const circleX = align === 'right' ? x + gap : x;
    const textX = align === 'right' ? x : x + gap;
    const anchor = align === 'right' ? ' text-anchor="end"' : '';
    return `<g class="jm-stage-header">`
      + `<circle cx="${circleX}" cy="${y}" r="${r}" fill="rgba(188,122,30,.12)" stroke="${C.seal}" stroke-width="1.5"/>`
      + `<text x="${circleX}" y="${y + numSize * 0.35}" text-anchor="middle" font-size="${numSize}" font-weight="700" fill="${C.seal}">${info.num}</text>`
      + `<text x="${textX}" y="${y - 2}"${anchor} font-size="${nameSize}" font-weight="700" fill="${C.ink}">${stage}</text>`
      + `<text x="${textX}" y="${y - 2 + verseSize + 3}"${anchor} font-size="${verseSize}" font-style="italic" fill="${C.faded}">${info.verse}</text>`
      + `</g>`;
  },

  _compass(x, y) {
    const C = this.C;
    return `<g transform="translate(${x},${y})" aria-hidden="true"><circle r="18" fill="none" stroke="${C.frame}"/>`
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
      out.push(this._compass(266, 46));
      out.push(`<text x="${L.w / 2}" y="50" text-anchor="middle" font-size="17" font-weight="700" fill="${C.ink}" aria-hidden="true">${title}</text>`);
    } else {
      out.push(`<rect x="4" y="4" width="672" height="352" rx="6" fill="${C.paper}" stroke="${C.frame}" stroke-width="2"/>`);
      out.push(`<rect x="12" y="12" width="656" height="336" rx="4" fill="none" stroke="${C.rule}" stroke-width="0.75"/>`);
      out.push(this._compass(636, 40));
      out.push(`<text x="340" y="44" text-anchor="middle" font-size="20" font-weight="700" fill="${C.ink}" aria-hidden="true">${title}</text>`);
    }

    // Trail: each segment is red once the stop it leads INTO is done.
    for (let i = 1; i < this.STOPS.length; i++) {
      const a = L.pts[this.STOPS[i - 1].key], b = L.pts[this.STOPS[i].key];
      const done = status[this.STOPS[i].key];
      out.push(done
        ? `<path class="jm-trail jm-trail-done" d="${this._seg(a, b, L.curve)}" fill="none" stroke="${C.seal}" stroke-width="2.5" stroke-dasharray="7 6"/>`
        : `<path class="jm-trail" d="${this._seg(a, b, L.curve)}" fill="none" stroke="${C.faded}" stroke-width="2" stroke-dasharray="3 7"/>`);
    }

    // Stage sections: a dashed gray divider before every stage but the
    // first (vertical on desktop, horizontal on mobile), and each stage's
    // sidebar-style header in its section's upper-left corner.
    L.sections.forEach((sec, i) => {
      if (i > 0) {
        const [x1, y1, x2, y2] = mobile ? [sec.x0 + 4, sec.y0, sec.x1 - 4, sec.y0] : [sec.x0, sec.y0, sec.x0, sec.y1];
        out.push(`<line class="jm-divider" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.divider}" stroke-width="1.5" stroke-dasharray="6 5"/>`);
      }
      out.push(mobile
        ? this._stageHeader(sec.stage, sec.x0 + 18, sec.y0 + 22, 'left', false)
        : this._stageHeader(sec.stage, sec.x0 + 22, sec.y0 + 26, 'left', true));
    });

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
};

if (typeof module !== 'undefined') module.exports = JourneyMap;
