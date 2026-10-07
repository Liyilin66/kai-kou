import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error_code: 'method_not_allowed' });
  }

  const secret = process.env.CRON_SECRET;
  if (secret && req.headers?.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error_code: 'unauthorized' });
  }

  const startedAt = performance.now();
  const reply = (ok, errorCode) => {
    const dbMs = Math.round(performance.now() - startedAt);
    console.log('[health]', JSON.stringify({ ok, db_ms: dbMs, ...(errorCode ? { error_code: errorCode } : {}) }));
    return res.status(ok ? 200 : 500).json(ok ? { ok: true, db_ms: dbMs } : { ok: false, error_code: errorCode });
  };

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return reply(false, 'supabase_not_configured');

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { error } = await supabase.from('questions').select('id').limit(1);
    return error ? reply(false, 'db_query_failed') : reply(true);
  } catch {
    return reply(false, 'db_query_failed');
  }
}
