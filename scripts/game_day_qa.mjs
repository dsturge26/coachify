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
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
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
  return sbFetch(`/rest/v1/teams?id=eq.${teamId}`, {
    token,
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body
  });
}

async function rpc(token, name, body) {
  return sbFetch(`/rest/v1/rpc/${name}`, { token, method: "POST", body });
}

function totalTouches(tracker) {
  return Object.values(tracker?.counts || {}).reduce((sum, count) => sum + Number(count || 0), 0);
}

function fakePlan(attendance, label) {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    qaLabel: label,
    attendingIds: attendance,
    offenseUnits: [
      {
        label: `${label} O1`,
        side: "offense",
        lineup: {
          QB: attendance[0],
          Center: attendance[1],
          RB: attendance[2],
          WR1: attendance[3],
          WR2: attendance[4],
          WR3: attendance[5]
        },
        lockedPositions: ["QB", "Center"]
      }
    ],
    defenseUnits: [
      {
        label: `${label} D1`,
        side: "defense",
        lineup: {
          C1: attendance[0],
          LB1: attendance[1],
          LB2: attendance[2],
          C2: attendance[3],
          MLB: attendance[4],
          S2: attendance[5]
        }
      }
    ],
    warnings: []
  };
}

async function runGameDayQa() {
  const stamp = Date.now().toString().slice(-7);
  const password = `CoachifyQA-${stamp}-${Math.random().toString(36).slice(2)}!`;
  const headEmail = `qa-head-${stamp}@coachify-app.com`;
  const assistantEmail = `qa-asst-${stamp}@coachify-app.com`;
  const head = await signUpOrIn(headEmail, password);
  const assistant = await signUpOrIn(assistantEmail, password);
  const headToken = head.access_token;
  const assistantToken = assistant.access_token;

  const roster = ["Aiden", "Blake", "Carter", "Drew", "Eli", "Finn", "Gabe Late"].map((name, index) => ({
    id: `qa-${index + 1}`,
    name,
    jersey: String(index + 1),
    skill: index < 2 ? 5 : index < 5 ? 3 : 2,
    preferredPositions: { offense: [], defense: [] },
    cannotPlayPositions: { offense: [], defense: [] },
    notes: ""
  }));

  const initialAttendance = roster.slice(0, 6).map((player) => player.id);
  const lateAttendance = roster.map((player) => player.id);
  const emptyTouch = {
    counts: Object.fromEntries(roster.map((player) => [player.id, 0])),
    history: [],
    gameNotes: "",
    liveGame: null
  };

  const teamId = await rpc(headToken, "create_team_as_head", {
    p_name: `QA Game Day Reliability ${stamp}`,
    p_division_id: "boys-6u",
    p_roster: [],
    p_touch_tracker: { counts: {}, history: [], gameNotes: "", liveGame: null },
    p_attendance: [],
    p_lineup_plan: null
  });

  cleanup = async () => {
    try {
      await sbFetch(`/rest/v1/teams?id=eq.${teamId}`, {
        token: headToken,
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
      });
    } catch {}
  };

  await patchTeam(headToken, teamId, {
    roster,
    attendance: initialAttendance,
    touch_tracker: emptyTouch,
    division_settings: { playersOnField: 6 },
    lineup_plan: null
  });

  await sbFetch("/rest/v1/team_members", {
    token: assistantToken,
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: { team_id: teamId, user_id: assistant.user.id, role: "assistant" }
  });

  const assistantMembership = await sbFetch(`/rest/v1/team_members?user_id=eq.${assistant.user.id}&team_id=eq.${teamId}&select=team_id,role`, {
    token: assistantToken
  });
  assert(assistantMembership.length === 1 && assistantMembership[0].role === "assistant", "Assistant membership not visible");
  record("Assistant can see shared team membership", true, { role: assistantMembership[0].role });

  await patchTeam(headToken, teamId, { attendance: initialAttendance, lineup_plan: fakePlan(initialAttendance, "Initial lineup") });
  let team = await getTeam(headToken, teamId);
  assert(team.attendance.length === 6 && team.lineup_plan?.qaLabel === "Initial lineup", "Initial lineup did not save");
  assert(totalTouches(team.touch_tracker) === 0, "Initial lineup should not create touches");
  record("Head coach builds initial lineup for 6 present players", true, { attendance: team.attendance.length, totalTouches: totalTouches(team.touch_tracker) });

  await rpc(assistantToken, "add_team_touch", { p_team_id: teamId, p_player_id: "qa-1" });
  await rpc(assistantToken, "add_team_touch", { p_team_id: teamId, p_player_id: "qa-2" });
  team = await getTeam(headToken, teamId);
  assert(team.touch_tracker.counts["qa-1"] === 1 && team.touch_tracker.counts["qa-2"] === 1 && totalTouches(team.touch_tracker) === 2, "Assistant touches not visible to head");
  record("Assistant touch taps save and head can read them", true, { totalTouches: totalTouches(team.touch_tracker) });

  await patchTeam(headToken, teamId, { attendance: lateAttendance, lineup_plan: fakePlan(lateAttendance, "Late kid rebuild") });
  team = await getTeam(assistantToken, teamId);
  assert(team.attendance.length === 7, "Late attendance did not save");
  assert(team.lineup_plan?.qaLabel === "Late kid rebuild", "Late rebuild lineup not visible");
  assert(team.touch_tracker.counts["qa-1"] === 1 && team.touch_tracker.counts["qa-2"] === 1 && totalTouches(team.touch_tracker) === 2, "Touch tracker reset or changed during lineup rebuild");
  record("Late player added and lineup rebuilt without resetting touches", true, { attendance: team.attendance.length, totalTouches: totalTouches(team.touch_tracker) });

  await rpc(assistantToken, "add_team_touch", { p_team_id: teamId, p_player_id: "qa-7" });
  team = await getTeam(headToken, teamId);
  assert(team.touch_tracker.counts["qa-7"] === 1 && totalTouches(team.touch_tracker) === 3, "Late player touch did not sync");
  record("Assistant can add touch for late player after rebuild", true, { latePlayerTouches: team.touch_tracker.counts["qa-7"], totalTouches: totalTouches(team.touch_tracker) });

  const liveGame0 = {
    id: `qa-game-${stamp}`,
    status: "live",
    startedAt: new Date().toISOString(),
    endedAt: null,
    driveStepIndex: 0,
    updatedAt: new Date().toISOString(),
    updatedBy: head.user.id
  };
  await rpc(headToken, "set_team_live_game", { p_team_id: teamId, p_live_game: liveGame0 });
  team = await getTeam(assistantToken, teamId);
  assert(team.touch_tracker.liveGame?.status === "live" && team.touch_tracker.liveGame?.driveStepIndex === 0, "Live game did not start for assistant");
  record("Head starts live game and assistant can read live state", true, { status: team.touch_tracker.liveGame.status, driveStepIndex: team.touch_tracker.liveGame.driveStepIndex });

  const liveGame1 = { ...liveGame0, driveStepIndex: 1, updatedAt: new Date().toISOString() };
  await Promise.all([
    rpc(headToken, "set_team_live_game", { p_team_id: teamId, p_live_game: liveGame1 }),
    rpc(assistantToken, "add_team_touch", { p_team_id: teamId, p_player_id: "qa-3" })
  ]);
  team = await getTeam(headToken, teamId);
  assert(team.touch_tracker.liveGame?.driveStepIndex === 1, "Drive progression lost during concurrent touch");
  assert(team.touch_tracker.counts["qa-3"] === 1 && totalTouches(team.touch_tracker) === 4, "Concurrent touch lost during drive progression");
  record("Concurrent drive progression plus assistant touch both survive", true, { driveStepIndex: team.touch_tracker.liveGame.driveStepIndex, totalTouches: totalTouches(team.touch_tracker) });

  await rpc(assistantToken, "set_team_game_notes", { p_team_id: teamId, p_notes: "Watch edge contain; give Gabe a touch." });
  team = await getTeam(headToken, teamId);
  assert(team.touch_tracker.gameNotes.includes("Gabe") && team.touch_tracker.liveGame?.driveStepIndex === 1 && totalTouches(team.touch_tracker) === 4, "Game notes update overwrote live game or touches");
  record("Assistant game notes do not overwrite live game or touches", true, { driveStepIndex: team.touch_tracker.liveGame.driveStepIndex, totalTouches: totalTouches(team.touch_tracker) });

  let assistantResetBlocked = false;
  try {
    await rpc(assistantToken, "reset_team_touches", { p_team_id: teamId });
  } catch (error) {
    assistantResetBlocked = String(error.message).includes("Only the head coach");
  }
  assert(assistantResetBlocked, "Assistant was able to reset touches");
  team = await getTeam(headToken, teamId);
  assert(totalTouches(team.touch_tracker) === 4, "Assistant reset attempt changed touches");
  record("Assistant cannot reset touch tracker", true, { totalTouches: totalTouches(team.touch_tracker) });

  await rpc(assistantToken, "undo_team_touch", { p_team_id: teamId });
  team = await getTeam(headToken, teamId);
  assert(team.touch_tracker.counts["qa-3"] === 0 && totalTouches(team.touch_tracker) === 3 && team.touch_tracker.liveGame?.driveStepIndex === 1, "Undo failed or overwrote live game");
  record("Assistant undo removes last touch without changing drive state", true, { totalTouches: totalTouches(team.touch_tracker), driveStepIndex: team.touch_tracker.liveGame.driveStepIndex });

  await rpc(headToken, "reset_team_touches", { p_team_id: teamId });
  team = await getTeam(headToken, teamId);
  assert(totalTouches(team.touch_tracker) === 0 && team.touch_tracker.liveGame?.driveStepIndex === 1 && team.touch_tracker.gameNotes.includes("Gabe"), "Head reset did not preserve live game/notes");
  record("Head reset clears counts but preserves live game and notes", true, { totalTouches: totalTouches(team.touch_tracker), driveStepIndex: team.touch_tracker.liveGame.driveStepIndex });

  const liveGameRecap = { ...liveGame1, status: "recap", endedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await rpc(headToken, "set_team_live_game", { p_team_id: teamId, p_live_game: liveGameRecap });
  team = await getTeam(assistantToken, teamId);
  assert(team.touch_tracker.liveGame?.status === "recap" && team.touch_tracker.liveGame?.endedAt, "Recap state not visible to assistant");
  record("End game/recap state is visible to assistant", true, { status: team.touch_tracker.liveGame.status, endedAt: Boolean(team.touch_tracker.liveGame.endedAt) });

  const indexHtml = await (await fetch("https://www.coachify-app.com/", { cache: "no-store" })).text();
  assert(indexHtml.includes("v0.19.0"), "Published app version is not current enough");
  record("Published app is current enough for game-day reliability", true, {});

  return {
    stamp,
    teamId,
    results,
    failed: results.filter((item) => !item.pass).length
  };
}

try {
  const summary = await runGameDayQa();
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  record("QA harness failed", false, { message: error.message });
  console.log(JSON.stringify({ results, failed: results.filter((item) => !item.pass).length }, null, 2));
  process.exitCode = 1;
} finally {
  if (cleanup) await cleanup();
}
