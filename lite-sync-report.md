# Coachify Lite — cross-client sync test
_Generated 2026-05-31 14:01:50 UTC on GitHub Actions_

## Page deployed & reachable on prod?
- URL: https://coachify-app.com/coachify-lite.html
- HTTP (following redirects): `200`, version detected: `lite-v1.0.0`
- **LIVE — open this URL on two phones to dry-run.**

## Cross-client sync test

_Two separate authenticated clients (head + assistant). The assistant
only learns of changes by POLLING — exactly like the Lite app. Verifies
the assistant sees live game, current drive, and touch counts, plus
bidirectional sync and no lost touches under concurrency._

```json
{
  "stamp": "6110833",
  "teamId": "54f2c225-0e41-4576-a698-f1b610652696",
  "results": [
    {
      "name": "Assistant phone can load the shared team",
      "pass": true,
      "details": {
        "players": 6
      }
    },
    {
      "name": "Assistant sees the game go LIVE via polling",
      "pass": true,
      "details": {
        "observedInMs": 39
      }
    },
    {
      "name": "Assistant sees the CURRENT DRIVE update via polling",
      "pass": true,
      "details": {
        "drive": 3,
        "observedInMs": 38
      }
    },
    {
      "name": "Assistant sees TOUCH TRACKER sync via polling",
      "pass": true,
      "details": {
        "total": 3,
        "observedInMs": 22
      }
    },
    {
      "name": "Head sees the ASSISTANT's touch via polling (bidirectional)",
      "pass": true,
      "details": {
        "observedInMs": 24
      }
    },
    {
      "name": "20 simultaneous taps from both phones: none lost",
      "pass": true,
      "details": {
        "before": 4,
        "after": 24
      }
    }
  ],
  "failed": 0
}
```
- **PASS — both phones stayed in sync (touches + current drive).**
