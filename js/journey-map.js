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
      out.push(this._compass(262, 56));
      out.push(`<text x="${L.w / 2}" y="54" text-anchor="middle" font-size="17" font-style="italic" fill="${C.ink}" aria-hidden="true">${title}</text>`);
    } else {
      out.push(`<rect x="4" y="4" width="672" height="312" rx="6" fill="${C.paper}" stroke="${C.frame}" stroke-width="2"/>`);
      out.push(`<rect x="12" y="12" width="656" height="296" rx="4" fill="none" stroke="${C.rule}" stroke-width="0.75"/>`);
      out.push(`<g stroke="${C.rule}" fill="none" stroke-width="1"><path d="M470,262 l10,-12 l10,12 M488,262 l8,-9 l8,9"/>`
        + `<path d="M250,64 l12,-14 l12,14 M270,64 l9,-10 l9,10"/><path d="M40,150 q6,-4 12,0 t12,0 M52,162 q6,-4 12,0 t12,0"/>`
        + `<path d="M150,64 q6,-4 12,0 t12,0 t12,0"/></g>`);
      out.push(this._compass(58, 62));
      out.push(`<text x="340" y="42" text-anchor="middle" font-size="20" font-style="italic" fill="${C.ink}" aria-hidden="true">${title}</text>`);
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
};

if (typeof module !== 'undefined') module.exports = JourneyMap;
