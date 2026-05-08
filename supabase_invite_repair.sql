-- Coachify invite reliability repair
-- Run this once in Supabase SQL Editor.
-- It makes invite lookup use the signed-in user's Supabase Auth email directly,
-- instead of depending only on the email value inside the browser JWT.

create or replace function public.current_auth_email()
returns text
language sql
security definer
set search_path = public
as $$
  select lower(trim(email))
  from auth.users
  where id = auth.uid()
$$;

grant execute on function public.current_auth_email() to authenticated;

create or replace function public.get_my_pending_team_invites()
returns table (
  id uuid,
  team_id uuid,
  team_name text,
  invited_email text,
  role text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    ti.id,
    ti.team_id,
    ti.team_name,
    ti.invited_email,
    ti.role,
    ti.created_at
  from public.team_invites ti
  where ti.status = 'pending'
    and ti.invited_email = public.current_auth_email()
  order by ti.created_at desc
$$;

grant execute on function public.get_my_pending_team_invites() to authenticated;

create or replace function public.list_team_invites_for_head(p_team_id uuid)
returns table (
  id uuid,
  team_id uuid,
  team_name text,
  invited_email text,
  role text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    ti.id,
    ti.team_id,
    ti.team_name,
    ti.invited_email,
    ti.role,
    ti.status,
    ti.created_at,
    ti.updated_at
  from public.team_invites ti
  where ti.team_id = p_team_id
    and public.is_team_head(p_team_id)
  order by ti.created_at desc
$$;

grant execute on function public.list_team_invites_for_head(uuid) to authenticated;

create or replace function public.accept_team_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.team_invites%rowtype;
  current_email text;
begin
  current_email := public.current_auth_email();

  select *
  into invite_row
  from public.team_invites
  where id = p_invite_id
    and status = 'pending'
    and invited_email = current_email;

  if invite_row.id is null then
    raise exception 'No pending invite found for this signed-in email.';
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (invite_row.team_id, auth.uid(), invite_row.role)
  on conflict (team_id, user_id) do update set role = excluded.role;

  update public.team_invites
  set status = 'accepted',
      accepted_by = auth.uid(),
      updated_at = now()
  where id = invite_row.id;

  return invite_row.team_id;
end;
$$;

grant execute on function public.accept_team_invite(uuid) to authenticated;

drop policy if exists "invitees and heads can read invites" on public.team_invites;
create policy "invitees and heads can read invites"
on public.team_invites
for select
to authenticated
using (
  public.is_team_head(team_id)
  or invited_email = public.current_auth_email()
);

create or replace function public.list_team_access_for_head(p_team_id uuid)
returns table (
  access_type text,
  invite_id uuid,
  user_id uuid,
  email text,
  role text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select *
  from (
    select
      'member'::text as access_type,
      null::uuid as invite_id,
      tm.user_id,
      lower(u.email)::text as email,
      tm.role,
      'active'::text as status,
      tm.created_at,
      tm.created_at as updated_at
    from public.team_members tm
    join auth.users u on u.id = tm.user_id
    where tm.team_id = p_team_id
      and public.is_team_head(p_team_id)

    union all

    select
      'invite'::text as access_type,
      ti.id as invite_id,
      null::uuid as user_id,
      ti.invited_email as email,
      ti.role,
      ti.status,
      ti.created_at,
      ti.updated_at
    from public.team_invites ti
    where ti.team_id = p_team_id
      and ti.status = 'pending'
      and public.is_team_head(p_team_id)
      and not exists (
        select 1
        from public.team_members tm
        join auth.users u on u.id = tm.user_id
        where tm.team_id = ti.team_id
          and lower(u.email) = ti.invited_email
      )
  ) access_rows
  order by
    case when role = 'head' then 0 when access_type = 'member' then 1 else 2 end,
    email
$$;

grant execute on function public.list_team_access_for_head(uuid) to authenticated;

create or replace function public.revoke_team_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_team_id uuid;
begin
  select team_id
  into invite_team_id
  from public.team_invites
  where id = p_invite_id;

  if invite_team_id is null or not public.is_team_head(invite_team_id) then
    raise exception 'Only the head coach can cancel this invite.';
  end if;

  update public.team_invites
  set status = 'revoked',
      updated_at = now()
  where id = p_invite_id
    and status = 'pending';
end;
$$;

grant execute on function public.revoke_team_invite(uuid) to authenticated;

create or replace function public.remove_team_assistant(p_team_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
  target_email text;
begin
  if not public.is_team_head(p_team_id) then
    raise exception 'Only the head coach can remove assistant access.';
  end if;

  select tm.role, lower(u.email)
  into target_role, target_email
  from public.team_members tm
  join auth.users u on u.id = tm.user_id
  where tm.team_id = p_team_id
    and tm.user_id = p_user_id;

  if target_role is null then
    raise exception 'Coach access was not found.';
  end if;

  if target_role <> 'assistant' then
    raise exception 'Head coach access cannot be removed here.';
  end if;

  delete from public.team_members
  where team_id = p_team_id
    and user_id = p_user_id
    and role = 'assistant';

  update public.team_invites
  set status = 'revoked',
      updated_at = now()
  where team_id = p_team_id
    and invited_email = target_email
    and status in ('pending', 'accepted');
end;
$$;

grant execute on function public.remove_team_assistant(uuid, uuid) to authenticated;
