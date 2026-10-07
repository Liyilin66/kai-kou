import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/health.js';

let savedEnv, savedFetch, savedLog, calls, logs;
beforeEach(() => {
  savedEnv = { ...process.env }; savedFetch = globalThis.fetch; savedLog = console.log;
  Object.assign(process.env, { CRON_SECRET: 'cron-test-secret', SUPABASE_URL: 'https://health-test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-test-secret' });
  calls = []; logs = [];
  console.log = (...args) => logs.push(args);
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init); calls.push(request);
    return new Response(JSON.stringify([{ id: 'private-question' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
});
afterEach(() => {
  globalThis.fetch = savedFetch; console.log = savedLog;
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
});
async function request({ method = 'GET', authorization = 'Bearer cron-test-secret' } = {}) {
  const response = { headers: {}, setHeader(key,value) { this.headers[key]=value; }, status(code) { this.statusCode=code; return this; }, json(body) { this.body=body; return this; } };
  await handler({ method, headers: authorization === undefined ? {} : { authorization } }, response);
  return response;
}
for (const authorization of ['', 'Bearer wrong-token']) {
  test('rejects missing or incorrect cron token without querying the database: '+authorization, async () => {
    const response = await request({ authorization });
    assert.equal(response.statusCode, 401); assert.equal(response.body.ok, false); assert.equal(calls.length,0);
  });
}
test('authorized GET reads at most one question and only returns health timing', async () => {
  const response=await request();
  assert.equal(response.statusCode,200); assert.equal(response.body.ok,true);
  assert.ok(Number.isFinite(response.body.db_ms) && response.body.db_ms >= 0);
  assert.deepEqual(Object.keys(response.body).sort(),['db_ms','ok']);
  assert.equal(calls.length,1);
  const url=new URL(calls[0].url);
  assert.equal(url.pathname,'/rest/v1/questions'); assert.equal(url.searchParams.get('select'),'id'); assert.equal(url.searchParams.get('limit'),'1');
  assert.equal(calls[0].headers.get('apikey'),'service-test-secret');
  assert.equal(logs.length,1); assert.equal(logs[0][0],'[health]');
  assert.equal(JSON.parse(logs[0][1]).ok,true);
});
test('database rejection returns sanitized failure and sanitized log', async () => {
  globalThis.fetch=async()=>new Response(JSON.stringify({message:'private-question service-test-secret cron-test-secret',code:'PRIVATE'}),{status:500,headers:{'Content-Type':'application/json'}});
  const response=await request();
  assert.equal(response.statusCode,500); assert.deepEqual(response.body,{ok:false,error_code:'db_query_failed'});
  const exposed=JSON.stringify([response.body,logs]);
  for(const secret of ['service-test-secret','cron-test-secret','private-question','PRIVATE']) assert.equal(exposed.includes(secret),false);
});
test('unexpected client configuration errors are sanitized', async () => {
  process.env.SUPABASE_URL='invalid';
  const response=await request();assert.equal(response.statusCode,500);assert.equal(response.body.ok,false);assert.equal(calls.length,0);
});
test('missing database configuration fails explicitly', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response=await request();assert.equal(response.statusCode,500);assert.deepEqual(response.body,{ok:false,error_code:'supabase_not_configured'});assert.equal(calls.length,0);
});
test('without CRON_SECRET health is accessible as specified', async () => {
  delete process.env.CRON_SECRET;
  const response=await request({authorization:''});assert.equal(response.statusCode,200);
});
test('non-GET is rejected before any database call', async () => {
  const response=await request({method:'POST'});assert.equal(response.statusCode,405);assert.equal(response.headers.Allow,'GET');assert.equal(calls.length,0);
});
