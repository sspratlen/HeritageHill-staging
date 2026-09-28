// Run with: node --test (from the repo root)
const test = require('node:test');
const assert = require('node:assert/strict');
const JourneyMap = require('../js/journey-map.js');

const KEYS = ['baptism', 'membership', 'smallgroup', 'plant', 'discover', 'grow', 'disc', 'gifts', 'impactteam', 'serving'];

test('STOPS are in trail order with a tab, stage and blurb for each', () => {
  assert.deepEqual(JourneyMap.STOPS.map(s => s.key), KEYS);
  JourneyMap.STOPS.forEach(s => {
    assert.ok(s.tab, s.key + ' has a tab');
    assert.ok(JourneyMap.STAGE_INFO[s.stage], s.key + ' has a known stage');
    assert.ok(s.blurb, s.key + ' has a blurb');
  });
});

test('computeStatus: null data (load failed) -> nothing done, no throw', () => {
  const st = JourneyMap.computeStatus(null);
  KEYS.forEach(k => assert.equal(st[k], false, k));
});

test('computeStatus: empty data -> nothing done', () => {
  const st = JourneyMap.computeStatus({});
  KEYS.forEach(k => assert.equal(st[k], false, k));
});

const ALL_DONE = {
  baptizedAt: '2025-05-01T00:00:00+00:00', memberSince: '2025-06-01',
  email: 'a@b.com',
  groups: [{ id: 1, name: 'Tue', leaderEmail: 'x@y.com' }],
  groupMemberships: [{ groupId: 1, leftAt: null, joinedAt: '2025-02-10' }, { groupId: 2, leftAt: null, joinedAt: '2024-09-01' }],
  gtRegistrations: [
    { part: 'about_us', attended: true, sessionDate: '2025-03-02' }, { part: 'about_us', attended: true, sessionDate: '2025-01-05' },
    { part: 'about_you', attended: true, sessionDate: '2025-03-09' }, { part: 'get_involved', attended: true, sessionDate: '2025-03-16' },
  ],
  discAttemptCount: 1, giftsAttemptCount: 2,
  discDates: ['2025-04-01T12:00:00Z'], giftsDates: ['2025-04-20T12:00:00Z', '2025-04-02T12:00:00Z'],
  teamMemberships: [{ teamId: 9, role: 'member', trained: true, trainedAt: '2025-07-01', joinedAt: '2025-06-15', leftAt: null }],
};

test('computeStatus: everything done', () => {
  const st = JourneyMap.computeStatus(ALL_DONE);
  KEYS.forEach(k => assert.equal(st[k], true, k));
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

test('computeDates: earliest date per done step', () => {
  const dt = JourneyMap.computeDates(ALL_DONE);
  assert.equal(dt.baptism, '2025-05-01T00:00:00+00:00');
  assert.equal(dt.membership, '2025-06-01');
  assert.equal(dt.smallgroup, '2024-09-01');
  assert.equal(dt.plant, '2025-01-05');
  assert.equal(dt.discover, '2025-03-09');
  assert.equal(dt.grow, '2025-03-16');
  assert.equal(dt.disc, '2025-04-01T12:00:00Z');
  assert.equal(dt.gifts, '2025-04-02T12:00:00Z');
  assert.equal(dt.impactteam, '2025-06-15');
  assert.equal(dt.serving, '2025-07-01');
});

test('computeDates: null data and missing dates -> null, never throws', () => {
  KEYS.forEach(k => assert.equal(JourneyMap.computeDates(null)[k], null, k));
  const dt = JourneyMap.computeDates({
    email: 'l@c.org', groups: [{ id: 1, leaderEmail: 'l@c.org' }], discAttemptCount: 1,
    gtRegistrations: [{ part: 'about_us', attended: false, sessionDate: '2025-01-05' }],
  });
  assert.equal(dt.smallgroup, null); // leads a group, no join date
  assert.equal(dt.serving, null);
  assert.equal(dt.disc, null);       // attempt count but no dates passed
  assert.equal(dt.plant, null);      // registered, not attended
});

test('computeDates: untrained leader serving -> team join date', () => {
  const dt = JourneyMap.computeDates({ teamMemberships: [{ teamId: 1, role: 'leader', trained: false, joinedAt: '2025-08-03' }] });
  assert.equal(dt.serving, '2025-08-03');
});

test('nextStep: first not-done step in trail order, null when all done', () => {
  assert.equal(JourneyMap.nextStep(JourneyMap.computeStatus({})).key, 'baptism');
  const st = JourneyMap.computeStatus({ baptizedAt: '2025-05-01', memberSince: '2025-06-01', discAttemptCount: 1 });
  assert.equal(JourneyMap.nextStep(st).key, 'smallgroup');
  assert.equal(JourneyMap.nextStep(JourneyMap.computeStatus(ALL_DONE)), null);
});

test('fmtMonth: month + year with no UTC day shift', () => {
  assert.equal(JourneyMap.fmtMonth('2025-03-01T00:00:00+00:00'), 'Mar 2025');
  assert.equal(JourneyMap.fmtMonth('2024-12-31'), 'Dec 2024');
  assert.equal(JourneyMap.fmtMonth(null), '');
  assert.equal(JourneyMap.fmtMonth('garbage'), '');
});

const count = (s, needle) => s.split(needle).length - 1;

test('buildHtml: 10 row buttons, 4 stage sections, done rows show dates', () => {
  const d = { baptizedAt: '2025-05-01', memberSince: '2025-06-01', discAttemptCount: 1, discDates: ['2025-04-01'] };
  const html = JourneyMap.buildHtml(JourneyMap.computeStatus(d), JourneyMap.computeDates(d), 'Scott');
  assert.equal(count(html, '<button type="button" class="jt-row'), 10);
  assert.equal(count(html, 'class="jt-row jt-done'), 3);
  assert.equal(count(html, 'class="jt-stage"'), 4);
  assert.match(html, /Scott&#39;s journey/);
  assert.match(html, /3 of 10 steps taken/);
  assert.match(html, /aria-label="Baptism: done May 2025"/);
  assert.match(html, /aria-label="Plant: not yet"/);
  assert.match(html, /Suggested next step/i);
  assert.match(html, /data-key="smallgroup"[^>]*>Go to Small group/);
  assert.equal(count(html, 'jt-row jt-next'), 1);
});

test('buildHtml: done step without a date shows "Done"', () => {
  const d = { email: 'l@c.org', groups: [{ id: 1, leaderEmail: 'l@c.org' }] };
  const html = JourneyMap.buildHtml(JourneyMap.computeStatus(d), JourneyMap.computeDates(d), 'S');
  assert.match(html, /aria-label="Small group: done"/);
});

test('buildHtml: all done -> completion card linking to Serving', () => {
  const html = JourneyMap.buildHtml(JourneyMap.computeStatus(ALL_DONE), JourneyMap.computeDates(ALL_DONE), 'S');
  assert.match(html, /completed every step/);
  assert.match(html, /data-key="serving"[^>]*>Keep serving/);
  assert.equal(count(html, 'jt-row jt-next'), 0);
});

test('buildHtml: escapes the name and falls back to "Your journey"', () => {
  const st = JourneyMap.computeStatus({}), dt = JourneyMap.computeDates({});
  assert.match(JourneyMap.buildHtml(st, dt, '<b>'), /&lt;b&gt;&#39;s journey/);
  assert.match(JourneyMap.buildHtml(st, dt, ''), />Your journey</);
});
