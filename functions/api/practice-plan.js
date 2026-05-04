function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function extractText(response) {
  if (response.output_text) return response.output_text;

  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text" || content.type === "text")
    .map((content) => content.text || "")
    .join("\n")
    .trim();
}

const practicePlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "totalMinutes", "summary", "blocks"],
  properties: {
    title: { type: "string" },
    totalMinutes: { type: "number" },
    summary: { type: "string" },
    blocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "blockType",
          "minutes",
          "name",
          "goal",
          "setup",
          "instructions",
          "coachScript",
          "coachingPoints",
          "successLooksLike",
          "commonMistakes",
          "makeEasier",
          "makeHarder"
        ],
        properties: {
          blockType: { type: "string", enum: ["drill", "water"] },
          minutes: { type: "number" },
          name: { type: "string" },
          goal: { type: "string" },
          setup: { type: "string" },
          instructions: { type: "string" },
          coachScript: { type: "string" },
          coachingPoints: { type: "string" },
          successLooksLike: { type: "string" },
          commonMistakes: { type: "string" },
          makeEasier: { type: "string" },
          makeHarder: { type: "string" }
        }
      }
    }
  }
};

function distributeFiveMinuteBlocks(totalMinutes, blockCount) {
  const safeTotal = Math.max(15, Math.floor(Number(totalMinutes || 60) / 5) * 5);
  const safeBlockCount = Math.max(3, Math.min(6, blockCount));
  const blocks = Array.from({ length: safeBlockCount }, () => 5);
  let remaining = safeTotal - safeBlockCount * 5;
  let index = 0;

  while (remaining >= 5) {
    blocks[index % blocks.length] += 5;
    remaining -= 5;
    index += 1;
  }

  return blocks;
}

function makeDrill(minutes, name, goal, setup, instructions, coachScript, coachingPoints, successLooksLike, commonMistakes, makeEasier, makeHarder) {
  return {
    blockType: "drill",
    minutes,
    name,
    goal,
    setup,
    instructions,
    coachScript,
    coachingPoints,
    successLooksLike,
    commonMistakes,
    makeEasier,
    makeHarder
  };
}

function makeWaterBreak() {
  return {
    blockType: "water",
    minutes: 2,
    name: "Water break and reset",
    goal: "Let kids drink, breathe, and know exactly where to go next.",
    setup: "Send players to bottles. Coach stands where the next drill will start.",
    instructions: "Give kids 60-90 seconds for water, then use the last 30 seconds to point to the next starting spot.",
    coachScript: "Great work. Grab water, then jog back to me by the cones. Next we are going to go faster and cleaner.",
    coachingPoints: "Keep it moving. Praise one specific thing from the last drill and name the next focus before they scatter.",
    successLooksLike: "Players get water quickly and are back at the next drill spot before the break runs long.",
    commonMistakes: "Letting the break turn into open wandering or restarting without telling kids where to stand.",
    makeEasier: "Call one group at a time back to the field.",
    makeHarder: "Ask one player to repeat the next focus before the team starts."
  };
}

function parsePlanResponse(data, input) {
  const text = extractText(data).replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  if (!text) {
    return {
      plan: fallbackPlan(input),
      warning: "OpenAI returned an empty response, so Coachify used a built-in backup plan."
    };
  }

  try {
    return { plan: JSON.parse(text) };
  } catch (error) {
    return {
      plan: fallbackPlan(input),
      warning: "OpenAI returned a plan in an unexpected format, so Coachify used a built-in backup plan."
    };
  }
}

