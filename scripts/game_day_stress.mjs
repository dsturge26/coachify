// Game-day CONCURRENCY STRESS TEST
// Targets the exact failure modes that historically broke on game day:
//   1. Touch counts getting lost / "reset" when head and assistant tap at once
//   2. Live-game drive progression clobbering touches (and vice versa)
//   3. Game notes overwriting the live game or counts
//   4. Touch tracker surviving a lineup rebuild under concurrent taps
// Unlike game_day_qa.mjs (one pass per scenario), this hammers the RPCs with
// many SIMULTANEOUS writes from two authenticated coaches and asserts exact
// totals, so a race condition shows up as a lost touch.

const SUPABASE_URL = "https://uyquscyllwfykylbypzs.supabase.co";
const SUPABASE_KEY = "sb_publishable_mHS5AD4JIHTOWevqBB3LGg_XuT5IVq0";

const results = [];
let cleanup = null;

function record(name, pass, details = {}) {
  results.push({ name, pass, details });
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function sbFetch(path, { token, method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token || SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  return data;
}

async function signUpOrIn(email, password) {
  try {
    const signup = await sbFetch("/auth/v1/signup", { method: "POST", body: { email, password } });
    if (signup?.access_token) return signup;
  } catch {}
  return sbFetch("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
}
async function getTeam(token, teamId) {
  return (await sbFetch(`/rest/v1/teams?id=eq.${teamId}&select=*`, { token }))[0];
}
async function patchTeam(token, teamId, body) {
  return sbFetch(`/rest/v1/teams?id=eq.${teamId}`, { token, method: "PATCH", headers: { Prefer: "return=representation" }, body });
}
async function rpc(token, name, body) {
  return sbFetch(`/rest/v1/rpc/${name}`, { token, method: "POST", body });
}
function totalTouches(tracker) {
  return Object.values(tracker?.counts || {}).reduce((sum, c) => sum + Number(c || 0), 0);
}

async function run() {
  const stamp = Date.now().toString().slice(-7);
  const password = `CoachifyStress-${stamp}-${Math.random().toString(36).slice(2)}!`;
  const head = await signUpOrIn(`stress-head-${stamp}@coachify-app.com`, password);
  const assistant = await signUpOrIn(`stress-asst-${stamp}@coachify-app.com`, password);
  const headToken = head.access_token;
  const asstToken = assistant.access_token;

  const roster = ["A", "B", "C", "D", "E", "F"].map((n, i) => ({
    id: `p-${i + 1}`, name: n, jersey: String(i + 1), skill: 3,
    preferredPositions: { offense: [], defense: [] }, cannotPlayPositions: { offense: [], defense: [] }, notes: ""
  }));
  const ids = roster.map((p) => p.id);

  const teamId = await rpc(headToken, "create_team_as_head", {
    p_name: `Stress ${stamp}`, p_division_id: "boys-6u", p_roster: [],
    p_touch_tracker: { counts: {}, history: [], gameNotes: "", liveGame: null },
    p_attendance: [], p_lineup_plan: null
  });
  cleanup = async () => {
    try { await sbFetch(`/rest/v1/teams?id=eq.${teamId}`, { token: headToken, method: "DELETE", headers: { Prefer: "return=minimal" } }); } catch {}
  };

  await patchTeam(headToken, teamId, {
    roster, attendance: ids,
    touch_tracker: { counts: Object.fromEntries(ids.map((id) => [id, 0])), history: [], gameNotes: "", liveGame: null },
    division_settings: { playersOnField: 6 }, lineup_plan: null
  });
  await sbFetch("/rest/v1/team_members", {
    token: asstToken, method: "POST", headers: { Prefer: "return=minimal" },
    body: { team_id: teamId, user_id: assistant.user.id, role: "assistant" }
  });

  // ---- TEST 1: 60 simultaneous touches, both coaches tapping at once ----
  const N = 30; // each coach fires N touches => 60 total, all in flight together
  const burst = [];
  for (let i = 0; i < N; i++) {
    burst.push(rpc(headToken, "add_team_touch", { p_team_id: teamId, p_player_id: ids[i % ids.length] }));
    burst.push(rpc(asstToken, "add_team_touch", { p_team_id: teamId, p_player_id: ids[(i + 3) % ids.length] }));
  }
  await Promise.all(burst);
  let team = await getTeam(headToken, teamId);
  const total1 = totalTouches(team.touch_tracker);
  assert(total1 === 2 * N, `Lost touches under concurrency: expected ${2 * N}, got ${total1}`);
  assert((team.touch_tracker.history || []).length === 2 * N, `History length mismatch: expected ${2 * N}, got ${(team.touch_tracker.history || []).length}`);
  record("60 simultaneous head+assistant touches: none lost", true, { expected: 2 * N, got: total1, history: team.touch_tracker.history.length });

  // ---- TEST 2: live-game drive updates interleaved with touch taps ----
  const liveGame0 = { id: `g-${stamp}`, status: "live", startedAt: new Date().toISOString(), endedAt: null, driveStepIndex: 0, updatedAt: new Date().toISOString(), updatedBy: head.user.id };
  await rpc(headToken, "set_team_live_game", { p_team_id: teamId, p_live_game: liveGame0 });
  const interleaved = [];
  for (let step = 1; step <= 8; step++) {
    // head advances the drive while assistant simultaneously taps touches
    interleaved.push(rpc(headToken, "set_team_live_game", { p_team_id: teamId, p_live_game: { ...liveGame0, driveStepIndex: step, updatedAt: new Date().toISOString() } }));
    interleaved.push(rpc(asstToken, "add_team_touch", { p_team_id: teamId, p_player_id: ids[step % ids.length] }));
    interleaved.push(rpc(headToken, "add_team_touch", { p_team_id: teamId, p_player_id: ids[(step + 1) % ids.length] }));
  }
  await Promise.all(interleaved);
  team = await getTeam(asstToken, teamId);
  const total2 = totalTouches(team.touch_tracker);
  assert(total2 === 2 * N + 16, `Touches lost during live-game churn: expected ${2 * N + 16}, got ${total2}`);
  assert(team.touch_tracker.liveGame && team.touch_tracker.liveGame.status === "live", "Live game lost during concurrent touches");
  assert(Number.isInteger(team.touch_tracker.liveGame.driveStepIndex), "Drive step corrupted");
  record("Drive updates + touches interleaved: live game intact, no touches lost", true, { totalTouches: total2, driveStepIndex: team.touch_tracker.liveGame.driveStepIndex });

  // ---- TEST 3: notes spam does not clobber live game or counts ----
  const before3 = totalTouches(team.touch_tracker);
  const notesBurst = [];
  for (let i = 0; i < 10; i++) {
    notesBurst.push(rpc(asstToken, "set_team_game_notes", { p_team_id: teamId, p_notes: `note ${i} - watch contain` }));
    notesBurst.push(rpc(headToken, "add_team_touch", { p_team_id: teamId, p_player_id: ids[i % ids.length] }));
  }
  await Promise.all(notesBurst);
  team = await getTeam(headToken, teamId);
  assert(totalTouches(team.touch_tracker) === before3 + 10, `Notes spam lost touches: expected ${before3 + 10}, got ${totalTouches(team.touch_tracker)}`);
  assert(team.touch_tracker.liveGame && team.touch_tracker.liveGame.status === "live", "Notes spam wiped live game");
  assert(typeof team.touch_tracker.gameNotes === "string" && team.touch_tracker.gameNotes.length > 0, "Notes not saved");
  record("Notes spam concurrent with touches: live game + counts preserved", true, { totalTouches: totalTouches(team.touch_tracker), notes: team.touch_tracker.gameNotes });

  // ---- TEST 4: lineup rebuild (late kids) WHILE touches stream in ----
  const before4 = totalTouches(team.touch_tracker);
  const lateRoster = [...roster, { id: "p-late", name: "Late", jersey: "9", skill: 3, preferredPositions: { offense: [], defense: [] }, cannotPlayPositions: { offense: [], defense: [] }, notes: "" }];
  const rebuildBurst = [
    patchTeam(headToken, teamId, { attendance: lateRoster.map((p) => p.id), roster: lateRoster }),
    ...Array.from({ length: 8 }, (_, i) => rpc(asstToken, "add_team_touch", { p_team_id: teamId, p_player_id: ids[i % ids.length] }))
  ];
  await Promise.all(rebuildBurst);
  team = await getTeam(headToken, teamId);
  // touches added during rebuild must all survive; counts use RPC (locked), patch only touches roster/attendance
  assert(totalTouches(team.touch_tracker) === before4 + 8, `Rebuild dropped touches: expected ${before4 + 8}, got ${totalTouches(team.touch_tracker)}`);
  assert(team.attendance.length === 7, "Late player not added");
  assert(team.touch_tracker.liveGame && team.touch_tracker.liveGame.status === "live", "Rebuild wiped live game");
  record("Lineup rebuild under live touch stream: nothing reset", true, { totalTouches: totalTouches(team.touch_tracker), attendance: team.attendance.length });

  // ---- TEST 5: assistant still cannot reset (RLS under load) ----
  let blocked = false;
  try { await rpc(asstToken, "reset_team_touches", { p_team_id: teamId }); }
  catch (e) { blocked = String(e.message).includes("Only the head coach"); }
  assert(blocked, "Assistant was able to reset touches");
  team = await getTeam(headToken, teamId);
  assert(totalTouches(team.touch_tracker) > 0, "Touches lost after blocked reset attempt");
  record("Assistant reset still blocked after heavy load", true, { totalTouches: totalTouches(team.touch_tracker) });

  return { stamp, teamId, results, failed: results.filter((r) => !r.pass).length };
}

try {
  const summary = await run();
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  record("Stress harness failed", false, { message: error.message });
  console.log(JSON.stringify({ results, failed: results.filter((r) => !r.pass).length }, null, 2));
  process.exitCode = 1;
} finally {
  if (cleanup) await cleanup();
}
