-- Coachify invite debug helper
-- Replace assistant@example.com with the exact email the assistant used to sign in.

with params as (
  select lower(trim('assistant@example.com')) as assistant_email
)
select
  ti.id,
  ti.team_name,
  ti.invited_email,
  ti.status,
  ti.created_at,
  ti.updated_at,
  inviter.email as invited_by_email,
  accepter.email as accepted_by_email
from public.team_invites ti
cross join params p
left join auth.users inviter on inviter.id = ti.invited_by
left join auth.users accepter on accepter.id = ti.accepted_by
where ti.invited_email = p.assistant_email
order by ti.created_at desc;

-- If the invite was accepted, this confirms the assistant is now a team member.
with params as (
  select lower(trim('assistant@example.com')) as assistant_email
)
select
  t.name as team_name,
  u.email as coach_email,
  tm.role,
  tm.created_at
from public.team_members tm
join public.teams t on t.id = tm.team_id
join auth.users u on u.id = tm.user_id
cross join params p
where lower(u.email) = p.assistant_email
order by tm.created_at desc;

-- This shows the latest invites from any team, useful if the email was typed differently.
select
  team_name,
  invited_email,
  status,
  created_at,
  updated_at
from public.team_invites
order by created_at desc
limit 20;
