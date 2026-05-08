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
