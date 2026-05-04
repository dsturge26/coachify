create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  division_id text not null,
  division_settings jsonb not null default '{}'::jsonb,
  roster jsonb not null default '[]'::jsonb,
  touch_tracker jsonb not null default '{"counts":{},"history":[]}'::jsonb,
  attendance jsonb not null default '[]'::jsonb,
  lineup_plan jsonb,
  practice_plans jsonb not null default '[]'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.teams
add column if not exists division_settings jsonb not null default '{}'::jsonb;

alter table public.teams
add column if not exists practice_plans jsonb not null default '[]'::jsonb;

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('head', 'assistant')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists teams_updated_at on public.teams;
create trigger teams_updated_at
before update on public.teams
for each row execute function public.touch_updated_at();

create or replace function public.add_team_creator_as_head()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.team_members (team_id, user_id, role)
  values (new.id, new.created_by, 'head')
  on conflict (team_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists team_creator_membership on public.teams;
create trigger team_creator_membership
after insert on public.teams
for each row execute function public.add_team_creator_as_head();

create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_team_head(p_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team_id
      and user_id = auth.uid()
      and role = 'head'
  );
$$;

create or replace function public.create_team_as_head(
  p_name text,
  p_division_id text,
  p_roster jsonb default '[]'::jsonb,
  p_touch_tracker jsonb default '{"counts":{},"history":[]}'::jsonb,
  p_attendance jsonb default '[]'::jsonb,
  p_lineup_plan jsonb default null
)
returns uuid
language sql
security definer
set search_path = public
as '
  with inserted_team as (
    insert into public.teams (
      name,
      division_id,
      roster,
      touch_tracker,
      attendance,
      lineup_plan,
      created_by
    )
    values (
      p_name,
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

grant execute on function public.create_team_as_head(text, text, jsonb, jsonb, jsonb, jsonb) to authenticated;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

drop policy if exists "members can read teams" on public.teams;
create policy "members can read teams"
on public.teams
for select
to authenticated
using (
  public.is_team_member(teams.id)
);

drop policy if exists "authenticated can create teams" on public.teams;
create policy "authenticated can create teams"
on public.teams
for insert
to authenticated
with check (
  auth.uid() is not null
  and created_by = auth.uid()
);

drop policy if exists "members can update shared game data" on public.teams;
create policy "members can update shared game data"
on public.teams
for update
to authenticated
using (
  public.is_team_member(teams.id)
)
with check (
  public.is_team_member(teams.id)
);

drop policy if exists "heads can delete teams" on public.teams;
create policy "heads can delete teams"
on public.teams
for delete
to authenticated
using (
  public.is_team_head(teams.id)
);

drop policy if exists "members can read memberships" on public.team_members;
create policy "members can read memberships"
on public.team_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_team_member(team_members.team_id)
);

drop policy if exists "users can join teams as assistant" on public.team_members;
create policy "users can join teams as assistant"
on public.team_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  and role = 'assistant'
);

drop policy if exists "heads can manage memberships" on public.team_members;
create policy "heads can manage memberships"
on public.team_members
for update
to authenticated
using (
  public.is_team_head(team_members.team_id)
)
with check (
  public.is_team_head(team_members.team_id)
);

alter publication supabase_realtime add table public.teams;
