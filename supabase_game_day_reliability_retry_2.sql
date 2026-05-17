create or replace function public.set_team_game_notes(
  p_team_id uuid,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $set_team_game_notes$
declare
  tracker jsonb;
begin
  if not public.is_team_member(p_team_id) then
    raise exception 'You do not have access to this team.';
  end if;

  select coalesce(touch_tracker, '{"counts":{},"history":[]}'::jsonb)
  into tracker
  from public.teams
  where id = p_team_id
  for update;

  if tracker is null then
    raise exception 'Team not found.';
  end if;

  tracker = jsonb_set(tracker, '{gameNotes}', to_jsonb(coalesce(p_notes, '')), true);

  update public.teams
  set touch_tracker = tracker
  where id = p_team_id
  returning touch_tracker into tracker;

  return tracker;
end;
$set_team_game_notes$;

create or replace function public.set_team_live_game(
  p_team_id uuid,
  p_live_game jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $set_team_live_game$
declare
  tracker jsonb;
begin
  if not public.is_team_head(p_team_id) then
    raise exception 'Only the head coach can control the live game.';
  end if;

  select coalesce(touch_tracker, '{"counts":{},"history":[]}'::jsonb)
  into tracker
  from public.teams
  where id = p_team_id
  for update;

  if tracker is null then
    raise exception 'Team not found.';
  end if;

  tracker = jsonb_set(tracker, '{liveGame}', coalesce(p_live_game, 'null'::jsonb), true);

  update public.teams
  set touch_tracker = tracker
  where id = p_team_id
  returning touch_tracker into tracker;

  return tracker;
end;
$set_team_live_game$;
