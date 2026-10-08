-- User login events for the Personal Center device history.
-- Stores only coarse device metadata. Do not add IP, location, or raw user agent.

create extension if not exists pgcrypto;

create table if not exists public.user_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_in_at timestamptz not null default now(),
  device_label text not null default '当前浏览器设备',
  browser text not null default '浏览器',
  os text not null default '未知系统',
  created_at timestamptz not null default now()
);

alter table public.user_login_events
  alter column device_label set default '当前浏览器设备',
  alter column browser set default '浏览器',
  alter column os set default '未知系统';

update public.user_login_events
set
  device_label = coalesce(nullif(btrim(device_label), ''), '当前浏览器设备'),
  browser = coalesce(nullif(btrim(browser), ''), '浏览器'),
  os = coalesce(nullif(btrim(os), ''), '未知系统');

alter table public.user_login_events
  alter column device_label set not null,
  alter column browser set not null,
  alter column os set not null;

create index if not exists user_login_events_user_id_idx
  on public.user_login_events (user_id);

create index if not exists user_login_events_user_logged_in_at_idx
  on public.user_login_events (user_id, logged_in_at desc, created_at desc, id desc);

alter table public.user_login_events enable row level security;

drop policy if exists "Users can read own login events" on public.user_login_events;
drop policy if exists "Users can insert own login events" on public.user_login_events;
drop policy if exists "Users can delete own login events" on public.user_login_events;
drop policy if exists "user_login_events_select_own" on public.user_login_events;
drop policy if exists "user_login_events_insert_own" on public.user_login_events;

create policy "Users can read own login events"
on public.user_login_events
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own login events"
on public.user_login_events
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can delete own login events"
on public.user_login_events
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.normalize_user_login_event_before_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.logged_in_at = coalesce(new.logged_in_at, now());
  new.created_at = coalesce(new.created_at, now());
  new.device_label = left(coalesce(nullif(btrim(new.device_label), ''), '当前浏览器设备'), 80);
  new.browser = left(coalesce(nullif(btrim(new.browser), ''), '浏览器'), 80);
  new.os = left(coalesce(nullif(btrim(new.os), ''), '未知系统'), 80);
  return new;
end;
$$;

drop trigger if exists normalize_user_login_event_before_insert on public.user_login_events;
create trigger normalize_user_login_event_before_insert
before insert on public.user_login_events
for each row
execute function public.normalize_user_login_event_before_insert();

create or replace function public.prune_user_login_events_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  delete from public.user_login_events
  where user_id = new.user_id
    and id not in (
      select id
      from public.user_login_events
      where user_id = new.user_id
      order by logged_in_at desc, created_at desc, id desc
      limit 5
    );

  return null;
end;
$$;

drop trigger if exists prune_user_login_events_after_insert on public.user_login_events;
create trigger prune_user_login_events_after_insert
after insert on public.user_login_events
for each row
execute function public.prune_user_login_events_after_insert();
