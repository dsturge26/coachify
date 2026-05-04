# Coachify

Single-file web app for youth coaching: roster setup, lineup planning, shared coach access, touch tracking, and AI-assisted practice plans.

## Files

- `index.html` - the hosted app
- `supabase_setup.sql` - main Supabase schema and policies
- `supabase_create_team_function.sql` - helper function for cloud team creation
- `supabase_role_lockdown.sql` - database guard for assistant coach permissions
- `supabase_email_invites.sql` - email-based assistant coach invitations
- `supabase_division_settings.sql` - per-team division and field-size settings
- `supabase_delete_teams.sql` - head-coach team deletion policy
- `supabase_practice_plans.sql` - saved AI-generated practice plans

## Deploy

This app is static. Host `index.html` with Netlify, GitHub Pages, Cloudflare Pages, or any static host.
