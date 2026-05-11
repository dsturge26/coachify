-- Coachify emergency assistant access helper
-- Replace assistant@example.com with the assistant's exact login email.
-- This grants assistant access for any pending invite sent to that email.

with params as (
  select lower(trim('assistant@example.com')) as assistant_email
),
matching_invites as (
  select ti.*
  from public.team_invites ti
  cross join params p
  where ti.invited_email = p.assistant_email
    and ti.status = 'pending'
),
matching_user as (
  select u.id, lower(u.email) as email
  from auth.users u
  cross join params p
  where lower(u.email) = p.assistant_email
),
added_membership as (
  insert into public.team_members (team_id, user_id, role)
  select mi.team_id, mu.id, 'assistant'
  from matching_invites mi
  cross join matching_user mu
  on conflict (team_id, user_id) do update set role = excluded.role
  returning team_id, user_id
)
update public.team_invites ti
set status = 'accepted',
    accepted_by = am.user_id,
    updated_at = now()
from added_membership am
where ti.team_id = am.team_id
  and ti.invited_email = (select assistant_email from params)
returning ti.team_name, ti.invited_email, ti.status;
