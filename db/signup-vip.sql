-- Run after db/alipay-vip-billing.sql. The existing AFTER INSERT trigger on
-- auth.users calls this function in the same transaction as account creation.
-- Replacing the function affects future signups only; no existing profiles
-- are updated, and user-controlled metadata never determines entitlements.
begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email,
    is_premium,
    premium_since,
    vip_plan,
    vip_expires_at
  ) values (
    new.id,
    new.email,
    true,
    now(),
    'week',
    now() + interval '7 days'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

commit;
