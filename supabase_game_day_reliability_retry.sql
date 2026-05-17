create or replace function public.undo_team_touch(
  p_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $undo_team_touch$
declare
  tracker jsonb;
  history jsonb;
  last_touch jsonb;
  player_id text;
  current_count integer;
  history_length integer;
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

  history = coalesce(tracker->'history', '[]'::jsonb);
  history_length = jsonb_array_length(history);

  if history_length = 0 then
    return tracker;
  end if;

  last_touch = history -> (history_length - 1);
  player_id = last_touch->>'playerId';
  current_count = greatest(coalesce((tracker #>> array['counts', player_id])::integer, 0) - 1, 0);

  tracker = jsonb_set(tracker, array['counts', player_id], to_jsonb(current_count), true);
  tracker = jsonb_set(tracker, '{history}', history - (history_length - 1), true);

  update public.teams
  set touch_tracker = tracker
  where id = p_team_id
  returning touch_tracker into tracker;

  return tracker;
end;
$undo_team_touch$;

create or replace function public.reset_team_touches(
  p_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $reset_team_touches$
declare
  tracker jsonb;
begin
  if not public.is_team_head(p_team_id) then
    raise exception 'Only the head coach can reset touches.';
  end if;

  select coalesce(touch_tracker, '{"counts":{},"history":[]}'::jsonb)
  into tracker
  from public.teams
  where id = p_team_id
  for update;

  if tracker is null then
    raise exception 'Team not found.';
  end if;

  tracker = jsonb_set(tracker, '{counts}', '{}'::jsonb, true);
  tracker = jsonb_set(tracker, '{history}', '[]'::jsonb, true);

  update public.teams
  set touch_tracker = tracker
  where id = p_team_id
  returning touch_tracker into tracker;

  return tracker;
end;
$reset_team_touches$;

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
