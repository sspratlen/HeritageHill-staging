// Run with: node --test tests/quick-signup.test.js (from the repo root)
const test = require('node:test');
const assert = require('node:assert/strict');
const QuickSignup = require('../js/quick-signup.js');

const PROFILE = { name: 'Scott Spratlen', email: 'scott@example.com', phone: '402' };

test('buildCtx: no user or no usable identity -> null (logged-out behavior)', () => {
  assert.equal(QuickSignup.buildCtx(null, null, null), null);
  assert.equal(QuickSignup.buildCtx({ id: 'u1', email: '' }, null, null), null);
});

test('buildCtx: profile identity wins; status ids become sets (any id type)', () => {
  const ctx = QuickSignup.buildCtx({ id: 'u1', email: 'other@x.com' }, PROFILE,
    { group_ids: [3, 7], member_group_ids: [9], event_ids: ['12'] });
  assert.deepEqual(ctx.who, { name: 'Scott Spratlen', email: 'scott@example.com', phone: '402' });
  assert.equal(QuickSignup.groupState(ctx, 7), 'requested');
  assert.equal(QuickSignup.groupState(ctx, '9'), 'member');
  assert.equal(QuickSignup.groupState(ctx, 4), 'ready');
  assert.equal(QuickSignup.eventState(ctx, 12), 'going');
  assert.equal(QuickSignup.eventState(ctx, 13), 'ready');
});

test('buildCtx: no profile falls back to auth metadata; missing status -> empty', () => {
  const ctx = QuickSignup.buildCtx({ id: 'u1', email: 'a@b.com', user_metadata: { full_name: 'Ann B' } }, null, null);
  assert.deepEqual(ctx.who, { name: 'Ann B', email: 'a@b.com', phone: '' });
  assert.equal(QuickSignup.groupState(ctx, 1), 'ready');
});

test('buildCtx: no name anywhere -> null, so the full form is used', () => {
  assert.equal(QuickSignup.buildCtx({ id: 'u1', email: 'a@b.com' }, { name: '', email: 'a@b.com' }, null), null);
});

test('states: logged out is "anon"', () => {
  assert.equal(QuickSignup.groupState(null, 1), 'anon');
  assert.equal(QuickSignup.eventState(null, 1), 'anon');
});

test('markGroup / markEvent update state immediately', () => {
  const ctx = QuickSignup.buildCtx({ id: 'u' }, PROFILE, null);
  QuickSignup.markGroup(ctx, 5); QuickSignup.markEvent(ctx, 6);
  assert.equal(QuickSignup.groupState(ctx, 5), 'requested');
  assert.equal(QuickSignup.eventState(ctx, 6), 'going');
  QuickSignup.markGroup(null, 5); // no-op, no throw
});

test('confirmHtml: escapes identity, message box only when asked', () => {
  const html = QuickSignup.confirmHtml({ who: { name: '<b>', email: 'e@x' }, lead: 'Joining as', action: 'Send request', withMessage: true });
  assert.match(html, /&lt;b&gt;/);
  assert.match(html, /<textarea/);
  assert.doesNotMatch(QuickSignup.confirmHtml({ who: PROFILE, lead: 'RSVP as', action: "I'm going" }), /<textarea/);
});
