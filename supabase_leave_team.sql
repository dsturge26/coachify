-- Coachify assistant leave-team helper
-- Run this once in Supabase SQL Editor.

create or replace function public.leave_team_as_assistant(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as '
declare
  current_role text;
  current_email text;
begin
  select role
  into current_role
  from public.team_members
  where team_id = p_team_id
    and user_id = auth.uid();

  if current_role is null then
    raise exception ''You do not currently have access to this team.'';
  end if;

  if current_role <> ''assistant'' then
    raise exception ''Head coaches cannot leave a team here. Delete the team or remove assistants instead.'';
  end if;

  select lower(email)
  into current_email
  from auth.users
  where id = auth.uid();

  delete from public.team_members
  where team_id = p_team_id
    and user_id = auth.uid()
    and role = ''assistant'';

  update public.team_invites
  set status = ''revoked'',
      updated_at = now()
  where team_id = p_team_id
    and invited_email = current_email
    and status in (''pending'', ''accepted'');
end;
';

grant execute on function public.leave_team_as_assistant(uuid) to authenticated;
