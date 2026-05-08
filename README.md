# Coachify

Single-file web app for youth coaching: roster setup, lineup planning, shared coach access, touch tracking, and AI-assisted practice plans.

Production app: https://coachify-app.com/

## Files

- `index.html` - the hosted app
- `manifest.webmanifest` - installable app settings
- `sw.js` - service worker for the PWA app shell
- `icons/` - Coachify home-screen icons
- `functions/api/practice-plan.js` - AI practice plan generation, including background saves
- `functions/api/practice-drill-help.js` - per-drill AI questions and reframes
- `supabase_setup.sql` - main Supabase schema and policies
- `supabase_create_team_function.sql` - helper function for team creation
- `supabase_role_lockdown.sql` - database guard for assistant coach permissions
- `supabase_email_invites.sql` - email-based assistant coach invitations
- `supabase_invite_repair.sql` - reliable invite lookup and team access management helpers
- `supabase_accept_invite_fix.sql` - small SQL patch for invite acceptance issues
- `supabase_invite_debug.sql` - SQL checks for invite troubleshooting
- `supabase_invite_force_accept.sql` - emergency helper to grant assistant access from a pending invite
- `supabase_leave_team.sql` - assistant self-service leave-team helper
- `supabase_division_settings.sql` - per-team division and field-size settings
- `supabase_delete_teams.sql` - head-coach team deletion policy
- `supabase_practice_plans.sql` - saved AI-generated practice plans

## Deploy

This app is static. Host the full folder with Cloudflare Pages so the PWA files deploy with `index.html`.

Production domain:

- `coachify-app.com`
- Cloudflare Pages custom domain should point this domain at the Pages project.
- Supabase Auth URL Configuration should use `https://coachify-app.com` as the Site URL.
- Supabase Redirect URLs should include `https://coachify-app.com/*`.
