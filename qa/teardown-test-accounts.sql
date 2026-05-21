-- Wipe everything the seed script created.
-- Safe to run anytime; will not touch your real account or the Redbirds team.

begin;

delete from public.teams
 where name = 'Test Team QA'
   and created_by in (
     select id from auth.users where email = 'testcoach@coachify-test.com'
   );

delete from auth.users
 where email in ('testcoach@coachify-test.com', 'testassist@coachify-test.com');

commit;
