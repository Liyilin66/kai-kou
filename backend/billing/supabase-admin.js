import { createClient } from "@supabase/supabase-js";
import { inspectRequiredServerEnv } from "../auth/server-env.js";
import { BillingRequestError } from "./http.js";

let cachedAdminClient = null;

export function getBillingAdminClient() {
  if (cachedAdminClient) return cachedAdminClient;

  const env = inspectRequiredServerEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  if (!env.ok) {
    throw new BillingRequestError(
      500,
      "supabase_service_not_configured",
      `Missing required server env: ${env.missing.join(", ")}.`
    );
  }

  cachedAdminClient = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return cachedAdminClient;
}

export function readBearerToken(req) {
  const header = `${req?.headers?.authorization || req?.headers?.Authorization || ""}`.trim();
  if (!header || !header.startsWith("Bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

export async function requireAuthenticatedUser(req) {
  const token = readBearerToken(req);
  if (!token) {
    throw new BillingRequestError(401, "unauthorized", "Please sign in first.");
  }

  const supabase = getBillingAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user || null;
  if (error || !user?.id) {
    throw new BillingRequestError(401, "unauthorized", "Session expired. Please sign in again.");
  }

  return {
    user,
    token,
    supabase
  };
}

export async function ensureProfileForUser(user, supabase = getBillingAdminClient()) {
  const userId = `${user?.id || ""}`.trim();
  if (!userId) {
    throw new BillingRequestError(400, "user_id_required", "Authenticated user id is required.");
  }

  const email = `${user?.email || ""}`.trim() || null;
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        email
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new BillingRequestError(500, "profile_sync_failed", "Failed to load billing profile.");
  }

  return data;
}
