-- Run in Supabase SQL Editor (Dashboard → SQL) after creating a project.
-- Requires Storage bucket "captures" — see 0002_storage.sql or create in UI (public read).

create type feed_visibility as enum ('general', 'company');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.company_members (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table public.commutes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  commute_id uuid references public.commutes (id) on delete set null,
  camera_id text not null,
  label text not null,
  storage_path text not null,
  captured_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  capture_id uuid not null references public.captures (id) on delete cascade,
  visibility feed_visibility not null default 'general',
  company_id uuid references public.companies (id) on delete cascade,
  entry_at timestamptz,
  exit_at timestamptz,
  published_at timestamptz not null default now(),
  score int not null default 0,
  constraint feed_posts_company_ck check (
    (visibility = 'general' and company_id is null)
    or (visibility = 'company' and company_id is not null)
  ),
  constraint feed_posts_one_per_capture unique (capture_id)
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create or replace function public.refresh_post_score(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.feed_posts fp
  set score = coalesce((
    select sum(v.value)::int from public.votes v where v.post_id = p_post_id
  ), 0)
  where fp.id = p_post_id;
end;
$$;

create or replace function public.trg_votes_refresh_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
begin
  pid := coalesce(new.post_id, old.post_id);
  perform public.refresh_post_score(pid);
  return coalesce(new, old);
end;
$$;

create trigger votes_refresh_score
after insert or update or delete on public.votes
for each row execute function public.trg_votes_refresh_score();

-- Profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.commutes enable row level security;
alter table public.captures enable row level security;
alter table public.feed_posts enable row level security;
alter table public.votes enable row level security;

create policy profiles_select_all on public.profiles
for select to authenticated using (true);

create policy profiles_insert_self on public.profiles
for insert to authenticated with check (auth.uid() = id);

create policy profiles_update_self on public.profiles
for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy companies_read on public.companies
for select to authenticated using (true);

create policy companies_insert on public.companies
for insert to authenticated with check (auth.uid() = created_by);

create policy company_members_read on public.company_members
for select to authenticated using (
  exists (
    select 1 from public.company_members m
    where m.company_id = company_members.company_id and m.user_id = auth.uid()
  )
);

create policy company_members_insert_self on public.company_members
for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from public.companies c where c.id = company_members.company_id)
);

create policy commutes_rw_self on public.commutes
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy captures_select on public.captures
for select to authenticated using (
  auth.uid() = user_id
  or exists (select 1 from public.feed_posts fp where fp.capture_id = captures.id)
);

create policy captures_insert on public.captures
for insert to authenticated with check (auth.uid() = user_id);

create policy captures_update on public.captures
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy captures_delete on public.captures
for delete to authenticated using (auth.uid() = user_id);

create policy feed_posts_read on public.feed_posts
for select to authenticated using (
  visibility = 'general'
  or (
    visibility = 'company'
    and exists (
      select 1 from public.company_members cm
      where cm.company_id = feed_posts.company_id and cm.user_id = auth.uid()
    )
  )
);

create policy feed_posts_insert_self on public.feed_posts
for insert to authenticated with check (
  auth.uid() = user_id
  and (
    visibility = 'general'
    or (
      visibility = 'company'
      and company_id is not null
      and exists (
        select 1 from public.company_members cm
        where cm.company_id = feed_posts.company_id and cm.user_id = auth.uid()
      )
    )
  )
);

create policy votes_read_own on public.votes
for select to authenticated using (auth.uid() = user_id);

create policy votes_insert_self on public.votes
for insert to authenticated with check (auth.uid() = user_id);
