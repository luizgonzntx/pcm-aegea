
create table public.pcm_teresina_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role in ('admin','viewer')),
 created_at timestamptz not null default now()
);
create table public.pcm_teresina_dataset (
 id text primary key check (id = 'principal'),
 payload jsonb,
 revision integer not null default 0,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 constraint valid_payload check (payload is null or (
 jsonb_typeof(payload->'systems')='array' and
 jsonb_typeof(payload->'orders')='array' and
 jsonb_typeof(payload->'items')='array' and
 jsonb_typeof(payload->'actions')='array' and
 payload ?& array['systems','orders','items','actions'] and
 octet_length(payload::text) < 20971520))
);
alter table public.pcm_teresina_members enable row level security;
alter table public.pcm_teresina_dataset enable row level security;
revoke all on public.pcm_teresina_members, public.pcm_teresina_dataset from anon, authenticated;
grant select on public.pcm_teresina_members, public.pcm_teresina_dataset to authenticated;
grant update (payload) on public.pcm_teresina_dataset to authenticated;
create policy pcm_member_self on public.pcm_teresina_members for select to authenticated
 using (user_id = (select auth.uid()));
create policy pcm_dataset_read on public.pcm_teresina_dataset for select to authenticated
 using (exists (select 1 from public.pcm_teresina_members m where m.user_id = (select auth.uid())));
create policy pcm_dataset_update on public.pcm_teresina_dataset for update to authenticated
 using (exists (select 1 from public.pcm_teresina_members m where m.user_id = (select auth.uid()) and m.role='admin'))
 with check (exists (select 1 from public.pcm_teresina_members m where m.user_id = (select auth.uid()) and m.role='admin'));
create function public.pcm_teresina_stamp() returns trigger language plpgsql security invoker
 set search_path = '' as $$
 begin
 new.revision := old.revision + 1;
 new.updated_at := now();
 new.updated_by := auth.uid();
 return new;
 end $$;
revoke all on function public.pcm_teresina_stamp() from public, anon, authenticated;
create trigger pcm_teresina_stamp before update on public.pcm_teresina_dataset
 for each row execute function public.pcm_teresina_stamp();
insert into public.pcm_teresina_dataset(id) values ('principal');
