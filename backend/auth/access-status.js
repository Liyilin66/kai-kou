export const ACCESS_STATUS = {
  VIP: "vip",
  TRIAL: "trial",
  TRIAL_EXPIRED: "trial_expired",
  NOT_OPENED: "not_opened"
};

export function getAccessStatus(user, profile) {
  const now = new Date();
  const trialDays = toNonNegativeInteger(profile?.trial_days);
  const registeredAt = parseDateOrFallback(user?.created_at, now);
  const trialStartAt = parseDateOrFallback(profile?.trial_granted_at, registeredAt);
  const trialDaysLeft = trialDays > 0 ? Math.max(0, trialDays - getDaysSince(trialStartAt, now)) : 0;
  const vipPlan = normalizeVipPlan(profile?.vip_plan);
  const vipExpiresAt = parseNullableDate(profile?.vip_expires_at);
  const hasLegacyPremium = Boolean(profile?.is_premium) && !vipPlan && !vipExpiresAt;
  const hasLifetimeVip = vipPlan === "lifetime" || hasLegacyPremium;
  const hasTimedVip = !hasLifetimeVip && Boolean(vipPlan) && vipPlan !== "lifetime" && Boolean(vipExpiresAt)
    && vipExpiresAt.getTime() > now.getTime();
  const isPremium = hasLifetimeVip || hasTimedVip;
  const isInTrial = !isPremium && trialDaysLeft > 0;

  let accessStatus = ACCESS_STATUS.NOT_OPENED;
  if (isPremium) accessStatus = ACCESS_STATUS.VIP;
  else if (isInTrial) accessStatus = ACCESS_STATUS.TRIAL;
  else if (trialDays > 0) accessStatus = ACCESS_STATUS.TRIAL_EXPIRED;

  return {
    isPremium,
    isInTrial,
    trialDaysLeft,
    canUseAiScoring: isPremium || isInTrial,
    accessStatus,
    statusText: buildStatusText(accessStatus, trialDaysLeft),
    vipPlan: hasLifetimeVip ? "lifetime" : vipPlan,
    vipExpiresAt: hasTimedVip && vipExpiresAt ? vipExpiresAt.toISOString() : null,
    isLegacyLifetime: hasLegacyPremium
  };
}

export function buildStatusText(accessStatus, trialDaysLeft) {
  if (accessStatus === ACCESS_STATUS.VIP) return "VIP - Unlimited practice";
  if (accessStatus === ACCESS_STATUS.TRIAL) return `Trial - ${trialDaysLeft} day(s) left`;
  if (accessStatus === ACCESS_STATUS.TRIAL_EXPIRED) return "Trial expired";
  return "Not activated";
}

function getDaysSince(fromDate, now = new Date()) {
  const diff = now.getTime() - fromDate.getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function parseDateOrFallback(value, fallbackDate) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return fallbackDate;
  return parsed;
}

function parseNullableDate(value) {
  if (value === null || value === undefined || `${value}`.trim() === "") return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

function toNonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function normalizeVipPlan(value) {
  const plan = `${value || ""}`.trim().toLowerCase();
  if (plan === "week" || plan === "month" || plan === "lifetime") return plan;
  return "";
}
