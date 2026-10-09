import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createTrialClient, findTrialUser } from './lib/trial-admin.js';
export function parseGrantArgs(args) {
  const { values } = parseArgs({ args, options: { email: { type: 'string' }, days: { type: 'string', default: '7' }, apply: { type: 'boolean', default: false } } });
  if (!values.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw new Error('请提供有效的 --email');
  if (!/^\d+$/.test(values.days) || !Number.isSafeInteger(Number(values.days)) || Number(values.days) < 1) throw new Error('--days 必须为正整数');
  return { email: values.email.trim(), days: Number(values.days), apply: values.apply };
}
export async function grantTrial(client, { email, days = 7, apply = false }, now = new Date()) {
  if (!Number.isSafeInteger(days) || days < 1) throw new Error('--days 必须为正整数');
  const user = await findTrialUser(client, email);
  if (!user) return { mode: apply ? 'apply' : 'dry-run', message: '对方还没注册', changed: false };
  const patch = { trial_days: days, trial_granted_at: now.toISOString() };
  if (apply) {
    const { data, error } = await client.from('profiles').update(patch).eq('id', user.id).select('id');
    if (error) throw error;
    if (data.length !== 1) throw new Error('用户已注册，但未找到唯一的 profile；未开通试用');
  }
  return { mode: apply ? 'apply' : 'dry-run', patch, changed: apply };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await grantTrial(createTrialClient(), parseGrantArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