function fallbackPlan(input) {
  const total = Number(input.totalMinutes || 60);
  const includeWaterBreaks = Boolean(input.includeWaterBreaks);
  const drillCount = total >= 75 ? 5 : 4;
  const waterTotal = includeWaterBreaks ? (drillCount - 1) * 2 : 0;
  const drillMinutes = distributeFiveMinuteBlocks(Math.max(15, total - waterTotal), drillCount);
  const focus = input.focus || "team fundamentals";
  const drills = [
    makeDrill(
      drillMinutes[0],
      "Warmup, movement, and clean ball starts",
      "Get players moving, listening, and touching the football before skill work starts.",
      "Make a rectangle with cones about 10 yards by 15 yards. Put players on one sideline with flags on. Keep one football with the coach.",
      "Players jog across, backpedal back, shuffle across, then finish with quick handoff or toss reps. Keep lines short by sending the next player as soon as the first player is halfway across.",
      "Eyes on me, fast feet, then freeze when I say freeze. We are warming up like we are about to play, not standing around.",
      "Praise effort first. Correct one thing at a time: eyes up, soft hands, or staying under control.",
      "Kids are moving most of the time, nobody waits more than a few seconds, and the group responds quickly to your voice.",
      "Lines get too long, players sprint out of control, or the coach gives too many corrections at once.",
      "Shrink the cone box and use walk-through speed.",
      "Call a color, direction, or ball command so players have to react."
    ),
    makeDrill(
      drillMinutes[1],
      "Main skill stations",
      `Build simple reps around ${focus}.`,
      "Create two or three small stations using cones. Put 3-4 players at each station if possible. Give each station one simple job.",
      "Run 45-60 second rounds. After each round, rotate groups clockwise. Demonstrate each station once before starting, then keep the reps moving.",
      "Watch me once, then we are going to get a lot of tries. Mistakes are fine. Standing around is what we are avoiding.",
      "Use short corrections: pull the flag at the hip, keep outside leverage, take the handoff belly-to-belly, or finish to the cone.",
      "Players understand where to stand, get repeated turns, and improve one visible detail by the end of the station.",
      "One station becomes confusing, kids wait in lines, or the drill is too hard before they understand the movement.",
      "Remove defenders and let players rehearse the path slowly.",
      "Add a defender, a time limit, or a scoring point for doing the skill correctly."
    ),
    makeDrill(
      drillMinutes[2],
      "Game-like team reps",
      "Connect the skill focus to what players will actually see in a game.",
      "Use a small field or half field. Put cones for the line of scrimmage and first-down target. Start with the exact player count you expect in games if you can.",
      "Walk through the first rep slowly. Then run short live reps, reset quickly, and repeat. Stop only when the whole group needs the same correction.",
      "We are practicing the game now. Know where you line up, do your job, then reset fast so everyone gets more turns.",
      "Coach the team shape more than the result. Look for spacing, angles, effort, and whether players understand their job.",
      "Players can line up faster, the focus skill shows up naturally, and reps look more like Saturday morning.",
      "The coach turns every rep into a long speech, players forget where to line up, or one player dominates every touch.",
      "Freeze before the snap and ask each player to point to their job.",
      "Keep score or require the offense/defense to execute the focus twice in a row."
    ),
    makeDrill(
      drillMinutes[3],
      "Competitive finish",
      "End with energy while reinforcing the same practice focus.",
      "Make two balanced teams. Use a small field, short end zones, and simple rules tied to the focus.",
      "Play short rounds. Rotate players quickly. Award points for the focus skill, not just touchdowns.",
      "This is the fun finish, but the same thing still matters. Show me the skill we practiced.",
      "Keep the game moving and end on a positive rep if possible. Call out specific improvements by name.",
      "Kids compete, use the practiced skill without being reminded every play, and leave practice feeling successful.",
      "The game gets too chaotic, the focus disappears, or only the strongest players are involved.",
      "Use smaller teams and walk through the first round.",
      "Add a bonus point for a clean flag pull, clean handoff, good spacing, or a new player getting involved."
    ),
    makeDrill(
      drillMinutes[4] || 10,
      "Final situation challenge",
      "Give the team one last realistic challenge so the coach can see what stuck.",
      "Set up the field exactly like a game situation: line of scrimmage, sideline boundaries, and one clear goal such as score, get a stop, or execute the focus skill.",
      "Run one short scenario at a time. Before each rep, tell players the situation. After each rep, reset quickly and swap a few players so more kids get the important role.",
      "Here is the situation. Know your spot, do your job, and then we reset fast for the next group.",
      "Look for understanding more than perfection. If the same mistake happens twice, freeze the group, show the fix, and immediately run it again.",
      "Players know the situation, line up with less help, and show the focus skill while moving at game speed.",
      "The scenario has too many rules, kids wait too long for their turn, or the coach corrects every small mistake.",
      "Make it a walk-through and remove the defense or pressure.",
      "Add a scoreboard, a clock, or one consequence such as the group must repeat the rep until the focus skill is clean."
    )
  ].slice(0, drillCount);

  const blocks = includeWaterBreaks
    ? drills.flatMap((drill, index) => (index < drills.length - 1 ? [drill, makeWaterBreak()] : [drill]))
    : drills;
  const plannedTotal = blocks.reduce((sum, block) => sum + Number(block.minutes || 0), 0);
  const wrapNote = plannedTotal < total ? ` This plan wraps ${total - plannedTotal} minutes early so drills stay in 5-minute chunks with water breaks.` : "";

  return {
    title: `${input.sport || "Team"} Practice Plan`,
    totalMinutes: plannedTotal,
    summary: `Focused on ${focus}.${wrapNote}`,
    blocks
  };
}

