-- Coachify practice-plan sharing
-- Run this entire file once in Supabase SQL Editor.
-- It lets head coaches share saved practice plans with assistant coaches,
-- revoke that access, and lets assistants remove a shared plan from their own view.

create table if not exists public.practice_plan_shares (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  practice_plan_id text not null,
  shared_by_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shared_with_user_id uuid not null references auth.users(id) on delete cascade,
  access_level text not null default 'view' check (access_level in ('view')),
  status text not null default 'active' check (status in ('active', 'revoked', 'removed_by_assistant')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  removed_at timestamptz,
  unique (team_id, practice_plan_id, shared_with_user_id)
);

create or replace function public.touch_practice_plan_share_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists practice_plan_shares_updated_at on public.practice_plan_shares;
create trigger practice_plan_shares_updated_at
before update on public.practice_plan_shares
for each row execute function public.touch_practice_plan_share_updated_at();

create or replace function public.guard_practice_plan_share_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_team_head(old.team_id) then
    if new.team_id is distinct from old.team_id
      or new.practice_plan_id is distinct from old.practice_plan_id
      or new.shared_with_user_id is distinct from old.shared_with_user_id
      or new.shared_by_user_id is distinct from old.shared_by_user_id
    then
      raise exception 'Practice plan share identity cannot be changed.';
    end if;
    if new.status = 'revoked' and new.revoked_at is null then
      new.revoked_at = now();
    end if;
    return new;
  end if;

  if old.shared_with_user_id = auth.uid() then
    if new.team_id is distinct from old.team_id
      or new.practice_plan_id is distinct from old.practice_plan_id
      or new.shared_with_user_id is distinct from old.shared_with_user_id
      or new.shared_by_user_id is distinct from old.shared_by_user_id
      or new.access_level is distinct from old.access_level
      or new.revoked_at is distinct from old.revoked_at
      or new.status <> 'removed_by_assistant'
    then
      raise exception 'Assistant coaches can only remove a shared practice plan from their own view.';
    end if;
    if new.removed_at is null then
      new.removed_at = now();
    end if;
    return new;
  end if;

  raise exception 'You do not have permission to update this practice plan share.';
end;
$$;

drop trigger if exists practice_plan_share_update_guard on public.practice_plan_shares;
create trigger practice_plan_share_update_guard
before update on public.practice_plan_shares
for each row execute function public.guard_practice_plan_share_update();

alter table public.practice_plan_shares enable row level security;

grant select, insert, update on public.practice_plan_shares to authenticated;

drop policy if exists "practice plan shares are visible to head and recipient" on public.practice_plan_shares;
create policy "practice plan shares are visible to head and recipient"
on public.practice_plan_shares
for select
to authenticated
using (
  public.is_team_head(team_id)
  or (
    shared_with_user_id = auth.uid()
    and status = 'active'
    and public.is_team_member(team_id)
  )
);

drop policy if exists "heads can create practice plan shares" on public.practice_plan_shares;
create policy "heads can create practice plan shares"
on public.practice_plan_shares
for insert
to authenticated
with check (
  public.is_team_head(team_id)
  and shared_by_user_id = auth.uid()
  and status = 'active'
  and exists (
    select 1
    from public.team_members tm
    where tm.team_id = practice_plan_shares.team_id
      and tm.user_id = practice_plan_shares.shared_with_user_id
      and tm.role = 'assistant'
  )
);

drop policy if exists "heads and recipients can update practice plan shares" on public.practice_plan_shares;
create policy "heads and recipients can update practice plan shares"
on public.practice_plan_shares
for update
to authenticated
using (
  public.is_team_head(team_id)
  or (
    shared_with_user_id = auth.uid()
    and status = 'active'
    and public.is_team_member(team_id)
  )
)
with check (
  public.is_team_head(team_id)
  or (
    shared_with_user_id = auth.uid()
    and status = 'removed_by_assistant'
    and public.is_team_member(team_id)
  )
);
