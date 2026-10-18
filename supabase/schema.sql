-- ELYS Boulderloft app: database schema, security rules (RLS) and helper functions.
-- Run this whole file once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- It is safe to re-run: objects are created only if missing, functions/policies are replaced.

-- ---------------------------------------------------------------------------
-- Profiles and roles
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('climber', 'setter', 'admin');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  role public.user_role not null default 'climber',
  lang text not null default 'en' check (lang in ('en', 'fr', 'de')),
  hide_from_ranking boolean not null default false,
  onboarded boolean not null default false,
  terms_accepted_at timestamptz,
  last_seen_new_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('setter', 'admin'), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- New account => profile. The bootstrap e-mail becomes the first administrator.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, role, lang, terms_accepted_at)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 30),
    case when lower(new.email) = 'antoine.manyeres@gmail.com' then 'admin' else 'climber' end,
    coalesce(nullif(new.raw_user_meta_data ->> 'lang', ''), 'en'),
    case when (new.raw_user_meta_data ->> 'terms') = 'true' then now() end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only administrators can change roles (also blocks self-promotion through the API).
create or replace function public.protect_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only administrators can change roles';
  end if;
  return new;
end $$;

drop trigger if exists protect_role on public.profiles;
create trigger protect_role before update on public.profiles
  for each row execute function public.protect_role();

alter table public.profiles enable row level security;
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Walls, boulders and climbing data
-- ---------------------------------------------------------------------------
create table if not exists public.wall_photos (
  id uuid primary key default gen_random_uuid(),
  sector_id text not null,
  part int not null default 1 check (part between 1 and 20),
  path text not null,
  w int not null,
  h int not null,
  retired boolean not null default false,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.boulders (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.wall_photos on delete cascade,
  sector_id text not null,
  color text not null check (color in ('green', 'blue', 'yellow', 'red', 'white', 'black', 'pink')),
  sub_grade int not null check (sub_grade between 1 and 5),
  tags text[] not null default '{}',
  holds jsonb not null,
  opened_at date not null default current_date,
  closes_at date,
  setter_id uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  check (closes_at is null or closes_at >= opened_at - 1)
);
create index if not exists boulders_sector_idx on public.boulders (sector_id);

create table if not exists public.sends (
  user_id uuid not null references public.profiles on delete cascade,
  boulder_id uuid not null references public.boulders on delete cascade,
  flash boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, boulder_id)
);
create index if not exists sends_boulder_idx on public.sends (boulder_id);

create table if not exists public.votes (
  user_id uuid not null references public.profiles on delete cascade,
  boulder_id uuid not null references public.boulders on delete cascade,
  sub_grade int not null check (sub_grade between 1 and 5),
  primary key (user_id, boulder_id)
);

create table if not exists public.likes (
  user_id uuid not null references public.profiles on delete cascade,
  boulder_id uuid not null references public.boulders on delete cascade,
  primary key (user_id, boulder_id)
);

create table if not exists public.projects (
  user_id uuid not null references public.profiles on delete cascade,
  boulder_id uuid not null references public.boulders on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, boulder_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  boulder_id uuid not null references public.boulders on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

-- Videos are links only (YouTube / Instagram), nothing is stored.
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  boulder_id uuid not null references public.boulders on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  url text not null check (url ~* '^https://([a-z0-9-]+\.)?(youtube\.com|youtu\.be|instagram\.com)/'),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('comment', 'video')),
  target_id uuid not null,
  reporter_id uuid references public.profiles on delete set null,
  reason text check (char_length(reason) <= 300),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete set null,
  type text not null check (type in ('idea', 'bug', 'other')),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on)
);