function buildPracticePrompt(input) {
  const drillMix = input.drillMix || "mix";
  const recentPlans = Array.isArray(input.recentPlans) ? input.recentPlans.slice(0, 4) : [];
  const rosterSize = Number(input.team?.roster?.totalPlayers || input.team?.rosterSize || 0);
  const fullRosterSize = Number(input.team?.roster?.fullRosterSize || input.team?.fullRosterSize || rosterSize || 0);
  const playerNames = Array.isArray(input.team?.roster?.names) ? input.team.roster.names.filter(Boolean) : [];
  const playerCountText = rosterSize > 0 ? `${rosterSize}` : "unknown";
  const groupHint =
    rosterSize > 0
      ? `Design every drill for exactly ${rosterSize} players total. If the drill uses lines, stations, partners, or offense/defense groups, specify how to split ${rosterSize} players so no one is left unassigned.`
      : "If exact roster size is unknown, give a flexible setup that works for small youth teams and says how to adjust for fewer players.";
  const recentDrillLines = recentPlans
    .flatMap((plan) =>
      (plan.drills || []).map((drill) => `- ${drill.name}: ${drill.goal || "No goal listed"} (${plan.title || "recent plan"})`)
    )
    .slice(0, 18)
    .join("\n");
  const mixInstruction =
    drillMix === "repeat"
      ? "Prioritize repeating 2-4 useful drills from the recent drill list, but adjust coaching points, difficulty, or progression to match today's focus. Do not copy an entire old practice plan."
      : drillMix === "new"
        ? "Prioritize new drill names, setups, and progressions. Avoid reusing drills from the recent drill list unless one is clearly essential."
        : "Use a healthy mix: repeat 1-2 useful familiar drills from the recent drill list and introduce 2-4 fresh drills or fresh progressions.";

  return `
Create a youth sports practice plan as JSON only.

Sport: ${input.sport}
Practice length: ${input.totalMinutes} minutes
Include 2-minute water breaks between drills: ${input.includeWaterBreaks ? "yes" : "no"}
Team: ${input.team?.name || "Team"} (${input.team?.divisionName || "division unknown"}, ${input.team?.playersOnField || "unknown"} on field, ${fullRosterSize || "unknown"} on full roster)
Expected kids at this practice: ${playerCountText} players${fullRosterSize && rosterSize && fullRosterSize !== rosterSize ? ` out of ${fullRosterSize} rostered` : ""}${playerNames.length ? ` (${playerNames.join(", ")})` : ""}
Coach focus: ${input.focus}
Drill mix preference: ${drillMix}
Space/equipment: ${input.equipment || "not specified"}
Recent drills for this team:
${recentDrillLines || "- No recent drills saved yet."}

Return exactly this JSON shape:
{
  "title": "string",
  "totalMinutes": number,
  "summary": "string",
  "blocks": [
    {
      "blockType": "drill",
      "minutes": number,
      "name": "string",
      "goal": "string",
      "setup": "string",
      "instructions": "string",
      "coachScript": "string",
      "coachingPoints": "string",
      "successLooksLike": "string",
      "commonMistakes": "string",
      "makeEasier": "string",
      "makeHarder": "string"
    }
  ]
}

Rules:
- Assume the coach is a brand-new volunteer who has never run these drills before.
- Drill blocks must use 5-minute increments only.
- If water breaks are requested, insert a separate {"blockType":"water"} 2-minute block between drill blocks only. Do not put water before the first drill or after the last drill.
- Count water breaks in totalMinutes.
- If the requested practice length cannot be matched exactly with 5-minute drill blocks plus 2-minute water breaks, use the closest total below the requested time and mention the early wrap in the summary.
- Use 4-6 drill blocks, plus water breaks if requested.
- Follow the drill mix preference: ${mixInstruction}
- Player-count rule: ${groupHint}
- Treat the expected practice count as the real number for today's drills. Do not design around the full roster if fewer kids are expected.
- Do not recommend drill formats that require more players than the roster has. Avoid phrases like "split into four teams of four" unless the roster size supports it.
- If a drill needs offense vs defense, design it for the actual roster count; examples: with 10 players use 5v5, two 5-player stations, or one group active while one group rotates in. With 8 players use 4v4 or two groups of 4.
- For each drill, explain exactly where players stand, what the coach says, how reps flow, how to rotate lines/groups, and what success looks like.
- Avoid unexplained coaching jargon. If you use a term like leverage, contain, route, or pursuit angle, explain what the coach should tell the kids to do.
- Use big-energy, age-appropriate language.
- Make it practical for a field, cones, flags, and footballs.
`;
}

