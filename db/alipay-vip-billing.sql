create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists premium_since timestamptz,
  add column if not exists vip_plan text,
  add column if not exists vip_expires_at timestamptz,
  add column if not exists vip_last_order_no text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_vip_plan_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_vip_plan_check
      check (vip_plan is null or vip_plan in ('week', 'month', 'lifetime'));
  end if;
end
$$;

create table if not exists public.vip_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null default 'alipay_wap',
  plan_code text not null,
  subject text not null,
  amount numeric(10, 2) not null,
  currency text not null default 'CNY',
  status text not null default 'created',
  paid_amount numeric(10, 2),
  paid_at timestamptz,
  trade_status text,
  alipay_trade_no text unique,
  buyer_id text,
  notify_verified_at timestamptz,
  notify_count integer not null default 0,
  notify_payload jsonb,
  last_query_at timestamptz,
  entitlement_granted boolean not null default false,
  entitlement_granted_at timestamptz,
  entitlement_snapshot jsonb,
  last_error text,
  expire_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vip_orders_plan_code_check'
      and conrelid = 'public.vip_orders'::regclass
  ) then
    alter table public.vip_orders
      add constraint vip_orders_plan_code_check
      check (plan_code in ('week', 'month', 'lifetime'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'vip_orders_status_check'
      and conrelid = 'public.vip_orders'::regclass
  ) then
    alter table public.vip_orders
      add constraint vip_orders_status_check
      check (status in ('created', 'paid', 'closed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'vip_orders_amount_check'
      and conrelid = 'public.vip_orders'::regclass
  ) then
    alter table public.vip_orders
      add constraint vip_orders_amount_check
      check (amount > 0);
  end if;
end
$$;

create index if not exists vip_orders_user_created_idx
  on public.vip_orders (user_id, created_at desc);

create index if not exists vip_orders_user_status_idx
  on public.vip_orders (user_id, status, expire_at);

create or replace function public.set_vip_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists vip_orders_set_updated_at on public.vip_orders;

create trigger vip_orders_set_updated_at
before update on public.vip_orders
for each row
execute function public.set_vip_orders_updated_at();

alter table public.vip_orders enable row level security;
revoke all on public.vip_orders from anon, authenticated;

create or replace function public.acquire_vip_order_query_slot(
  p_order_no text,
  p_min_interval_seconds integer default 8
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.vip_orders%rowtype;
  v_now timestamptz := now();
  v_allowed boolean := false;
  v_effective_last_query_at timestamptz;
begin
  select *
  into v_order
  from public.vip_orders
  where order_no = btrim(coalesce(p_order_no, ''))
  for update;

  if not found then
    raise exception 'vip_order_not_found';
  end if;

  if v_order.last_query_at is null
    or v_order.last_query_at <= (v_now - make_interval(secs => greatest(coalesce(p_min_interval_seconds, 0), 0)))
  then
    update public.vip_orders
    set last_query_at = v_now
    where id = v_order.id;

    v_allowed := true;
    v_effective_last_query_at := v_now;
  else
    v_effective_last_query_at := v_order.last_query_at;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'last_query_at', v_effective_last_query_at,
    'status', v_order.status,
    'expire_at', v_order.expire_at
  );
end
$$;

revoke all on function public.acquire_vip_order_query_slot(text, integer) from public, anon, authenticated;
grant execute on function public.acquire_vip_order_query_slot(text, integer) to service_role;

create or replace function public.confirm_vip_order_payment(
  p_order_no text,
  p_trade_status text,
  p_paid_amount numeric,
  p_alipay_trade_no text default null,
  p_buyer_id text default null,
  p_paid_at timestamptz default null,
  p_notify_payload jsonb default null,
  p_source text default 'notify'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_order public.vip_orders%rowtype;
  v_profile public.profiles%rowtype;
  v_now timestamptz := now();
  v_effective_paid_at timestamptz := coalesce(p_paid_at, now());
  v_source text := lower(btrim(coalesce(p_source, 'notify')));
  v_new_plan text;
  v_new_expires_at timestamptz;
  v_is_legacy_lifetime boolean := false;
  v_snapshot jsonb;
begin
  if btrim(coalesce(p_order_no, '')) = '' then
    raise exception 'vip_order_no_required';
  end if;

  if p_trade_status not in ('TRADE_SUCCESS', 'TRADE_FINISHED') then
    raise exception 'vip_order_trade_status_invalid';
  end if;

  if p_paid_amount is null or p_paid_amount <= 0 then
    raise exception 'vip_order_paid_amount_invalid';
  end if;

  select *
  into v_order
  from public.vip_orders
  where order_no = btrim(p_order_no)
  for update;

  if not found then
    raise exception 'vip_order_not_found';
  end if;

  if round(v_order.amount, 2) <> round(p_paid_amount, 2) then
    raise exception 'vip_order_amount_mismatch';
  end if;

  if v_order.entitlement_granted then
    update public.vip_orders
    set status = 'paid',
        trade_status = p_trade_status,
        paid_amount = p_paid_amount,
        paid_at = coalesce(v_order.paid_at, v_effective_paid_at),
        alipay_trade_no = coalesce(v_order.alipay_trade_no, nullif(btrim(coalesce(p_alipay_trade_no, '')), '')),
        buyer_id = coalesce(v_order.buyer_id, nullif(btrim(coalesce(p_buyer_id, '')), '')),
        notify_payload = coalesce(p_notify_payload, v_order.notify_payload),
        notify_verified_at = case when v_source = 'notify' then coalesce(v_order.notify_verified_at, v_now) else v_order.notify_verified_at end,
        notify_count = v_order.notify_count + case when v_source = 'notify' then 1 else 0 end,
        last_query_at = case when v_source = 'query' then v_now else v_order.last_query_at end,
        last_error = null
    where id = v_order.id;

    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_no', v_order.order_no,
      'profile_id', v_order.user_id
    );
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_order.user_id
  for update;

  if not found then
    raise exception 'vip_profile_not_found';
  end if;

  v_is_legacy_lifetime :=
    coalesce(v_profile.is_premium, false)
    and nullif(btrim(coalesce(v_profile.vip_plan, '')), '') is null
    and v_profile.vip_expires_at is null;

  if v_is_legacy_lifetime or v_order.plan_code = 'lifetime' then
    v_new_plan := 'lifetime';
    v_new_expires_at := null;
  elsif v_order.plan_code = 'week' then
    v_new_plan := 'week';
    v_new_expires_at := greatest(v_now, coalesce(v_profile.vip_expires_at, v_now)) + interval '7 day';
  elsif v_order.plan_code = 'month' then
    v_new_plan := 'month';
    v_new_expires_at := greatest(v_now, coalesce(v_profile.vip_expires_at, v_now)) + interval '30 day';
  else
    raise exception 'vip_order_plan_invalid';
  end if;

  update public.profiles
  set is_premium = true,
      premium_since = coalesce(v_profile.premium_since, v_now),
      vip_plan = v_new_plan,
      vip_expires_at = v_new_expires_at,
      vip_last_order_no = v_order.order_no
  where id = v_order.user_id;

  v_snapshot := jsonb_strip_nulls(
    jsonb_build_object(
      'vip_plan', v_new_plan,
      'vip_expires_at', v_new_expires_at,
      'granted_at', v_now,
      'source', v_source
    )
  );

  update public.vip_orders
  set status = 'paid',
      trade_status = p_trade_status,
      paid_amount = p_paid_amount,
      paid_at = v_effective_paid_at,
      alipay_trade_no = nullif(btrim(coalesce(p_alipay_trade_no, '')), ''),
      buyer_id = nullif(btrim(coalesce(p_buyer_id, '')), ''),
      notify_payload = coalesce(p_notify_payload, v_order.notify_payload),
      notify_verified_at = case when v_source = 'notify' then v_now else v_order.notify_verified_at end,
      notify_count = v_order.notify_count + case when v_source = 'notify' then 1 else 0 end,
      last_query_at = case when v_source = 'query' then v_now else v_order.last_query_at end,
      entitlement_granted = true,
      entitlement_granted_at = v_now,
      entitlement_snapshot = v_snapshot,
      last_error = null
  where id = v_order.id;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'order_no', v_order.order_no,
    'profile_id', v_order.user_id,
    'vip_plan', v_new_plan,
    'vip_expires_at', v_new_expires_at
  );
end
$$;

revoke all on function public.confirm_vip_order_payment(text, text, numeric, text, text, timestamptz, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.confirm_vip_order_payment(text, text, numeric, text, text, timestamptz, jsonb, text)
  to service_role;
