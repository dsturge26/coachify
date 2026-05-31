// COACHIFY LITE — cross-client SYNC test.
//
// This is the test that yesterday's failure proved we needed. The old suites
// wrote to the DB and read it back from the SAME client. They never verified
// that a SECOND phone actually SEES the first phone's changes. This does.
//
// It simulates two real phones: a head coach and an assistant, each a separate
// authenticated client. The assistant ONLY ever learns about changes by
// polling the team row (exactly what the Lite app does — no realtime). We
// assert the assistant observes every head-coach action within the poll window.

const SUPABASE_URL = "https://uyquscyllwfykylbypzs.supabase.co";
const SUPABASE_KEY = "sb_publishable_mHS5AD4JIHTOWevqBB3LGg_XuT5IVq0";
const POLL_MS = 2000;
const SYNC_DEADLINE_MS = 6000; // assistant must see a change within this long

const results = [];
let cleanup = null;
const record = (name, pass, details = {}) => results.push({ name, pass, details });
const assert = (c, m) => { if (!c) throw new Error(m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function sbFetch(path, { token, method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token || SUPABASE_KEY}`,
               "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  return data;
}
async function signUpOrIn(email, password) {
  try { const s = await sbFetch("/auth/v1/signup", { method:"POST", body:{ email, password } }); if (s?.access_token) return s; } catch {}
  return sbFetch("/auth/v1/token?grant_type=password", { method:"POST", body:{ email, password } });
}
async function rpc(token, name, body) { return sbFetch(`/rest/v1/rpc/${name}`, { token, method:"POST", body }); }
async function getTeam(token, id) { return (await sbFetch(`/rest/v1/teams?id=eq.${id}&select=*`, { token }))[0]; }
function totalTouches(t) { return Object.values(t?.counts || {}).reduce((s,c)=>s+Number(c||0),0); }

// The assistant "phone": only sees state via this poll, never via the write itself.
async function pollUntil(token, teamId, predicate, label) {
  const start = Date.now();
  while (Date.now() - start < SYNC_DEADLINE_MS) {
    const team = await getTeam(token, teamId);
    if (predicate(team)) return { team, ms: Date.now() - start };
    await sleep(POLL_MS / 2);
  }
  throw new Error(`Assistant never observed: ${label} (within ${SYNC_DEADLINE_MS}ms of polling)`);
}

async function run() {
  const stamp = Date.now().toString().slice(-7);
  const pw = `LiteSync-${stamp}-${Math.random().toString(36).slice(2)}!`;
  const head = await signUpOrIn(`lite-head-${stamp}@coachify-app.com`, pw);
  const asst = await signUpOrIn(`lite-asst-${stamp}@coachify-app.com`, pw);
  const H = head.access_token, A = asst.access_token;

  const teamId = await rpc(H, "create_team_as_head", { p_name:`Lite ${stamp}`, p_division_id:"boys-6u" });
  cleanup = async () => { try { await sbFetch(`/rest/v1/teams?id=eq.${teamId}`, { token:H, method:"DELETE", headers:{Prefer:"return=minimal"} }); } catch {} };

  const roster = ["A","B","C","D","E","F"].map((n,i)=>({ id:`p-${i+1}`, name:n, jersey:String(i+1) }));
  await sbFetch(`/rest/v1/teams?id=eq.${teamId}`, { token:H, method:"PATCH", headers:{Prefer:"return=minimal"},
    body:{ roster, attendance:roster.map(p=>p.id), touch_tracker:{counts:{},history:[],liveGame:null} } });

  // assistant joins (second phone)
  await sbFetch("/rest/v1/team_members", { token:A, method:"POST", headers:{Prefer:"return=minimal"},
    body:{ team_id:teamId, user_id:asst.user.id, role:"assistant" } });

  // TEST 1: assistant can read the team at all (membership + RLS)
  const seen = await getTeam(A, teamId);
  assert(seen && seen.roster.length === 6, "Assistant cannot read shared team");
  record("Assistant phone can load the shared team", true, { players: seen.roster.length });

  // TEST 2: head starts live game -> assistant sees 'live' by polling
  const lg = { id:`g-${stamp}`, status:"live", startedAt:new Date().toISOString(), driveStepIndex:0, updatedAt:new Date().toISOString() };
  await rpc(H, "set_team_live_game", { p_team_id:teamId, p_live_game:lg });
  const r2 = await pollUntil(A, teamId, t => t.touch_tracker?.liveGame?.status === "live", "live game start");
  record("Assistant sees the game go LIVE via polling", true, { observedInMs: r2.ms });

  // TEST 3: head advances drive 0 -> 3 -> assistant sees current drive (THE failure yesterday)
  for (const step of [1,2,3]) {
    await rpc(H, "set_team_live_game", { p_team_id:teamId, p_live_game:{ ...lg, driveStepIndex:step, updatedAt:new Date().toISOString() } });
  }
  const r3 = await pollUntil(A, teamId, t => t.touch_tracker?.liveGame?.driveStepIndex === 3, "drive advanced to 3");
  record("Assistant sees the CURRENT DRIVE update via polling", true, { drive: 3, observedInMs: r3.ms });

  // TEST 4: head taps touches -> assistant sees the counts climb (THE other failure)
  await rpc(H, "add_team_touch", { p_team_id:teamId, p_player_id:"p-1" });
  await rpc(H, "add_team_touch", { p_team_id:teamId, p_player_id:"p-1" });
  await rpc(H, "add_team_touch", { p_team_id:teamId, p_player_id:"p-2" });
  const r4 = await pollUntil(A, teamId, t => totalTouches(t.touch_tracker) === 3, "touch count reaches 3");
  record("Assistant sees TOUCH TRACKER sync via polling", true, { total: 3, observedInMs: r4.ms });

  // TEST 5: BIDIRECTIONAL — assistant taps, head sees it
  await rpc(A, "add_team_touch", { p_team_id:teamId, p_player_id:"p-3" });
  const r5 = await pollUntil(H, teamId, t => (t.touch_tracker?.counts?.["p-3"]||0) === 1, "assistant's touch on head phone");
  record("Head sees the ASSISTANT's touch via polling (bidirectional)", true, { observedInMs: r5.ms });

  // TEST 6: simultaneous taps from both phones, nothing lost (locked RPC)
  const before = totalTouches((await getTeam(H, teamId)).touch_tracker);
  await Promise.all([
    ...Array.from({length:10}, (_,i)=>rpc(H,"add_team_touch",{p_team_id:teamId,p_player_id:`p-${(i%6)+1}`})),
    ...Array.from({length:10}, (_,i)=>rpc(A,"add_team_touch",{p_team_id:teamId,p_player_id:`p-${(i%6)+1}`})),
  ]);
  const after = totalTouches((await getTeam(H, teamId)).touch_tracker);
  assert(after === before + 20, `Lost touches under concurrent taps: expected ${before+20}, got ${after}`);
  record("20 simultaneous taps from both phones: none lost", true, { before, after });

  return { stamp, teamId, results, failed: results.filter(r=>!r.pass).length };
}

try {
  const summary = await run();
  console.log(JSON.stringify(summary, null, 2));
} catch (e) {
  record("Lite sync harness failed", false, { message: e.message });
  console.log(JSON.stringify({ results, failed: results.filter(r=>!r.pass).length }, null, 2));
  process.exitCode = 1;
} finally { if (cleanup) await cleanup(); }
