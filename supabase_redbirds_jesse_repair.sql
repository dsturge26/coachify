-- Coachify one-time Redbirds/Jesse access repair
-- Run this in Supabase SQL Editor if jessemoyer@gmail.com accepted the Redbirds invite
-- but still cannot see the Redbirds team.

with params as (
  select
    lower(trim('jessemoyer@gmail.com')) as assistant_email,
    lower(trim('Redbirds')) as team_name
),
target_team as (
  select t.id, t.name
  from public.teams t
  cross join params p
  where lower(trim(t.name)) = p.team_name
  order by t.updated_at desc
  limit 1
),
target_user as (
  select u.id, lower(trim(u.email)) as email
  from auth.users u
  cross join params p
  where lower(trim(u.email)) = p.assistant_email
  order by u.created_at desc
  limit 1
),
added_membership as (
  insert into public.team_members (team_id, user_id, role)
  select tt.id, tu.id, 'assistant'
  from target_team tt
  cross join target_user tu
  on conflict (team_id, user_id) do update set role = excluded.role
  returning team_id, user_id, role
),
updated_invites as (
  update public.team_invites ti
  set status = 'accepted',
      accepted_by = (select id from target_user),
      updated_at = now()
  where ti.team_id = (select id from target_team)
    and lower(trim(ti.invited_email)) = (select assistant_email from params)
    and ti.status in ('pending', 'accepted')
  returning ti.id, ti.team_name, ti.invited_email, ti.status
)
select
  (select name from target_team) as team_name,
  (select email from target_user) as assistant_email,
  exists(select 1 from added_membership) as assistant_access_granted,
  (select count(*) from updated_invites) as matching_invites_marked_accepted;

-- Verification: this should return one row for Redbirds / jessemoyer@gmail.com / assistant.
select
  t.name as team_name,
  lower(u.email) as coach_email,
  tm.role,
  tm.created_at
from public.team_members tm
join public.teams t on t.id = tm.team_id
join auth.users u on u.id = tm.user_id
where lower(trim(t.name)) = lower(trim('Redbirds'))
  and lower(trim(u.email)) = lower(trim('jessemoyer@gmail.com'));
