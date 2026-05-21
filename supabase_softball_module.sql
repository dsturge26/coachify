-- ============================================================================
-- Softball module - schema additions
-- Mirrors patterns from supabase_setup.sql. Safe to re-run.
-- ============================================================================

-- ---- 1. teams.sport column -------------------------------------------------
alter table public.teams
  add column if not exists sport text not null default 'flag_football';

update public.teams set sport = 'flag_football' where sport is null;

alter table public.teams
  drop constraint if exists teams_sport_check;
alter table public.teams
  add constraint teams_sport_check
  check (sport in ('flag_football', 'softball'));


-- ---- 2. Update assistant-restriction trigger fn to cover sport -------------
-- Originally defined in supabase_division_settings.sql; extend to block
-- assistants from changing sport on a team.
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
    or new.sport is distinct from old.sport
    or new.roster is distinct from old.roster
    or new.lineup_plan is distinct from old.lineup_plan
    or new.created_by is distinct from old.created_by
  then
    raise exception 'assistant coaches can only update attendance and touch tracking';
  end if;

  return new;
end;
$$;


-- ---- 3. softball_games -----------------------------------------------------
create table if not exists public.softball_games (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams(id) on delete cascade,
  game_date         date not null,
  division          text not null check (division in ('7U','8U','10U','12U','15U')),
  opponent          text,
  status            text not null default 'pregame' check (status in ('pregame','live','recap')),
  active_inning     int  not null default 1 check (active_inning >= 1),
  batting_position  int  not null default 1 check (batting_position >= 1),
  created_by        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists softball_games_team_id_idx     on public.softball_games (team_id);
create index if not exists softball_games_team_date_idx   on public.softball_games (team_id, game_date desc);
create index if not exists softball_games_team_status_idx on public.softball_games (team_id, status);

drop trigger if exists softball_games_updated_at on public.softball_games;
create trigger softball_games_updated_at
  before update on public.softball_games
  for each row execute function public.touch_updated_at();


-- ---- 4. softball_game_attendance -------------------------------------------
create table if not exists public.softball_game_attendance (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references public.softball_games(id) on delete cascade,
  player_id       text not null,
  arrived_late    boolean not null default false,
  did_not_show    boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (game_id, player_id)
);

create index if not exists softball_game_attendance_game_idx on public.softball_game_attendance (game_id);


-- ---- 5. softball_game_lineups (per-inning fielding assignments) ------------
create table if not exists public.softball_game_lineups (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.softball_games(id) on delete cascade,
  inning      int  not null check (inning >= 1),
  player_id   text not null,
  position    text not null check (position in ('P','C','1B','2B','3B','SS','LF','CF','RF','rover','bench')),
  created_at  timestamptz not null default now(),
  unique (game_id, inning, position)
);

create index if not exists softball_game_lineups_game_idx         on public.softball_game_lineups (game_id);
create index if not exists softball_game_lineups_game_inning_idx  on public.softball_game_lineups (game_id, inning);
create index if not exists softball_game_lineups_game_player_idx  on public.softball_game_lineups (game_id, player_id);


-- ---- 6. softball_batting_orders --------------------------------------------
create table if not exists public.softball_batting_orders (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references public.softball_games(id) on delete cascade,
  batting_slot    int  not null check (batting_slot >= 1),
  player_id       text not null,
  is_late_arrival boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (game_id, batting_slot),
  unique (game_id, player_id)
);

create index if not exists softball_batting_orders_game_idx on public.softball_batting_orders (game_id);


-- ---- 7. softball_pitch_logs (one row per inning pitched) -------------------
create table if not exists public.softball_pitch_logs (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.softball_games(id) on delete cascade,
  player_id   text not null,
  inning      int  not null check (inning >= 1),
  created_at  timestamptz not null default now(),
  unique (game_id, player_id, inning)
);

create index if not exists softball_pitch_logs_game_idx        on public.softball_pitch_logs (game_id);
create index if not exists softball_pitch_logs_game_player_idx on public.softball_pitch_logs (game_id, player_id);


-- ---- 8. softball_season_stats (denormalized fairness aggregate) ------------
create table if not exists public.softball_season_stats (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams(id) on delete cascade,
  player_id         text not null,
  season_year       int  not null,
  position          text not null check (position in ('P','C','1B','2B','3B','SS','LF','CF','RF','rover','bench')),
  innings_count     int  not null default 0 check (innings_count >= 0),
  games_count       int  not null default 0 check (games_count >= 0),
  last_played_date  date,
  updated_at        timestamptz not null default now(),
  unique (team_id, player_id, season_year, position)
);

create index if not exists softball_season_stats_team_idx        on public.softball_season_stats (team_id);
create index if not exists softball_season_stats_team_season_idx on public.softball_season_stats (team_id, season_year);
create index if not exists softball_season_stats_lookup_idx      on public.softball_season_stats (team_id, season_year, player_id);

drop trigger if exists softball_season_stats_updated_at on public.softball_season_stats;
create trigger softball_season_stats_updated_at
  before update on public.softball_season_stats
  for each row execute function public.touch_updated_at();


-- ============================================================================
-- RLS - mirrors teams pattern: members read, head coach writes.
-- Child tables resolve team_id via softball_game_team_id() helper.
-- ============================================================================

create or replace function public.softball_game_team_id(p_game_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from public.softball_games where id = p_game_id;
$$;

grant execute on function public.softball_game_team_id(uuid) to authenticated;


alter table public.softball_games            enable row level security;
alter table public.softball_game_attendance  enable row level security;
alter table public.softball_game_lineups     enable row level security;
alter table public.softball_batting_orders   enable row level security;
alter table public.softball_pitch_logs       enable row level security;
alter table public.softball_season_stats     enable row level security;


-- ---- softball_games --------------------------------------------------------
drop policy if exists "members can read softball games"   on public.softball_games;
drop policy if exists "heads can insert softball games"   on public.softball_games;
drop policy if exists "heads can update softball games"   on public.softball_games;
drop policy if exists "heads can delete softball games"   on public.softball_games;

create policy "members can read softball games"
on public.softball_games for select to authenticated
using (public.is_team_member(team_id));

create policy "heads can insert softball games"
on public.softball_games for insert to authenticated
with check (public.is_team_head(team_id) and created_by = auth.uid());

create policy "heads can update softball games"
on public.softball_games for update to authenticated
using (public.is_team_head(team_id))
with check (public.is_team_head(team_id));

create policy "heads can delete softball games"
on public.softball_games for delete to authenticated
using (public.is_team_head(team_id));


-- ---- softball_game_attendance ---------------------------------------------
drop policy if exists "members can read softball attendance" on public.softball_game_attendance;
drop policy if exists "heads can write softball attendance"  on public.softball_game_attendance;

create policy "members can read softball attendance"
on public.softball_game_attendance for select to authenticated
using (public.is_team_member(public.softball_game_team_id(game_id)));

create policy "heads can write softball attendance"
on public.softball_game_attendance for all to authenticated
using (public.is_team_head(public.softball_game_team_id(game_id)))
with check (public.is_team_head(public.softball_game_team_id(game_id)));


-- ---- softball_game_lineups -------------------------------------------------
drop policy if exists "members can read softball lineups" on public.softball_game_lineups;
drop policy if exists "heads can write softball lineups"  on public.softball_game_lineups;

create policy "members can read softball lineups"
on public.softball_game_lineups for select to authenticated
using (public.is_team_member(public.softball_game_team_id(game_id)));

create policy "heads can write softball lineups"
on public.softball_game_lineups for all to authenticated
using (public.is_team_head(public.softball_game_team_id(game_id)))
with check (public.is_team_head(public.softball_game_team_id(game_id)));


-- ---- softball_batting_orders -----------------------------------------------
drop policy if exists "members can read softball batting" on public.softball_batting_orders;
drop policy if exists "heads can write softball batting"  on public.softball_batting_orders;

create policy "members can read softball batting"
on public.softball_batting_orders for select to authenticated
using (public.is_team_member(public.softball_game_team_id(game_id)));

create policy "heads can write softball batting"
on public.softball_batting_orders for all to authenticated
using (public.is_team_head(public.softball_game_team_id(game_id)))
with check (public.is_team_head(public.softball_game_team_id(game_id)));


-- ---- softball_pitch_logs ---------------------------------------------------
drop policy if exists "members can read softball pitch logs" on public.softball_pitch_logs;
drop policy if exists "heads can write softball pitch logs"  on public.softball_pitch_logs;

create policy "members can read softball pitch logs"
on public.softball_pitch_logs for select to authenticated
using (public.is_team_member(public.softball_game_team_id(game_id)));

create policy "heads can write softball pitch logs"
on public.softball_pitch_logs for all to authenticated
using (public.is_team_head(public.softball_game_team_id(game_id)))
with check (public.is_team_head(public.softball_game_team_id(game_id)));


-- ---- softball_season_stats -------------------------------------------------
drop policy if exists "members can read softball season stats" on public.softball_season_stats;
drop policy if exists "heads can write softball season stats"  on public.softball_season_stats;

create policy "members can read softball season stats"
on public.softball_season_stats for select to authenticated
using (public.is_team_member(team_id));

create policy "heads can write softball season stats"
on public.softball_season_stats for all to authenticated
using (public.is_team_head(team_id))
with check (public.is_team_head(team_id));


-- ============================================================================
-- Realtime - add softball tables to the publication for live sync.
-- Wrapped to tolerate already-added tables on re-runs.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'softball_games',
    'softball_game_attendance',
    'softball_game_lineups',
    'softball_batting_orders',
    'softball_pitch_logs',
    'softball_season_stats'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;


-- ============================================================================
-- Extend create_team_as_head to take p_sport so softball teams are created
-- with the correct sport on the initial insert (no follow-up UPDATE needed).
-- ============================================================================

drop function if exists public.create_team_as_head(text, text, jsonb, jsonb, jsonb, jsonb);

create or replace function public.create_team_as_head(
  p_name text,
  p_division_id text,
  p_roster jsonb default '[]'::jsonb,
  p_touch_tracker jsonb default '{"counts":{},"history":[]}'::jsonb,
  p_attendance jsonb default '[]'::jsonb,
  p_lineup_plan jsonb default null,
  p_sport text default 'flag_football'
)
returns uuid
language sql
security definer
set search_path = public
as '
  with inserted_team as (
    insert into public.teams (
      name,
      sport,
      division_id,
      roster,
      touch_tracker,
      attendance,
      lineup_plan,
      created_by
    )
    values (
      p_name,
      coalesce(p_sport, ''flag_football''),
      p_division_id,
      coalesce(p_roster, ''[]''::jsonb),
      coalesce(p_touch_tracker, ''{"counts":{},"history":[]}''::jsonb),
      coalesce(p_attendance, ''[]''::jsonb),
      p_lineup_plan,
      auth.uid()
    )
    returning id
  ),
  inserted_member as (
    insert into public.team_members (team_id, user_id, role)
    select id, auth.uid(), ''head'' from inserted_team
    on conflict (team_id, user_id) do update set role = ''head''
    returning team_id
  )
  select id from inserted_team;
';

grant execute on function public.create_team_as_head(text, text, jsonb, jsonb, jsonb, jsonb, text) to authenticated;
