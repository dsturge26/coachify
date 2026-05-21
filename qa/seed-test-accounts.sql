-- ============================================================================
-- Coachify QA seed script — two test accounts, one test team, 9 players,
-- accepted assistant invite.
--
-- Run this in the Supabase SQL editor on the SAME project that coachify-app.com
-- points at. Requires admin/service-role access (the SQL editor uses that
-- automatically).
--
-- This script is idempotent: re-running it will not create duplicates, but
-- will refresh the roster to the canonical 9 players.
--
-- If the auth.users / auth.identities inserts fail (Supabase changes that
-- schema occasionally), see the FALLBACK section at the bottom — you can
-- create the two users via the Supabase Dashboard → Authentication → Add User,
-- then re-run this script (it will skip user creation and just wire up the
-- team and membership).
--
-- Cleanup (when you're done): see qa/teardown-test-accounts.sql.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Extensions we rely on for bcrypt password hashing.
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 2. Create the two test users in auth.users (idempotent on email).
--    Passwords: TestCoach123!  /  TestAssist123!
-- ---------------------------------------------------------------------------
do $seed_users$
declare
  v_head_id uuid;
  v_assist_id uuid;
begin
  -- HEAD COACH ---------------------------------------------------------------
  select id into v_head_id
    from auth.users
   where email = 'testcoach@coachify-test.com'
   limit 1;

  if v_head_id is null then
    v_head_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token,
      email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_head_id, 'authenticated', 'authenticated',
      'testcoach@coachify-test.com',
      crypt('TestCoach123!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_head_id, v_head_id::text, 'email',
      jsonb_build_object(
        'sub', v_head_id::text,
        'email', 'testcoach@coachify-test.com',
        'email_verified', true,
        'provider', 'email'
      ),
      now(), now(), now()
    );
  end if;

  -- ASSISTANT COACH ----------------------------------------------------------
  select id into v_assist_id
    from auth.users
   where email = 'testassist@coachify-test.com'
   limit 1;

  if v_assist_id is null then
    v_assist_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token,
      email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_assist_id, 'authenticated', 'authenticated',
      'testassist@coachify-test.com',
      crypt('TestAssist123!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_assist_id, v_assist_id::text, 'email',
      jsonb_build_object(
        'sub', v_assist_id::text,
        'email', 'testassist@coachify-test.com',
        'email_verified', true,
        'provider', 'email'
      ),
      now(), now(), now()
    );
  end if;
end;
$seed_users$;

-- ---------------------------------------------------------------------------
-- 3. Create the test team (idempotent on name + creator).
--    We bypass create_team_as_head() because that RPC uses auth.uid() which
--    is NULL in the SQL editor. We insert directly and add the head
--    membership ourselves.
-- ---------------------------------------------------------------------------
do $seed_team$
declare
  v_head_id uuid;
  v_assist_id uuid;
  v_team_id uuid;
  v_roster jsonb;
  i int;
  v_players jsonb := '[]'::jsonb;
begin
  select id into v_head_id   from auth.users where email = 'testcoach@coachify-test.com'   limit 1;
  select id into v_assist_id from auth.users where email = 'testassist@coachify-test.com' limit 1;

  if v_head_id is null or v_assist_id is null then
    raise exception 'Test users were not created. Check the FALLBACK section in this file.';
  end if;

  -- Build a 9-player roster: Player1 .. Player9
  for i in 1..9 loop
    v_players := v_players || jsonb_build_array(
      jsonb_build_object(
        'id',     format('kid-qa-%s', i),
        'name',   format('Player%s', i),
        'jersey', i::text,
        'skill',  3,
        'preferredPositions', jsonb_build_object('offense', '[]'::jsonb, 'defense', '[]'::jsonb),
        'cannotPlayPositions', jsonb_build_object('offense', '[]'::jsonb, 'defense', '[]'::jsonb),
        'notes',  ''
      )
    );
  end loop;

  select id into v_team_id
    from public.teams
   where name = 'Test Team QA'
     and created_by = v_head_id
   limit 1;

  if v_team_id is null then
    insert into public.teams (
      name, division_id, division_settings, roster,
      touch_tracker, attendance, lineup_plan, practice_plans, created_by
    ) values (
      'Test Team QA',
      'boys-6u',
      jsonb_build_object('playersOnField', 6),
      v_players,
      '{"counts":{},"history":[],"gameNotes":"","liveGame":null}'::jsonb,
      '[]'::jsonb,
      null,
      '[]'::jsonb,
      v_head_id
    )
    returning id into v_team_id;
    -- The team_creator_membership trigger inserts the head row automatically.
  else
    -- Refresh the roster to the canonical 9 players (and reset shared state).
    update public.teams
       set roster        = v_players,
           touch_tracker = '{"counts":{},"history":[],"gameNotes":"","liveGame":null}'::jsonb,
           attendance    = '[]'::jsonb,
           lineup_plan   = null
     where id = v_team_id;
  end if;

  -- Make sure the head membership exists (it should, via the trigger).
  insert into public.team_members (team_id, user_id, role)
       values (v_team_id, v_head_id, 'head')
  on conflict (team_id, user_id) do update set role = 'head';

  -- ---------------------------------------------------------------------
  -- 4. Pre-accepted assistant invite + membership.
  -- ---------------------------------------------------------------------
  insert into public.team_invites (
    team_id, team_name, invited_email, role, status,
    invited_by, accepted_by, created_at, updated_at
  ) values (
    v_team_id, 'Test Team QA',
    'testassist@coachify-test.com', 'assistant', 'accepted',
    v_head_id, v_assist_id, now(), now()
  )
  on conflict (team_id, invited_email) do update
    set status      = 'accepted',
        accepted_by = v_assist_id,
        updated_at  = now();

  insert into public.team_members (team_id, user_id, role)
       values (v_team_id, v_assist_id, 'assistant')
  on conflict (team_id, user_id) do update set role = 'assistant';

  raise notice 'Seed complete. team_id=%, head_user_id=%, assistant_user_id=%',
    v_team_id, v_head_id, v_assist_id;
end;
$seed_team$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFICATION — run these after the script completes:
-- ---------------------------------------------------------------------------
-- select email, id, email_confirmed_at
--   from auth.users
--  where email in ('testcoach@coachify-test.com','testassist@coachify-test.com');
--
-- select t.id, t.name, t.created_by, jsonb_array_length(t.roster) as roster_count
--   from public.teams t
--   join auth.users u on u.id = t.created_by
--  where u.email = 'testcoach@coachify-test.com';
--
-- select tm.role, u.email
--   from public.team_members tm
--   join auth.users u on u.id = tm.user_id
--   join public.teams t on t.id = tm.team_id
--  where t.name = 'Test Team QA' and t.created_by = (
--    select id from auth.users where email = 'testcoach@coachify-test.com'
--  );

-- ---------------------------------------------------------------------------
-- FALLBACK — if the auth.users / auth.identities inserts above fail
-- (Supabase periodically changes those columns), do this instead:
--
-- 1. Supabase Dashboard → Authentication → Users → "Add user → Create new user"
--    Email: testcoach@coachify-test.com    Password: TestCoach123!
--    Tick "Auto Confirm User".
--    Repeat for testassist@coachify-test.com / TestAssist123!.
--
-- 2. Re-run THIS script. The user-creation blocks will short-circuit because
--    the users already exist, and the team/invite/membership setup will
--    proceed normally.
-- ---------------------------------------------------------------------------
