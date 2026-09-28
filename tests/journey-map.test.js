// Run with: node --test tests/
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
