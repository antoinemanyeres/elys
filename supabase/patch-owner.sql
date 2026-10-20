-- Owner role patch for an existing database (Supabase > SQL Editor).
-- STEP 1: run this whole block once.
alter type public.user_role add value if not exists 'owner';

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role()::text in ('setter', 'admin', 'owner'), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role()::text in ('admin', 'owner'), false)
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role()::text = 'owner', false)
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, role, lang, terms_accepted_at)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 30),
    case when lower(new.email) = 'antoine.manyeres@gmail.com' then 'owner' else 'climber' end::public.user_role,
    coalesce(nullif(new.raw_user_meta_data ->> 'lang', ''), 'en'),
    case when (new.raw_user_meta_data ->> 'terms') = 'true' then now() end
  );
  return new;
end $$;

create or replace function public.protect_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if 'owner' in (old.role::text, new.role::text) then
      raise exception 'The owner role cannot be changed from the app';
    elsif 'admin' in (old.role::text, new.role::text) and not public.is_owner() then
      raise exception 'Only the owner can grant or remove the admin role';
    elsif not public.is_admin() then
      raise exception 'Only administrators can change roles';
    end if;
  end if;
  return new;
end $$;

create or replace function public.set_role(p_user uuid, p_role public.user_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only administrators can change roles'; end if;
  update public.profiles set role = p_role where id = p_user;
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if public.is_owner() then raise exception 'The owner account cannot be deleted'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- STEP 2: then run this line on its own (a new enum value can only be used after step 1 is committed).
-- update public.profiles set role = 'owner' where id = (select id from auth.users where lower(email) = 'antoine.manyeres@gmail.com');
