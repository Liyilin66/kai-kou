import test from 'node:test';
import assert from 'node:assert/strict';
import { grantTrial, parseGrantArgs } from '../../scripts/trial-grant.js';
function client(users) {
  const writes = [];
  return { writes, auth: { admin: { listUsers: async () => ({ data: { users } }) } },
    from: () => ({ update: patch => { writes.push(patch); return { eq: () => ({ select: async () => ({ data: [{ id: 'u' }] }) }) }; } }) };
}
test('grant defaults to seven days and dry-run without writes', async () => {
  const args = parseGrantArgs(['--email', 'a@x.com']);
  const c = client([{ id: 'u', email: 'a@x.com' }]);
  const result = await grantTrial(c, args, new Date('2026-10-09T00:00:00Z'));
  assert.equal(result.mode, 'dry-run'); assert.deepEqual(c.writes, []);
  assert.deepEqual(result.patch, { trial_days: 7, trial_granted_at: '2026-10-09T00:00:00.000Z' });
});
test('apply updates only trial fields', async () => {
  const c = client([{ id: 'u', email: 'A@x.com' }]);
  assert.equal((await grantTrial(c, { email: 'a@x.com', days: 3, apply: true })).changed, true);
  assert.deepEqual(Object.keys(c.writes[0]).sort(), ['trial_days', 'trial_granted_at']);
});
test('missing registration is explicit and does not write', async () => {
  const c = client([]); assert.equal((await grantTrial(c, { email: 'a@x.com', apply: true })).message, '对方还没注册');
  assert.equal(c.writes.length, 0);
});
test('days and CLI flags are validated', () => {
  for (const days of ['0', '-1', '1.5', 'no', '9007199254740992']) assert.throws(() => parseGrantArgs(['--email', 'a@x.com', '--days', days]));
  assert.throws(() => parseGrantArgs(['--email', 'bad']));
  assert.throws(() => parseGrantArgs(['--email', 'a@x.com', '--unknown']));
});
test('apply reports a missing profile instead of claiming success', async () => {
  const c = client([{ id: 'u', email: 'a@x.com' }]);
  c.from = () => ({ update: () => ({ eq: () => ({ select: async () => ({ data: [] }) }) }) });
  await assert.rejects(grantTrial(c, { email: 'a@x.com', apply: true }), /未找到唯一的 profile/);
});
test('admin lookup paginates and does not ignore service errors', async () => {
  const calls = [];
  const c = client([]);
  c.auth.admin.listUsers = async ({ page }) => { calls.push(page); return { data: { users: page === 1 ? Array.from({ length: 1000 }, () => ({ email: 'other@x.com' })) : [{ id: 'u', email: 'a@x.com' }] } }; };
  await grantTrial(c, { email: 'a@x.com' }); assert.deepEqual(calls, [1, 2]);
  c.auth.admin.listUsers = async () => ({ error: Error('unavailable') });
  await assert.rejects(grantTrial(c, { email: 'a@x.com' }), /unavailable/);
});
