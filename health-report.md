# Coachify game-day health check
_Generated 2026-05-30 11:42:31 UTC on GitHub Actions_

## 1. Is the Supabase project awake?
- REST ping HTTP status: `200`
- Response (truncated): `[]`
- **Verdict: AWAKE** — project is responding.

## 2. Production app version
- Source (index.html) version: `v0.20.5`
- Live prod fetch HTTP: `200`, detected version: `v0.20.5`
- **Verdict: IN SYNC** — prod matches source, no deploy needed.

## 2b. Drive-board floor live in prod
- Source drive floor per side: `8`
- Live prod drive floor per side: `8`
- **Verdict: LIVE** — prod is serving the 8-drive board (offense and defense).

## 3. Full game-day reliability suite (scripts/game_day_qa.mjs)
_Exercises head+assistant access, lineup build, late-kid rebuild, concurrent live-game + touches, RLS lockdowns, undo/reset/recap._

```json
{
  "stamp": "1351985",
  "teamId": "2dd94d10-f0b4-435b-950f-1c9433bc7de5",
  "results": [
    {
      "name": "Assistant can see shared team membership",
      "pass": true,
      "details": {
        "role": "assistant"
      }
    },
    {
      "name": "Head coach builds initial lineup for 6 present players",
      "pass": true,
      "details": {
        "attendance": 6,
        "totalTouches": 0
      }
    },
    {
      "name": "Assistant touch taps save and head can read them",
      "pass": true,
      "details": {
        "totalTouches": 2
      }
    },
    {
      "name": "Late player added and lineup rebuilt without resetting touches",
      "pass": true,
      "details": {
        "attendance": 7,
        "totalTouches": 2
      }
    },
    {
      "name": "Assistant can add touch for late player after rebuild",
      "pass": true,
      "details": {
        "latePlayerTouches": 1,
        "totalTouches": 3
      }
    },
    {
      "name": "Head starts live game and assistant can read live state",
      "pass": true,
      "details": {
        "status": "live",
        "driveStepIndex": 0
      }
    },
    {
      "name": "Concurrent drive progression plus assistant touch both survive",
      "pass": true,
      "details": {
        "driveStepIndex": 1,
        "totalTouches": 4
      }
    },
    {
      "name": "Assistant game notes do not overwrite live game or touches",
      "pass": true,
      "details": {
        "driveStepIndex": 1,
        "totalTouches": 4
      }
    },
    {
      "name": "Assistant cannot reset touch tracker",
      "pass": true,
      "details": {
        "totalTouches": 4
      }
    },
    {
      "name": "Assistant undo removes last touch without changing drive state",
      "pass": true,
      "details": {
        "totalTouches": 3,
        "driveStepIndex": 1
      }
    },
    {
      "name": "Head reset clears counts but preserves live game and notes",
      "pass": true,
      "details": {
        "totalTouches": 0,
        "driveStepIndex": 1
      }
    },
    {
      "name": "End game/recap state is visible to assistant",
      "pass": true,
      "details": {
        "status": "recap",
        "endedAt": true
      }
    },
    {
      "name": "Published app matches the current source version",
      "pass": true,
      "details": {
        "expectedVersion": "v0.20.5"
      }
    }
  ],
  "failed": 0
}
```
- **Suite exit 0 — all checks passed.**

## 4. Concurrency STRESS test (scripts/game_day_stress.mjs)
_Fires 60+ simultaneous head+assistant writes to expose race conditions: lost touches, touch-tracker resets, live-game/notes clobbering, and rebuild-under-load._

```json
{
  "stamp": "1354040",
  "teamId": "d6350a9b-f831-4f57-b820-986535cb5e2f",
  "results": [
    {
      "name": "60 simultaneous head+assistant touches: none lost",
      "pass": true,
      "details": {
        "expected": 60,
        "got": 60,
        "history": 60
      }
    },
    {
      "name": "Drive updates + touches interleaved: live game intact, no touches lost",
      "pass": true,
      "details": {
        "totalTouches": 76,
        "driveStepIndex": 3
      }
    },
    {
      "name": "Notes spam concurrent with touches: live game + counts preserved",
      "pass": true,
      "details": {
        "totalTouches": 86,
        "notes": "note 6 - watch contain"
      }
    },
    {
      "name": "Lineup rebuild under live touch stream: nothing reset",
      "pass": true,
      "details": {
        "totalTouches": 94,
        "attendance": 7
      }
    },
    {
      "name": "Assistant reset still blocked after heavy load",
      "pass": true,
      "details": {
        "totalTouches": 94
      }
    }
  ],
  "failed": 0
}
```
- **Stress exit 0 — no touches lost, no resets, sync held under load.**
