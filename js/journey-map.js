// Heritage Hill — "My Journey" timeline (admin/dashboard.html's My Journey
// tab). A summary column (progress + a suggested next step) beside a
// vertical timeline of milestones grouped by stage; the two stack into one
// column in narrow containers (pure CSS, css/journey-map.css). Steps can be
// taken in any order, so every row is clickable -- the "next step" is only
// a suggestion: the first step in trail order that isn't done yet.
//
// Pure pieces (STOPS, computeStatus, computeDates, nextStep, fmtMonth,
// buildHtml) have no DOM dependency and are unit-tested under Node
// (tests/journey-map.test.js). Design: docs/superpowers/specs/2026-09-28-journey-timeline-design.md
const JourneyMap = {
  // Trail order. `tab` is the admin/dashboard.html tab the step opens.
  STOPS: [
    { key: 'baptism',    label: 'Baptism',         stage: 'Found',  tab: 'baptism',     blurb: 'Take your next step of faith and publicly declare that you follow Jesus.' },
    { key: 'membership', label: 'Membership',      stage: 'Found',  tab: 'people',      blurb: 'Make Heritage Hill your church home and join the family.' },
    { key: 'smallgroup', label: 'Small group',     stage: 'Filled', tab: 'groups',      blurb: 'Find people to do life with, grow together, and be known.' },
    { key: 'plant',      label: 'Plant',           stage: 'Freed',  tab: 'growthtrack', blurb: 'Learn who we are as a church and what we believe.' },
    { key: 'discover',   label: 'Discover',        stage: 'Freed',  tab: 'growthtrack', blurb: 'Explore how God has uniquely wired you.' },
    { key: 'grow',       label: 'Grow',            stage: 'Freed',  tab: 'growthtrack', blurb: 'Find where your gifts fit and start making a difference.' },
    { key: 'disc',       label: 'DISC',            stage: 'Freed',  tab: 'growthtrack', blurb: 'Take the DISC assessment to understand how you work with others.' },
    { key: 'gifts',      label: 'Spiritual gifts', stage: 'Freed',  tab: 'growthtrack', blurb: 'Discover the spiritual gifts God has given you.' },
    { key: 'impactteam', label: 'Impact team',     stage: 'Forged', tab: 'impactteams', blurb: 'Join a team and serve alongside others on Sundays and beyond.' },
    { key: 'serving',    label: 'Serving',         stage: 'Forged', tab: 'impactteams', blurb: 'Get trained and step into leading and serving others.' },
  ],

  // Matches the sidebar's own stage headers (numbered circle, name, verse).
  STAGE_INFO: {
    Found:  { num: '01', verse: 'by God' },
    Filled: { num: '02', verse: 'by the Spirit' },
    Freed:  { num: '03', verse: 'to live like Jesus' },
    Forged: { num: '04', verse: 'for mission' },
  },

  // Mostly the same "done" rules as MemberDashboard.renderJourneyPipeline:
  // active = no leftAt, Growth Track counts only when attended, leading a
  // group counts as service (Serving). One deliberate difference, per Scott:
  // leading a small group also marks the Small group step done here, while
  // the pipeline's Filled card only lists groups the person attends.
  // Null/undefined data (journey load failed) -> every step not done.
  computeStatus(d) {
    d = d || {};
    const teams = this._active(d.teamMemberships);
    return {
      baptism: !!d.baptizedAt,
      membership: !!d.memberSince,
      smallgroup: this._active(d.groupMemberships).length > 0 || this._leadsGroup(d),
      plant: this._attended(d, 'about_us').length > 0,
      discover: this._attended(d, 'about_you').length > 0,
      grow: this._attended(d, 'get_involved').length > 0,
      disc: (d.discAttemptCount || 0) > 0,
      gifts: (d.giftsAttemptCount || 0) > 0,
      impactteam: teams.length > 0,
      serving: teams.some(m => m.trained || m.role === 'leader') || this._leadsGroup(d),
    };
  },

  // When each done step happened (earliest matching date), or null when the
  // step isn't done or no date is known (e.g. leading a group has none).
  // discDates/giftsDates are the assessment attempts' completedAt values.
  computeDates(d) {
    d = d || {};
    const st = this.computeStatus(d);
    const first = arr => (arr || []).filter(Boolean).sort((a, b) => String(a).slice(0, 10).localeCompare(String(b).slice(0, 10)))[0] || null;
    const teams = this._active(d.teamMemberships);
    const raw = {
      baptism: d.baptizedAt || null,
      membership: d.memberSince || null,
      smallgroup: first(this._active(d.groupMemberships).map(m => m.joinedAt)),
      plant: first(this._attended(d, 'about_us').map(r => r.sessionDate)),
      discover: first(this._attended(d, 'about_you').map(r => r.sessionDate)),
      grow: first(this._attended(d, 'get_involved').map(r => r.sessionDate)),
      disc: first(d.discDates),
      gifts: first(d.giftsDates),
      impactteam: first(teams.map(m => m.joinedAt)),
      serving: first(teams.filter(m => m.trained).map(m => m.trainedAt))
        || first(teams.filter(m => m.role === 'leader').map(m => m.joinedAt)),
    };
    const out = {};
    this.STOPS.forEach(s => { out[s.key] = st[s.key] ? raw[s.key] : null; });
    return out;
  },

  // The suggested next step: first step in trail order not done, else null.
  nextStep(status) {
    return this.STOPS.find(s => !status[s.key]) || null;
  },

  // "Mar 2025". Only the first 10 chars are read and parsed as local
  // midnight, so a timestamptz isn't shifted a day by its UTC offset.
  fmtMonth(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return '';
    const dt = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    return isNaN(dt) ? '' : dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  },

  _active(arr) { return (arr || []).filter(m => !m.leftAt); },
  _attended(d, part) { return (d.gtRegistrations || []).filter(r => r.part === part && r.attended); },
  _leadsGroup(d) {
    const email = (d.email || '').toLowerCase();
    return !!email && (d.groups || []).some(g => g.leaderEmail && g.leaderEmail.toLowerCase() === email);
  },

  _esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  _check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  _arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>',

  // Returns the full markup: summary column + timeline, as a string.
  buildHtml(status, dates, firstName) {
    const esc = s => this._esc(s);
    const stages = Object.keys(this.STAGE_INFO);
    const next = this.nextStep(status);
    const doneCount = this.STOPS.filter(s => status[s.key]).length;
    const title = firstName ? `${firstName}'s journey` : 'Your journey';

    const bar = stages.map(stage => {
      const stops = this.STOPS.filter(s => s.stage === stage);
      return `<div class="jt-bar-group" style="flex-grow:${stops.length}">`
        + `<div class="jt-bar-segs">${stops.map(s => `<span class="jt-seg${status[s.key] ? ' jt-seg-done' : ''}"></span>`).join('')}</div>`
        + `<span class="jt-bar-label">${stage}</span></div>`;
    }).join('');

    let card;
    if (next) {
      const info = this.STAGE_INFO[next.stage];
      card = `<div class="jt-card">`
        + `<div class="jt-eyebrow jt-eyebrow-light">Suggested next step</div>`
        + `<div class="jt-card-title">${esc(next.label)}</div>`
        + `<div class="jt-card-stage">Stage ${info.num} · ${next.stage} ${info.verse}</div>`
        + `<p class="jt-card-blurb">${esc(next.blurb)}</p>`
        + `<button type="button" class="jt-go" data-key="${next.key}">Go to ${esc(next.label)} ${this._arrow}</button>`
        + `</div>`;
    } else {
      card = `<div class="jt-card">`
        + `<div class="jt-eyebrow jt-eyebrow-light">Every step taken</div>`
        + `<div class="jt-card-title">Well done</div>`
        + `<p class="jt-card-blurb">You've completed every step of the journey. Keep investing in others as you serve.</p>`
        + `<button type="button" class="jt-go" data-key="serving">Keep serving ${this._arrow}</button>`
        + `</div>`;
    }

    const timeline = stages.map(stage => {
      const info = this.STAGE_INFO[stage];
      const stops = this.STOPS.filter(s => s.stage === stage);
      const done = stops.filter(s => status[s.key]).length;
      const rows = stops.map(s => {
        const isDone = !!status[s.key], isNext = next && next.key === s.key;
        const when = this.fmtMonth(dates[s.key]);
        const cls = isDone ? 'jt-row jt-done' : isNext ? 'jt-row jt-next' : 'jt-row';
        const aria = isDone ? `${s.label}: done${when ? ' ' + when : ''}` : `${s.label}: not yet`;
        const meta = isDone ? (when || 'Done') : isNext ? '<span class="jt-tag">Next</span>' : 'Not yet';
        return `<button type="button" class="${cls}" data-key="${s.key}" aria-label="${esc(aria)}">`
          + `<span class="jt-rail" aria-hidden="true"><span class="jt-node">${isDone ? this._check : ''}</span></span>`
          + `<span class="jt-label">${esc(s.label)}</span>`
          + `<span class="jt-meta">${meta}</span>`
          + `</button>`;
      }).join('');
      return `<section class="jt-stage">`
        + `<div class="jt-stage-head"><span class="jt-stage-num">${info.num}</span>`
        + `<h3 class="jt-stage-name">${stage} <span class="jt-stage-verse">${info.verse}</span></h3>`
        + `<span class="jt-stage-count${done === stops.length ? ' jt-stage-complete' : ''}">${done} of ${stops.length}</span></div>`
        + rows + `</section>`;
    }).join('');

    return `<div class="jt-host"><div class="jt">`
      + `<aside class="jt-summary">`
      + `<div class="jt-eyebrow">My journey</div>`
      + `<h2 class="jt-title">${esc(title)}</h2>`
      + `<div class="jt-count">${doneCount} of ${this.STOPS.length} steps taken</div>`
      + `<div class="jt-bar">${bar}</div>`
      + card
      + `</aside>`
      + `<div class="jt-timeline">${timeline}</div>`
      + `</div></div>`;
  },

  // Draws the timeline into containerEl and wires every row and the
  // next-step button to opts.onStopClick(stop).
  render(containerEl, data, opts = {}) {
    containerEl.innerHTML = this.buildHtml(this.computeStatus(data), this.computeDates(data), (data || {}).firstName);
    containerEl.querySelectorAll('[data-key]').forEach(el => {
      const stop = this.STOPS.find(s => s.key === el.dataset.key);
      el.addEventListener('click', () => { if (opts.onStopClick) opts.onStopClick(stop); });
    });
  },
};

if (typeof module !== 'undefined') module.exports = JourneyMap;
