# Coachify QA harness — freeze-fix verification

Automated stress-tests for the Game Day Core freeze fixes (Phase 2 plan). Runs
two real browser contexts against a deployed Coachify instance, signed in as a
head coach and an assistant on the same team.

## What's in here

- `seed-test-accounts.sql` — one-shot SQL to create the two test users, the
  test team, the 9 players, and an accepted assistant invite. **Run this
  first**, in the Supabase SQL editor of the project that the target site
  points at.
- `teardown-test-accounts.sql` — wipes everything the seed created.
- `playwright.config.ts` — Playwright runner config.
- `tests/freeze-fixes.spec.ts` — the 14 checklist tests.
- `.env.example` — copy to `.env` and fill in.

## ⚠️ Read this before you run anything

1. The seed and the tests touch the **production Supabase project** behind
   coachify-app.com. The teardown SQL cleans up afterward; nothing else
   touches your real data, but the test team will exist in your prod DB
   between seed and teardown.
2. The tests assume the deployed site already has the freeze fixes shipped.
   Running them against an older deploy will surface real failures (which is
   the point — but don't be surprised).
3. Selectors are based on `index.html` as of this commit. If the deployed UI
   has drifted, individual tests may need selector tweaks.
4. Tests 5 (no polling overlap) and 6 (polling fallback) require Playwright's
   network instrumentation and the WebSocket-block trick. They're flaky on
   slow networks — re-run on a clean network if they fail spuriously.
5. Test 13 (DOM stability) instruments `els.gameDayStage` via a
   `MutationObserver` injected from Playwright. The check is "the outer node
   identity does not change," not "no flicker."

## Setup

```powershell
cd qa
npm install
npx playwright install chromium
Copy-Item .env.example .env
# Then edit .env and paste the target site URL (defaults to coachify-app.com).
```

## Seed the accounts

Open the Supabase SQL editor for the project behind your target site, paste
`seed-test-accounts.sql`, and run it. Verify with the three SELECT statements
in the comment block at the bottom of that file.

If the `auth.users` insert fails (Supabase periodically changes that schema),
follow the FALLBACK section at the bottom of `seed-test-accounts.sql`: create
the two users via the Supabase Dashboard's "Add user" button, then re-run the
seed script — it will skip user creation and continue.

## Run the tests

```powershell
npm test                # all 14 checks, headed=false
npm run test:headed     # watch them run in real browsers
npm run test:debug      # Playwright inspector
```

A pass/fail report lands in `qa/playwright-report/`. Open it with:

```powershell
npx playwright show-report
```

## Tear down

```powershell
# In the Supabase SQL editor:
# Paste qa/teardown-test-accounts.sql, run it.
```

## What each test covers

| #  | Check                                       | Status         |
|----|---------------------------------------------|----------------|
| 1  | Drive switch rapid-tap, no confirm dialog    | automated      |
| 2  | Touch tap rapid-tap, serialized via lock     | automated      |
| 3  | Pending visual opacity flip                  | automated      |
| 4  | Cross-coach realtime propagation             | automated      |
| 5  | No polling overlap while realtime is fresh   | automated      |
| 6  | Polling fallback after WS block (30 s wait)  | automated, slow |
| 7  | Mode transitions render correctly            | automated      |
| 8  | Late-arrival rebuild preserves touches       | automated      |
| 9  | Undo last touch                              | automated      |
| 10 | Recap stays cumulative                       | automated      |
| 11 | Session-filter resets on new game            | automated      |
| 12 | Assistant view trimming (no buttons)         | automated      |
| 13 | DOM stability (stage node identity)          | automated      |
| 14 | No regressions: practice/team tabs load      | smoke only     |