async function generatePracticePlan(input, env) {
  const prompt = buildPracticePrompt(input);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-5-mini",
        input: prompt,
        max_output_tokens: 3200,
        text: {
          format: {
            type: "json_schema",
            name: "practice_plan",
            strict: true,
            schema: practicePlanSchema
          }
        },
        store: false
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || "OpenAI request failed.");
    }

    return parsePlanResponse(data, input);
  } catch (error) {
    return {
      plan: fallbackPlan(input),
      warning: "AI plan generation hit a temporary issue, so Coachify used a built-in backup plan."
    };
  }
}

function supabaseConfig(env) {
  return {
    url: env.SUPABASE_URL || "https://uyquscyllwfykylbypzs.supabase.co",
    key: env.SUPABASE_ANON_KEY || env.SUPABASE_KEY || "sb_publishable_mHS5AD4JIHTOWevqBB3LGg_XuT5IVq0"
  };
}

function cleanPracticeInput(input) {
  const rest = { ...input };
  delete rest.async;
  delete rest.planId;
  delete rest.teamCloudId;
  delete rest.completeExisting;
  return rest;
}

async function responseErrorMessage(response, fallback) {
  const text = await response.text().catch(() => "");
  if (!text) return fallback;

  try {
    const data = JSON.parse(text);
    const message = data.error?.message || data.message || data.error || fallback;
    if (String(message).includes("teams.practice_plans")) {
      return "Practice plan storage is not set up yet. In Supabase, run supabase_practice_plans.sql, then try again.";
    }
    return message;
  } catch (error) {
    const preview = text.replace(/\s+/g, " ").slice(0, 240);
    return preview ? `${fallback} ${preview}` : fallback;
  }
}

async function mutatePracticePlans(input, env, authHeader, mutatePlan) {
  const { url, key } = supabaseConfig(env);
  const teamId = encodeURIComponent(input.teamCloudId);
  const headers = {
    apikey: key,
    Authorization: authHeader,
    "Content-Type": "application/json"
  };

  const readResponse = await fetch(`${url}/rest/v1/teams?id=eq.${teamId}&select=practice_plans`, {
    headers
  });
  if (!readResponse.ok) {
    throw new Error(await responseErrorMessage(readResponse, "Could not load team practice plans."));
  }

  const rows = await readResponse.json();
  const currentPlans = Array.isArray(rows?.[0]?.practice_plans) ? rows[0].practice_plans : [];
  const existingIndex = currentPlans.findIndex((plan) => plan.id === input.planId);
  const existingPlan = existingIndex >= 0 ? currentPlans[existingIndex] : null;
  const nextPlan = mutatePlan(existingPlan);
  const nextPlans =
    existingIndex >= 0
      ? currentPlans.map((plan, index) => (index === existingIndex ? nextPlan : plan))
      : [nextPlan, ...currentPlans];

  const updateResponse = await fetch(`${url}/rest/v1/teams?id=eq.${teamId}`, {
    method: "PATCH",
    headers: {
      ...headers,
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      practice_plans: nextPlans.slice(0, 20)
    })
  });

  if (!updateResponse.ok) {
    throw new Error(await responseErrorMessage(updateResponse, "Could not save completed practice plan."));
  }
}

