-- DI practice recording storage setup
-- Extends the existing private "practice-audio" bucket without touching WFD chain.

insert into storage.buckets (id, name, public)
values ('practice-audio', 'practice-audio', false)
on conflict (id) do update
set public = false;

drop policy if exists "practice-audio-select-own-di" on storage.objects;
drop policy if exists "practice-audio-insert-own-di" on storage.objects;
drop policy if exists "practice-audio-update-own-di" on storage.objects;
drop policy if exists "practice-audio-delete-own-di" on storage.objects;

create policy "practice-audio-select-own-di"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'practice-audio'
  and split_part(name, '/', 1) = 'di'
  and split_part(name, '/', 2) = auth.uid()::text
);

create policy "practice-audio-insert-own-di"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'practice-audio'
  and split_part(name, '/', 1) = 'di'
  and split_part(name, '/', 2) = auth.uid()::text
);

create policy "practice-audio-update-own-di"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'practice-audio'
  and split_part(name, '/', 1) = 'di'
  and split_part(name, '/', 2) = auth.uid()::text
)
with check (
  bucket_id = 'practice-audio'
  and split_part(name, '/', 1) = 'di'
  and split_part(name, '/', 2) = auth.uid()::text
);

create policy "practice-audio-delete-own-di"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'practice-audio'
  and split_part(name, '/', 1) = 'di'
  and split_part(name, '/', 2) = auth.uid()::text
);
