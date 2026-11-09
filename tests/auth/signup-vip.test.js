import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAccessStatus as getBackendAccessStatus } from "../../backend/auth/access-status.js";
import { getAccessStatus as getFrontendAccessStatus } from "../../src/lib/access-status.js";
import { isAgentVipProfile } from "../../backend/agent/agent-memory-service.js";

const registeredAt = new Date("2026-11-01T00:00:00.000Z");
const expiresAt = new Date("2026-11-08T00:00:00.000Z");
const user = { created_at: registeredAt.toISOString() };
const signupProfile = {
  is_premium: true,
  premium_since: registeredAt.toISOString(),
  vip_plan: "week",
  vip_expires_at: expiresAt.toISOString(),
  trial_days: 0
};

for (const [name, now, expectedVip] of [
  ["new registration", registeredAt, true],
  ["one millisecond before seven days", new Date(expiresAt.getTime() - 1), true],
  ["exactly seven days", expiresAt, false],
  ["after seven days", new Date(expiresAt.getTime() + 1), false]
]) {
  test(`signup VIP access at ${name}`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now });

    for (const getAccessStatus of [getBackendAccessStatus, getFrontendAccessStatus]) {
      const access = getAccessStatus(user, signupProfile);
      assert.equal(access.isPremium, expectedVip);
      assert.equal(access.canUseAiScoring, expectedVip);
      assert.equal(access.isInTrial, false);
      assert.equal(access.accessStatus, expectedVip ? "vip" : "not_opened");
      assert.equal(access.vipPlan, "week");
      assert.equal(access.isLegacyLifetime, false);
    }

    assert.equal(isAgentVipProfile(signupProfile), expectedVip);
  });
}

test("existing lifetime VIP access is preserved after signup VIP expires", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2036-11-09T00:00:00.000Z") });

  for (const profile of [
    { is_premium: true, vip_plan: null, vip_expires_at: null },
    { is_premium: true, vip_plan: "lifetime", vip_expires_at: null }
  ]) {
    for (const getAccessStatus of [getBackendAccessStatus, getFrontendAccessStatus]) {
      const access = getAccessStatus(user, profile);
      assert.equal(access.isPremium, true);
      assert.equal(access.canUseAiScoring, true);
      assert.equal(access.vipPlan, "lifetime");
    }
    assert.equal(isAgentVipProfile(profile), true);
  }
});

test("existing non-VIP users do not receive signup VIP from access evaluation", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: registeredAt });
  const profile = { is_premium: false, vip_plan: null, vip_expires_at: null, trial_days: 0 };

  for (const getAccessStatus of [getBackendAccessStatus, getFrontendAccessStatus]) {
    assert.equal(getAccessStatus(user, profile).isPremium, false);
  }
  assert.equal(isAgentVipProfile(profile), false);
});

test("registration profile fallback preserves trigger-created VIP entitlements", async (t) => {
  const env = {
    SUPABASE_URL: "https://signup-test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    BREVO_API_KEY: "test-mail-key",
    REGISTER_OTP_FROM_EMAIL: "test@example.com"
  };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }

  const email = "new@example.com";
  const id = "11111111-1111-4111-8111-111111111111";
  const requests = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(input);
    requests.push(url.pathname);
    if (url.pathname === "/rest/v1/rpc/auth_email_exists") return Response.json(false);
    if (url.pathname === "/rest/v1/register_email_codes") return Response.json([{ email }]);
    if (url.pathname === "/auth/v1/admin/users") {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.user_metadata, { username: "New user" });
      return Response.json({ user: { id, email } });
    }
    if (url.pathname === "/rest/v1/profiles") {
      assert.equal(url.searchParams.get("on_conflict"), "id");
      assert.match(new Headers(init.headers).get("Prefer"), /resolution=ignore-duplicates/);
      assert.deepEqual(JSON.parse(init.body), { id, email });
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });

  const { handleRegisterWithCode } = await import("../../backend/auth/register-code-service.js");
  const res = {
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await handleRegisterWithCode({ method: "POST", body: {
    username: "New user", email, verificationCode: "123456",
    password: "test-password", confirmPassword: "test-password"
  } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(requests, [
    "/rest/v1/rpc/auth_email_exists", "/rest/v1/register_email_codes",
    "/auth/v1/admin/users", "/rest/v1/profiles"
  ]);
});

test("signup migration grants seven days only on a new profile insert", () => {
  const sql = readFileSync(new URL("../../db/signup-vip.sql", import.meta.url), "utf8")
    .replace(/--[^\n]*/g, "");

  assert.match(sql, /create or replace function public\.handle_new_user\(\)/i);
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /insert into public\.profiles\s*\(\s*id,\s*email,\s*is_premium,\s*premium_since,\s*vip_plan,\s*vip_expires_at\s*\)\s*values\s*\(\s*new\.id,\s*new\.email,\s*true,\s*now\(\),\s*'week',\s*now\(\) \+ interval '7 days'\s*\)/i);
  assert.match(sql, /on conflict \(id\) do nothing/i);
  assert.doesNotMatch(sql, /\bupdate\b|\bdelete\b|raw_user_meta_data|user_metadata/i);
});
