alter table public.teams
add column if not exists practice_plans jsonb not null default '[]'::jsonb;

create or replace function public.assistant_game_fields_unchanged()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_team_head(old.id) then
    return new;
  end if;

  if new.name is distinct from old.name
    or new.division_id is distinct from old.division_id
    or new.division_settings is distinct from old.division_settings
    or new.roster is distinct from old.roster
    or new.lineup_plan is distinct from old.lineup_plan
    or new.practice_plans is distinct from old.practice_plans
    or new.created_by is distinct from old.created_by
  then
    raise exception 'assistant coaches can only update attendance and touch tracking';
  end if;

  return new;
end;
$$;
