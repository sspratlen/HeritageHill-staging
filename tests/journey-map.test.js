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

test('computeStatus: null data (load failed) -> nothing done, no throw', () => {
  const st = JourneyMap.computeStatus(null);
  KEYS.forEach(k => assert.equal(st[k], false, k));
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

const count = (s, needle) => s.split(needle).length - 1;

test('buildSvg desktop: 11 clickable stops, seals only on done stops', () => {
  const st = JourneyMap.computeStatus({ baptizedAt: '2025-05-01', discAttemptCount: 1 });
  const svg = JourneyMap.buildSvg(st, 'desktop', 'Scott');
  assert.match(svg, /^<div class="jm-map jm-desktop">/);
  assert.match(svg, /viewBox="0 0 680 360"/);
  assert.equal(count(svg, 'class="jm-stop'), 11);
  assert.equal(count(svg, 'class="jm-stop jm-done"'), 2);
  assert.equal(count(svg, `r="9" fill="${JourneyMap.C.seal}"`), 2); // the drawn seals
  assert.match(svg, /data-key="baptism"/);
  assert.match(svg, /Scott's journey/);
  ['Found', 'Filled', 'Freed', 'Forged'].forEach(n => assert.match(svg, new RegExp('>' + n + '<')));
});

test('buildSvg mobile: vertical viewBox and stage headers', () => {
  const svg = JourneyMap.buildSvg(JourneyMap.computeStatus({}), 'mobile', 'Scott');
  assert.match(svg, /^<div class="jm-map jm-mobile">/);
  assert.match(svg, /viewBox="0 0 300 768"/);
  assert.equal(count(svg, 'class="jm-stop'), 11);
  assert.equal(count(svg, 'class="jm-stage-header"'), 4);
});

test('buildSvg: done segments are seal-colored, others faded', () => {
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

test('sections: 3 dashed dividers -- vertical on desktop, horizontal on mobile', () => {
  const st = JourneyMap.computeStatus({});
  const lines = svg => [...svg.matchAll(/<line class="jm-divider" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"[^>]*stroke-dasharray/g)]
    .map(m => m.slice(1).map(Number));
  const desk = lines(JourneyMap.buildSvg(st, 'desktop', 'S'));
  assert.equal(desk.length, 3);
  desk.forEach(([x1, , x2]) => assert.equal(x1, x2, 'desktop divider is vertical'));
  const mob = lines(JourneyMap.buildSvg(st, 'mobile', 'S'));
  assert.equal(mob.length, 3);
  mob.forEach(([, y1, , y2]) => assert.equal(y1, y2, 'mobile divider is horizontal'));
});

test('sections: every stop sits inside its own stage section (base camp in Found)', () => {
  ['desktop', 'mobile'].forEach(layout => {
    const L = JourneyMap._layout(layout);
    assert.deepEqual(L.sections.map(sec => sec.stage), ['Found', 'Filled', 'Freed', 'Forged']);
    JourneyMap.STOPS.forEach(stop => {
      const sec = L.sections.find(x => x.stage === (stop.stage || 'Found'));
      const [x, y] = L.pts[stop.key];
      assert.ok(x > sec.x0 && x < sec.x1 && y > sec.y0 && y < sec.y1, `${layout} ${stop.key} (${x},${y}) inside ${sec.stage}`);
    });
  });
});

test('sections: stage header sits in the upper-left corner of its section', () => {
  ['desktop', 'mobile'].forEach(layout => {
    const L = JourneyMap._layout(layout);
    const svg = JourneyMap.buildSvg(JourneyMap.computeStatus({}), layout, 'S');
    const heads = [...svg.matchAll(/<g class="jm-stage-header"><circle cx="([\d.]+)" cy="([\d.]+)"/g)].map(m => [+m[1], +m[2]]);
    assert.equal(heads.length, 4);
    heads.forEach(([cx, cy], i) => {
      const sec = L.sections[i];
      assert.ok(cx - sec.x0 < 30 && cy - sec.y0 < 30 && cx > sec.x0 && cy > sec.y0, `${layout} ${sec.stage} header at (${cx},${cy})`);
    });
  });
});
