import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
export function createTrialClient() {
  dotenv.config({ path: '.env.local', quiet: true });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('本地缺少 Supabase URL 或 service role 配置');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function findTrialUser(client, email) {
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find(user => user.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
}
export async function readAll(queryFactory) {
  const rows = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await queryFactory(start, start + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
