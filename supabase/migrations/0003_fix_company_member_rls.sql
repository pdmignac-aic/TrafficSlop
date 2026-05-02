-- Fix recursive RLS policies involving company_members.
-- Run this in Supabase SQL Editor if you already ran 0001_schema.sql.

create or replace function public.is_company_member(p_company_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = p_user_id
  );
$$;

drop policy if exists company_members_read on public.company_members;
drop policy if exists feed_posts_read on public.feed_posts;
drop policy if exists feed_posts_insert_self on public.feed_posts;
drop policy if exists captures_select on public.captures;

create policy company_members_read on public.company_members
for select to authenticated using (
  user_id = auth.uid()
  or public.is_company_member(company_id)
);

create policy captures_select on public.captures
for select to authenticated using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.feed_posts fp
    where fp.capture_id = captures.id
      and (
        fp.visibility = 'general'
        or (fp.company_id is not null and public.is_company_member(fp.company_id))
      )
  )
);

create policy feed_posts_read on public.feed_posts
for select to authenticated using (
  visibility = 'general'
  or (company_id is not null and public.is_company_member(company_id))
);

create policy feed_posts_insert_self on public.feed_posts
for insert to authenticated with check (
  auth.uid() = user_id
  and (
    visibility = 'general'
    or (company_id is not null and public.is_company_member(company_id))
  )
);