async function completePracticePlanInBackground(input, env, authHeader) {
  try {
    const result = await generatePracticePlan(input, env);
    const now = new Date().toISOString();
    await mutatePracticePlans(input, env, authHeader, (existingPlan) => ({
      ...(result.plan || fallbackPlan(input)),
      id: input.planId,
      title: existingPlan?.title || input.practiceName || result.plan?.title || `${input.sport || "Team"} Practice Plan`,
      status: "ready",
      createdAt: existingPlan?.createdAt || now,
      updatedAt: now,
      request: existingPlan?.request || cleanPracticeInput(input),
      warning: result.warning || null
    }));
  } catch (error) {
    const now = new Date().toISOString();
    try {
      await mutatePracticePlans(input, env, authHeader, (existingPlan) => ({
        ...(existingPlan || {
          id: input.planId,
          title: `${input.sport || "Team"} Practice Plan`,
          totalMinutes: Number(input.totalMinutes || 0),
          summary: `Building a plan focused on ${input.focus || "team fundamentals"}.`,
          blocks: [],
          request: cleanPracticeInput(input),
          createdAt: now
        }),
        status: "failed",
        error: error.message || "Coachify could not finish this plan.",
        updatedAt: now
      }));
    } catch (saveError) {
      console.error("Could not mark background practice plan as failed", saveError);
    }
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  let input;
  try {
    input = await request.json();
  } catch (error) {
    return jsonResponse({ error: "Could not read practice plan request." }, 400);
  }

  if (!input.focus || !input.totalMinutes) {
    return jsonResponse({ error: "Practice length and focus are required." }, 400);
  }

  if (!env.OPENAI_API_KEY) {
    return jsonResponse({
      error: "AI is not connected yet. Add OPENAI_API_KEY in Cloudflare Pages environment variables."
    }, 500);
  }

  if (input.async) {
    const authHeader = request.headers.get("Authorization");
    if (!input.planId || !input.teamCloudId || !authHeader) {
      return jsonResponse({ error: "Background practice plans need a team, plan id, and signed-in coach." }, 400);
    }

    const backgroundTask = completePracticePlanInBackground(input, env, authHeader);
    if (waitUntil) {
      waitUntil(backgroundTask);
    } else {
      backgroundTask.catch(() => {});
    }

    return jsonResponse({ queued: true, planId: input.planId }, 202);
  }

  if (input.completeExisting) {
    const authHeader = request.headers.get("Authorization");
    if (!input.planId || !input.teamCloudId || !authHeader) {
      return jsonResponse({ error: "Practice plan resume needs a team, plan id, and signed-in coach." }, 400);
    }

    try {
      const result = await generatePracticePlan(input, env);
      const now = new Date().toISOString();
      await mutatePracticePlans(input, env, authHeader, (existingPlan) => ({
        ...(result.plan || fallbackPlan(input)),
        id: input.planId,
        title: existingPlan?.title || input.practiceName || result.plan?.title || `${input.sport || "Team"} Practice Plan`,
        status: "ready",
        createdAt: existingPlan?.createdAt || now,
        updatedAt: now,
        request: existingPlan?.request || cleanPracticeInput(input),
        warning: result.warning || null
      }));

      return jsonResponse({
        completed: true,
        planId: input.planId,
        warning: result.warning || null
      });
    } catch (error) {
      const now = new Date().toISOString();
      try {
        await mutatePracticePlans(input, env, authHeader, (existingPlan) => ({
          ...(existingPlan || {
            id: input.planId,
            title: `${input.sport || "Team"} Practice Plan`,
            totalMinutes: Number(input.totalMinutes || 0),
            summary: `Building a plan focused on ${input.focus || "team fundamentals"}.`,
            blocks: [],
            request: cleanPracticeInput(input),
            createdAt: now
          }),
          status: "failed",
          error: error.message || "Coachify could not resume this practice plan.",
          updatedAt: now
        }));
      } catch (saveError) {
        console.error("Could not mark resumed practice plan as failed", saveError);
      }

      return jsonResponse({
        error: error.message || "Coachify could not resume this practice plan."
      }, 500);
    }
  }

  return jsonResponse(await generatePracticePlan(input, env));
}
