# Coachify

Single-file web app for youth coaching: roster setup, lineup planning, shared coach access, touch tracking, and AI-assisted practice plans.

## Files

- `index.html` - the hosted app
- `manifest.webmanifest` - installable app settings
- `sw.js` - service worker for the PWA app shell
- `icons/` - Coachify home-screen icons
- `supabase_setup.sql` - main Supabase schema and policies
- `supabase_create_team_function.sql` - helper function for cloud team creation
- `supabase_role_lockdown.sql` - database guard for assistant coach permissions
- `supabase_email_invites.sql` - email-based assistant coach invitations
- `supabase_division_settings.sql` - per-team division and field-size settings
- `supabase_delete_teams.sql` - head-coach team deletion policy
- `supabase_practice_plans.sql` - saved AI-generated practice plans

## Deploy

This app is static. Host the full folder with Cloudflare Pages or another static host so the PWA files deploy with `index.html`.
