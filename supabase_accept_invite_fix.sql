-- Coachify accept-invite fix
-- Run this entire file in Supabase SQL Editor.
-- It intentionally avoids dollar-quoted $$ function bodies because the Supabase editor
-- can fail if only part of a long function body is selected.

create or replace function public.current_auth_email()
returns text
language sql
security definer
set search_path = public
as 'select lower(trim(email)) from auth.users where id = auth.uid()';

grant execute on function public.current_auth_email() to authenticated;

create or replace function public.accept_team_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as '
declare
  invite_row public.team_invites%rowtype;
  current_email text;
begin
  current_email := lower(trim(coalesce(public.current_auth_email(), auth.jwt() ->> ''email'', '''')));

  select *
  into invite_row
  from public.team_invites
  where id = p_invite_id
    and status in (''pending'', ''accepted'')
    and lower(trim(invited_email)) = current_email;

  if invite_row.id is null then
    raise exception ''No pending invite found for this signed-in email. Make sure the invite was sent to the same email used to sign in.'';
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (invite_row.team_id, auth.uid(), invite_row.role)
  on conflict (team_id, user_id) do update set role = excluded.role;

  update public.team_invites
  set status = ''accepted'',
      accepted_by = auth.uid(),
      updated_at = now()
  where id = invite_row.id;

  return invite_row.team_id;
end;
';

grant execute on function public.accept_team_invite(uuid) to authenticated;

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
as '
  select
    ti.id,
    ti.team_id,
    ti.team_name,
    ti.invited_email,
    ti.role,
    ti.created_at
  from public.team_invites ti
  where ti.status = ''pending''
    and lower(trim(ti.invited_email)) = lower(trim(coalesce(public.current_auth_email(), auth.jwt() ->> ''email'', '''')))
  order by ti.created_at desc
';

grant execute on function public.get_my_pending_team_invites() to authenticated;

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
as '
  select *
  from (
    select
      ''member''::text as access_type,
      null::uuid as invite_id,
      tm.user_id,
      lower(trim(u.email))::text as email,
      tm.role,
      ''active''::text as status,
      tm.created_at,
      tm.created_at as updated_at
    from public.team_members tm
    join auth.users u on u.id = tm.user_id
    where tm.team_id = p_team_id
      and public.is_team_head(p_team_id)

    union all

    select
      ''invite''::text as access_type,
      ti.id as invite_id,
      null::uuid as user_id,
      lower(trim(ti.invited_email))::text as email,
      ti.role,
      ti.status,
      ti.created_at,
      ti.updated_at
    from public.team_invites ti
    where ti.team_id = p_team_id
      and public.is_team_head(p_team_id)
      and ti.status in (''pending'', ''accepted'')
      and not exists (
        select 1
        from public.team_members tm
        join auth.users u on u.id = tm.user_id
        where tm.team_id = ti.team_id
          and lower(trim(u.email)) = lower(trim(ti.invited_email))
      )
  ) access_rows
  order by
    case when role = ''head'' then 0 when access_type = ''member'' then 1 else 2 end,
    email
';

grant execute on function public.list_team_access_for_head(uuid) to authenticated;

create or replace function public.repair_team_invite_access_for_head(p_team_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as '
declare
  normalized_email text;
  target_user_id uuid;
  invite_role text;
begin
  normalized_email := lower(trim(coalesce(p_email, '''')));

  if normalized_email = '''' then
    raise exception ''Enter the assistant coach email first.'';
  end if;

  if not public.is_team_head(p_team_id) then
    raise exception ''Only the head coach can reconnect assistant access.'';
  end if;

  select role
  into invite_role
  from public.team_invites
  where team_id = p_team_id
    and lower(trim(invited_email)) = normalized_email
    and status in (''pending'', ''accepted'')
  order by updated_at desc, created_at desc
  limit 1;

  if invite_role is null then
    raise exception ''No active invite found for this email. Send a new invite first.'';
  end if;

  select id
  into target_user_id
  from auth.users
  where lower(trim(email)) = normalized_email
  order by created_at desc
  limit 1;

  if target_user_id is null then
    raise exception ''No Coachify account was found for this email. Ask the assistant to create/sign in first.'';
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (p_team_id, target_user_id, ''assistant'')
  on conflict (team_id, user_id) do update set role = excluded.role;

  update public.team_invites
  set status = ''accepted'',
      accepted_by = target_user_id,
      updated_at = now()
  where team_id = p_team_id
    and lower(trim(invited_email)) = normalized_email
    and status in (''pending'', ''accepted'');

  return target_user_id;
end;
';

grant execute on function public.repair_team_invite_access_for_head(uuid, text) to authenticated;