create table if not exists public.wall_plans (
  id uuid primary key default gen_random_uuid(),
  sector_id text not null,
  part int,
  planned_on date not null,
  setter_id uuid references public.profiles on delete set null,
  notes text check (char_length(notes) <= 300),
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.wall_photos enable row level security;
alter table public.boulders enable row level security;
alter table public.sends enable row level security;
alter table public.votes enable row level security;
alter table public.likes enable row level security;
alter table public.projects enable row level security;
alter table public.comments enable row level security;
alter table public.videos enable row level security;
alter table public.reports enable row level security;
alter table public.feedback enable row level security;
alter table public.seasons enable row level security;
alter table public.wall_plans enable row level security;

-- Staff-managed tables: everyone signed in can read, setters/admins can write.
do $$
declare t text;
begin
  foreach t in array array['wall_photos', 'boulders', 'seasons', 'wall_plans'] loop
    execute format('drop policy if exists "read" on public.%I', t);
    execute format('create policy "read" on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists "staff write" on public.%I', t);
    execute format('create policy "staff write" on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

-- Personal climbing data: readable by all (rankings, repeats), writable only by its owner.
do $$
declare t text;
begin
  foreach t in array array['sends', 'likes'] loop
    execute format('drop policy if exists "read" on public.%I', t);
    execute format('create policy "read" on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists "own write" on public.%I', t);
    execute format('create policy "own write" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

drop policy if exists "read" on public.votes;
create policy "read" on public.votes for select to authenticated using (true);
drop policy if exists "own write" on public.votes;
create policy "own write" on public.votes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.sends s where s.user_id = auth.uid() and s.boulder_id = votes.boulder_id));

drop policy if exists "own" on public.projects;
create policy "own" on public.projects for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Comments and videos: hidden ones are only visible to staff; authors and staff can delete.
do $$
declare t text;
begin
  foreach t in array array['comments', 'videos'] loop
    execute format('drop policy if exists "read" on public.%I', t);
    execute format('create policy "read" on public.%I for select to authenticated using (not hidden or public.is_staff() or user_id = auth.uid())', t);
    execute format('drop policy if exists "insert own" on public.%I', t);
    execute format('create policy "insert own" on public.%I for insert to authenticated with check (user_id = auth.uid() and not hidden)', t);
    execute format('drop policy if exists "staff moderate" on public.%I', t);
    execute format('create policy "staff moderate" on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t);
    execute format('drop policy if exists "delete" on public.%I', t);
    execute format('create policy "delete" on public.%I for delete to authenticated using (user_id = auth.uid() or public.is_staff())', t);
  end loop;
end $$;

drop policy if exists "report" on public.reports;
create policy "report" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists "staff read" on public.reports;
create policy "staff read" on public.reports for select to authenticated using (public.is_staff());
drop policy if exists "staff update" on public.reports;
create policy "staff update" on public.reports for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "send feedback" on public.feedback;
create policy "send feedback" on public.feedback for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "staff read" on public.feedback;
create policy "staff read" on public.feedback for select to authenticated using (public.is_staff() or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Points, statistics and rankings
-- ---------------------------------------------------------------------------
-- Same formula as the app: each color ~doubles, sub-grades grow toward the next color, flash +10%.
create or replace function public.points_for(p_color text, p_sub int, p_flash boolean) returns int
language sql immutable as $$
  with g as (
    select
      case p_color when 'green' then 25 when 'blue' then 50 when 'yellow' then 100 when 'red' then 200
                   when 'white' then 350 when 'black' then 600 else 1000 end::numeric as base,
      case p_color when 'green' then 50 when 'blue' then 100 when 'yellow' then 200 when 'red' then 350
                   when 'white' then 600 when 'black' then 1000 else 1700 end::numeric as nxt
  ), p as (
    select round(base * power(nxt / base, (p_sub - 1) / 5.0) / 5) * 5 as pts from g
  )
  select (case when p_flash then round(pts * 1.1 / 5) * 5 else pts end)::int from p
$$;

create or replace view public.boulder_stats with (security_invoker = true) as
select
  b.id as boulder_id,
  (select count(*) from public.sends s where s.boulder_id = b.id)::int as sends,
  (select count(*) from public.sends s where s.boulder_id = b.id and s.flash)::int as flashes,
  (select count(*) from public.likes l where l.boulder_id = b.id)::int as likes,
  (select count(*) from public.comments c where c.boulder_id = b.id and not c.hidden)::int as comments,
  array(select (select count(*) from public.votes v where v.boulder_id = b.id and v.sub_grade = n)::int
        from generate_series(1, 5) n) as vote_counts
from public.boulders b;

-- p_season null => boulders currently on the walls; otherwise every send made during the season.
create or replace function public.ranking(p_season uuid default null)
returns table (user_id uuid, name text, points int, sends int, flashes int, per_color int[])
language sql stable security definer set search_path = public as $$
  select p.id, p.name,
    sum(public.points_for(b.color, b.sub_grade, s.flash))::int,
    count(*)::int,
    count(*) filter (where s.flash)::int,
    array[
      count(*) filter (where b.color = 'green'), count(*) filter (where b.color = 'blue'),
      count(*) filter (where b.color = 'yellow'), count(*) filter (where b.color = 'red'),
      count(*) filter (where b.color = 'white'), count(*) filter (where b.color = 'black'),
      count(*) filter (where b.color = 'pink')
    ]::int[]
  from public.sends s
  join public.profiles p on p.id = s.user_id
  join public.boulders b on b.id = s.boulder_id
  left join public.seasons se on se.id = p_season
  where auth.uid() is not null
    and p.role = 'climber'
    and not p.hide_from_ranking
    and case
      when p_season is null then b.opened_at <= current_date and (b.closes_at is null or b.closes_at >= current_date)
      else s.created_at::date between se.starts_on and se.ends_on
    end
  group by p.id, p.name
  order by 3 desc
$$;

-- ---------------------------------------------------------------------------
-- Administration and personal data
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (id uuid, name text, email text, role public.user_role, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, u.email::text, p.role, p.created_at
  from public.profiles p join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.name
$$;

create or replace function public.set_role(p_user uuid, p_role public.user_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only administrators can change roles'; end if;
  if p_role <> 'admin' and (select role from public.profiles where id = p_user) = 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'The gym needs at least one administrator';
  end if;
  update public.profiles set role = p_role where id = p_user;
end $$;

-- Lets every user permanently delete their account and all their personal data.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if public.my_role() = 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'The gym needs at least one administrator';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

grant execute on function public.ranking(uuid) to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.set_role(uuid, public.user_role) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: public bucket for wall photos, upload restricted to staff
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('walls', 'walls', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "staff upload walls" on storage.objects;
create policy "staff upload walls" on storage.objects for insert to authenticated
  with check (bucket_id = 'walls' and public.is_staff());
drop policy if exists "staff delete walls" on storage.objects;
create policy "staff delete walls" on storage.objects for delete to authenticated
  using (bucket_id = 'walls' and public.is_staff());
