-- Emergency game-day restore for Redbirds roster if the cloud team row has an empty roster.
-- Run the SELECT first. Only run the UPDATE if Redbirds shows roster_count = 0.

select
  id,
  name,
  division_id,
  jsonb_array_length(coalesce(roster, '[]'::jsonb)) as roster_count,
  updated_at
from public.teams
where lower(trim(name)) = 'redbirds'
order by updated_at desc;

-- Restore the 10 Redbirds players only when the roster is currently empty.
update public.teams
set
  roster = '[
    {"id":"redbirds-alton","name":"Alton","jersey":"","skill":3,"preferredPositions":{"offense":[],"defense":[]},"cannotPlayPositions":{"offense":[],"defense":[]},"notes":""},
    {"id":"redbirds-bryson","name":"Bryson","jersey":"","skill":3,"preferredPositions":{"offense":[],"defense":[]},"cannotPlayPositions":{"offense":[],"defense":[]},"notes":""},
    {"id":"redbirds-greyson","name":"Greyson","jersey":"","skill":3,"preferredPositions":{"offense":[],"defense":[]},"cannotPlayPositions":{"offense":[],"defense":[]},"notes":""},
    {"id":"redbirds-jack","name":"Jack","jersey":"","skill":3,"preferredPositions":{"offense":[],"defense":[]},"cannotPlayPositions":{"offense":[],"defense":[]},"notes":""},
    {"id":"redbirds-jameson","name":"Jameson","jersey":"","skill":3,"preferredPositions":{"offense":[],"defense":[]},"cannotPlayPositions":{"offense":[],"defense":[]},"notes":""},
    {"id":"redbirds-luca-m","name":"Luca M.","jersey":"","skill":3,"preferredPositions":{"offense":[],"defense":[]},"cannotPlayPositions":{"offense":[],"defense":[]},"notes":""},
    {"id":"redbirds-luca-t","name":"Luca T.","jersey":"","skill":3,"preferredPositions":{"offense":[],"defense":[]},"cannotPlayPositions":{"offense":[],"defense":[]},"notes":""},
    {"id":"redbirds-markus","name":"Markus","jersey":"","skill":3,"preferredPositions":{"offense":[],"defense":[]},"cannotPlayPositions":{"offense":[],"defense":[]},"notes":""},
    {"id":"redbirds-max","name":"Max","jersey":"","skill":3,"preferredPositions":{"offense":[],"defense":[]},"cannotPlayPositions":{"offense":[],"defense":[]},"notes":""},
    {"id":"redbirds-messiah","name":"Messiah","jersey":"","skill":3,"preferredPositions":{"offense":[],"defense":[]},"cannotPlayPositions":{"offense":[],"defense":[]},"notes":""}
  ]'::jsonb,
  attendance = '[]'::jsonb,
  lineup_plan = null
where lower(trim(name)) = 'redbirds'
  and jsonb_array_length(coalesce(roster, '[]'::jsonb)) = 0;

-- Confirm Redbirds now has the expected roster.
select
  id,
  name,
  jsonb_array_length(coalesce(roster, '[]'::jsonb)) as roster_count,
  roster
from public.teams
where lower(trim(name)) = 'redbirds'
order by updated_at desc;
