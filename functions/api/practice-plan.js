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
    return { plan: ensurePracticePlanQuality(JSON.parse(text), input) };
  } catch (error) {
    return {
      plan: fallbackPlan(input),
      warning: "OpenAI returned a plan in an unexpected format, so Coachify used a built-in backup plan."
    };
  }
}

function seededIndex(seed, length, offset = 0) {
  const text = String(seed || "coachify");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index) + offset) >>> 0;
  }
  return length ? hash % length : 0;
}

function pickSeeded(items, seed, offset = 0) {
  return items[seededIndex(seed, items.length, offset)];
}

function focusLabel(focus) {
  const cleaned = String(focus || "team fundamentals").trim();
  return cleaned.length > 46 ? `${cleaned.slice(0, 43)}...` : cleaned;
}

function normalizedFocusText(input) {
  return String(input?.focus || "").toLowerCase();
}

function practicePlayerCount(input) {
  return Math.max(
    1,
    Number(
      input?.team?.roster?.totalPlayers ||
        input?.expectedKids ||
        input?.team?.rosterSize ||
        input?.team?.fullRosterSize ||
        input?.team?.roster?.fullRosterSize ||
        8
    )
  );
}

function stationPlan(count) {
  if (count >= 10) return `Split ${count} players into two stations of ${Math.floor(count / 2)} and ${Math.ceil(count / 2)}. Put one assistant at each station if available.`;
  if (count === 9) return "Split 9 players into one station of 5 and one station of 4. The group of 5 has the extra player as the next runner.";
  if (count === 8) return "Split 8 players into two stations of 4. Each station has one active runner, one active defender/helper, and two waiting with toes on the start cone.";
  if (count === 7) return "Split 7 players into one station of 4 and one station of 3. The group of 3 rotates runner, defender, and next-up.";
  if (count === 6) return "Use one station of 6 with two active players and four waiting on a knee behind the start cone.";
  if (count === 5) return "Use one station of 5 with two active players, two next-up players, and one quick helper who rotates every rep.";
  return `Use one small station for all ${count} players. Keep two active and rotate every rep so no one stands for long.`;
}

function focusThemes(input) {
  const focus = normalizedFocusText(input);
  const themes = [];
  const add = (theme) => {
    if (!themes.includes(theme)) themes.push(theme);
  };

  if (/flag|pull|tackle|hip|swipe/.test(focus)) add("flagPulling");
  if (/handoff|exchange|fake|mesh|alligator|belly/.test(focus)) add("handoffs");
  if (/snap|center|qb|quarterback/.test(focus)) add("snaps");
  if (/catch|route|receiver|wr|pass/.test(focus)) add("catching");
  if (/contain|edge|sideline|defense|spacing|pursuit|outside/.test(focus)) add("contain");
  if (/confidence|shy|touch|involve|nervous/.test(focus)) add("confidence");
  if (!themes.length) themes.push("flagPulling", "handoffs", "contain");
  return themes;
}

function concreteThemeDrill(theme, minutes, input, seed, offset) {
  const count = practicePlayerCount(input);
  const stations = stationPlan(count);
  const focus = input.focus || "today's focus";
  const names = {
    flagPulling: ["Hip Tap to Live Pull Alley", "Belly Button Breakdown Alley", "Two-Hand Flag Finish"],
    handoffs: ["Belly Pocket Edge Race", "Clamp and Go Handoff Alley", "No-Crash Handoff Lane"],
    snaps: ["Snap-Set-Go Relay", "Clean Snap Launch Lines", "Center-QB Start Circuit"],
    catching: ["Cone Break Catch-and-Go", "Hands-Ready Finish Routes", "Turn, Catch, Score Lines"],
    contain: ["Sideline Fence Contain", "Outside Shoulder Funnel", "Edge Wall 1v1"],
    confidence: ["Every Kid Finish Line", "One Touch Score Parade", "Confidence Touch Gauntlet"]
  };
  const name = pickSeeded(names[theme] || names.flagPulling, seed, offset);

  const templates = {
    flagPulling: makeDrill(
      minutes,
      name,
      "Teach defenders to get their body in front, aim at the hips, and pull with two hands instead of swiping from the side.",
      `${stations} At each station, make a 5-yard wide by 8-yard long alley with cones. Runner starts with a football on one end line. Defender starts 3 yards away in the middle of the alley. Waiting players stand behind the runner cone so they can see the rep.`,
      "First 3 reps are hip taps: flags are dead and the defender must shuffle into position and touch both hands to the runner's hips. After that, go live: runner tries to cross the far cone line, defender pulls one flag. Rotate runner to defender, defender to the back of the line, next player becomes runner.",
      "Laser eyes on the belly button. Loud feet. Two hands on the hips, then grab the top of the flag.",
      "Stop the first rep and show the body position: chest in front, knees bent, hands near hips. Praise feet before the pull. If kids swipe, go back to hip taps for two reps.",
      "Defenders square up, get close enough to touch hips, and pull flags without diving or crashing.",
      "Kids chase from behind, reach with one arm, or look at the flag instead of the runner's hips.",
      "Make the alley narrower and keep flags dead with hip taps only.",
      "Give the runner one cut inside the alley or award a point only for a clean two-hand pull."
    ),
    handoffs: makeDrill(
      minutes,
      name,
      "Build clean handoffs at full speed without backfield collisions.",
      `${stations} At each station, place a QB cone, a runner cone 2 yards beside the QB, and a finish cone 8-10 yards outside. One player is QB, one is runner, one is next QB, and the rest wait behind the runner cone.`,
      "Runner starts on the coach's clap and runs across the QB's belly. QB opens the belly button toward the runner and places the ball into the pocket. Runner clamps the ball with two hands and races to the finish cone. Rotate QB to runner, runner to the back, next player to QB.",
      "Pocket ready. Belly to belly. Clamp it, then race.",
      "Stand behind the QB cone so you can see the exchange. Correct only one thing at a time: runner path, QB ball placement, or clamp. Reset immediately after each rep.",
      "The runner stays on path, the QB does not chase, and the ball is secure before the sprint.",
      "Runner curves too deep, QB reaches late, or both kids stop and bump into each other.",
      "Walk the runner path once with no ball, then add the ball at half speed.",
      "Add a coach or cone defender at the edge so the runner must secure the handoff and race outside."
    ),
    snaps: makeDrill(
      minutes,
      name,
      "Make the center-QB exchange clean enough that the play can start fast.",
      `${stations} Use one line-of-scrimmage cone at each station. Put center on the cone, QB 2 yards behind, and a finish cone 5 yards away. Waiting players make a short line behind center.`,
      "Center snaps to QB. QB freezes the ball to chest for one count, then runs to the finish cone or hands to the next player. After each rep: center becomes QB, QB goes to the back, next player becomes center.",
      "Quiet ball, strong hands, eyes up, go.",
      "Coach the start only. If the snap is low, tell center to aim for the QB's hands. If QB bobbles, tell QB to show a big target and clamp the ball.",
      "The ball gets from center to QB without hitting the ground, and the next action starts within two seconds.",
      "Centers rush the snap, QBs look away early, or the line gets long and slow.",
      "Use underhand toss snaps from closer distance for two clean reps.",
      "Add a 5-second play clock: snap, secure, and finish before the count ends."
    ),
    catching: makeDrill(
      minutes,
      name,
      "Help receivers know where to run, when to turn, and how to finish after the catch.",
      `${stations} At each station, set a start cone, break cone 5 yards away, and catch cone 3 yards past the break. Coach or QB stands inside with the ball. Waiting players stand at the start cone.`,
      "Receiver runs to the break cone, turns chest and eyes back to the passer, shows hands, catches, then sprints through the catch cone. Rotate quickly: receiver retrieves ball, hands it back, and joins the line.",
      "Run to the cone. Snap eyes back. Show hands. Finish forward.",
      "Do not overcoach route names. Teach the body picture: run, turn, hands, finish. For younger kids, make every route a simple cone job.",
      "Players turn around on time, show hands, and run after the catch instead of stopping.",
      "Receivers drift, turn too early, or catch and freeze.",
      "Shorten the route and use soft coach tosses.",
      "Add a defender cone they must run past after the catch or require two catches in a row before rotating."
    ),
    contain: makeDrill(
      minutes,
      name,
      "Teach outside defenders to protect the sideline and force runners back inside.",
      `${stations} Use the actual sideline as one boundary. Make an 8-yard lane with cones. Runner starts inside the lane with the ball. Defender starts 3 yards inside and slightly ahead, with outside shoulder toward the sideline.`,
      "Runner tries to win the sideline. Defender must beat the runner to the outside cone, stay between runner and sideline, and force the runner back inside before pulling the flag. Rotate runner to defender, defender to line.",
      "Sideline is ours. Stay outside. Make them turn in.",
      "Stand at the sideline and point to the boundary before every rep. Praise the angle even if the flag pull is missed. The first win is denying the outside.",
      "Defenders keep outside leverage, runners get funneled inward, and flag pulls happen after the runner turns back.",
      "Defenders chase from behind, cross inside too early, or give up the sideline.",
      "Start the defender one step closer to the sideline and slow the runner down.",
      "Let the runner make one cut or add a second helper inside so the defense learns funnel and finish."
    ),
    confidence: makeDrill(
      minutes,
      name,
      "Get every player a simple successful touch and a clear finish.",
      `${stations} Set one start cone and one score cone 8 yards away at each station. Coach or QB has the ball. Waiting players line up at the start cone with flags on.`,
      "Each player gets one clean touch: handoff, short toss, or quick pass based on what they can handle. After the touch, they sprint through the score cone and high-five the next player. Rotate fast so every kid gets multiple finishes.",
      "One clean touch. Clamp it. Go score.",
      "Start with the easiest touch for nervous players. Make success loud and specific: name the kid and the thing they did well. Keep the line moving.",
      "Every player gets touches, finishes forward, and looks more comfortable by the end of the block.",
      "The strongest players take extra turns, nervous kids hide, or the coach makes the touch too hard too soon.",
      "Use handoffs only and shorten the finish cone.",
      "Let players choose catch or handoff, then add a coach defender who jogs behind them."
    )
  };

  return templates[theme] || templates.flagPulling;
}

function vaguePracticeBlock(block) {
  if (!block || block.blockType === "water") return false;
  const text = [block.name, block.goal, block.setup, block.instructions, block.coachingPoints, block.successLooksLike, block.commonMistakes].join(" ").toLowerCase();
  const vaguePhrases = [
    "small-group coach checkpoints",
    "teach-rep-reset",
    "create small working groups",
    "one clear job tied to the focus",
    "run short rounds",
    "players understand where to stand",
    "main practice focus",
    "game job lab",
    "station circuit",
    "coach checkpoint drill",
    "fast-reset reps",
    "add a defender, a time limit",
    "practice the focus"
  ];
  const hasVaguePhrase = vaguePhrases.some((phrase) => text.includes(phrase));
  const hasFieldDetail = /\b(\d+|yard|cone|sideline|line of scrimmage|qb|center|runner|defender|station)\b/.test(text);
  const hasRotation = /\b(rotate|rotation|next|switch|becomes|back of the line|line)\b/.test(text);
  return hasVaguePhrase || !hasFieldDetail || !hasRotation || String(block.setup || "").length < 70 || String(block.instructions || "").length < 70;
}

function ensurePracticePlanQuality(plan, input) {
  if (!plan || !Array.isArray(plan.blocks) || !plan.blocks.length) return fallbackPlan(input);
  const drillBlocks = plan.blocks.filter((block) => block.blockType !== "water");
  const weakBlocks = drillBlocks.filter(vaguePracticeBlock);
  if (weakBlocks.length) return fallbackPlan(input);
  return plan;
}

function listLines(items) {
  return Array.isArray(items) && items.length ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

function coachingProfilePrompt(profile) {
  if (!profile) return "No saved team coaching profile.";

  return `
Profile summary: ${profile.summary || "No summary"}
Roster notes:
${listLines(profile.rosterNotes)}
Coach preferences:
${listLines(profile.coachPreferences)}
Avoid:
${listLines(profile.avoid)}
Favorite cues:
${listLines(profile.cues)}
Useful drills and concepts:
${listLines(profile.favoriteConcepts)}
Guardrails:
${listLines(profile.guardrails)}
`;
}

function coachingReferencesPrompt(profiles) {
  if (!Array.isArray(profiles) || !profiles.length) return "No saved coaching references.";

  return profiles
    .slice(0, 4)
    .map(
      (profile) => `
Reference: ${profile.sourceTeam || profile.id || "Coachify example"}
Summary: ${profile.summary || "No summary"}
Helpful patterns:
${listLines(profile.favoriteConcepts)}
Cues:
${listLines(profile.cues)}
Guardrails:
${listLines(profile.guardrails)}
Avoid:
${listLines(profile.avoid)}
`
    )
    .join("\n");
}

function fallbackPlan(input) {
  const total = Number(input.totalMinutes || 60);
  const includeWaterBreaks = Boolean(input.includeWaterBreaks);
  const drillCount = total >= 75 ? 5 : 4;
  const waterTotal = includeWaterBreaks ? (drillCount - 1) * 2 : 0;
  const warmupMinutes = 5;
  const drillMinutes = [warmupMinutes, ...distributeFiveMinuteBlocks(Math.max(15, total - waterTotal - warmupMinutes), drillCount - 1)];
  const focus = input.focus || "team fundamentals";
  const seed = input.variationSeed || `${focus}-${Date.now()}`;
  const themes = focusThemes(input);
  const warmupName = pickSeeded(
    [
      "Traffic Light Movement Prep",
      "Cone Color Reaction Warmup",
      "Sideline Sprint-Shuffle Reset",
      "Freeze-Go Athletic Prep",
      "Mirror Feet Warmup",
      "Coach Call Movement Prep"
    ],
    seed,
    1
  );
  const drills = [
    makeDrill(
      drillMinutes[0],
      warmupName,
      "Get players moving, listening, and ready before the real drill work starts.",
      "Make a small rectangle with cones. Put every player on one sideline with flags on. No footballs are needed for this block.",
      "Players jog across, backpedal back, shuffle across, and finish with two quick freeze-and-go reactions. Keep it fast and simple.",
      "Eyes on me, fast feet, freeze on my voice, then go again.",
      "This is only a warmup. Do not teach the main skill here. Use it to get bodies moving and attention locked in.",
      "Kids are warm, listening, and ready for the first real drill.",
      "Letting the warmup turn into a long drill or adding too many coaching points.",
      "Shrink the cone box and use walk-through speed.",
      "Call a color, direction, or ball command so players have to react."
    ),
    ...Array.from({ length: drillCount - 1 }, (_, index) =>
      concreteThemeDrill(themes[index % themes.length], drillMinutes[index + 1] || 10, input, seed, index + 2)
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
  const practiceBlueprint = input.practiceBlueprint || "small-group coach checkpoints with quick teach-rep-reset cycles";
  const variationSeed = input.variationSeed || `${Date.now()}`;
  const coachingProfile = input.coachingProfile || input.team?.coachingProfile || null;
  const coachingReferences = Array.isArray(input.coachingReferences) ? input.coachingReferences : [];
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
  const recentDrillNames = recentPlans
    .flatMap((plan) => (plan.drills || []).map((drill) => drill.name).filter(Boolean))
    .slice(0, 18)
    .join(", ");
  const recentPlanShapes = recentPlans
    .map((plan) => (plan.drills || []).map((drill) => drill.name).filter(Boolean).slice(0, 5).join(" > "))
    .filter(Boolean)
    .slice(0, 4)
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
Practice blueprint for this request: ${practiceBlueprint}
Variation seed for novelty: ${variationSeed}
Space/equipment: ${input.equipment || "not specified"}
Recent drills for this team:
${recentDrillLines || "- No recent drills saved yet."}
Recent drill names to consider:
${recentDrillNames || "None"}
Recent practice shapes:
${recentPlanShapes || "None"}
Team coaching profile:
${coachingProfilePrompt(coachingProfile)}
Coachify coaching reference library:
${coachingReferencesPrompt(coachingReferences)}

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
- If a team coaching profile is provided, treat it as the strongest source of context. The plan should feel like it was written for that team, not a generic team.
- Use the Coachify coaching reference library for all flag football teams, even when the selected team is a different age group or division. Borrow patterns, cues, constraints, and drill concepts when they fit the roster count, age, and focus.
- Do not copy a reference blindly. Adapt it to the selected team's age, player count, practice length, and requested focus.
- This must feel customized to today's exact focus, roster count, equipment, and practice blueprint. Do not give a generic practice template.
- A coach should be able to walk onto the field and run the drill from the card without inventing missing details.
- Each drill setup must include: cone layout or field landmark, approximate distance/size, exact starting spots, and how to split the expected player count.
- Each drill instructions field must include: what happens on the coach's command, what one rep looks like, and exactly how players rotate after the rep.
- Each coachScript must be a real sentence the coach can say out loud to kids. Do not write strategy notes there.
- Each coachingPoints field must tell the coach what to watch with their eyes and what single correction to make first.
- Ban vague filler. Do not use phrases like "use small-group coach checkpoints", "quick teach-rep-reset cycles", "create small working groups", "one clear job tied to the focus", "run short rounds", "practice the focus", "game-like reps", or "players understand where to stand".
- If you cannot picture where every player is standing before the rep starts, the drill is not specific enough. Rewrite it before returning JSON.
- The whole practice should visibly follow this blueprint: ${practiceBlueprint}.
- Use the variation seed to choose different drill names, setups, scoring rules, and progressions than another request with the same focus.
- Drill blocks must use 5-minute increments only.
- If water breaks are requested, insert a separate {"blockType":"water"} 2-minute block between drill blocks only. Do not put water before the first drill or after the last drill.
- Count water breaks in totalMinutes.
- If the requested practice length cannot be matched exactly with 5-minute drill blocks plus 2-minute water breaks, use the closest total below the requested time and mention the early wrap in the summary.
- Use 4-6 drill blocks, plus water breaks if requested.
- The first drill block must be a standalone 5-minute warmup-only block with a specific name. Do not name it "Dynamic warmup" unless no other name fits.
- Do not bundle the warmup with catching, handoffs, routes, flag pulling, ball touches, or the coach's main focus. The warmup should only prepare bodies and attention.
- Vary the warmup setup from plan to plan. It can be reaction movement, mirror feet, cone colors, freeze-go, short shuffles, or coach-call movement, but it may not become the main skill drill.
- The second drill block must be a unique focused skill drill for the coach's main focus. It should not be named "warmup" and should not repeat the warmup setup.
- No warmup block may be longer than 5 minutes unless the total practice length is 90 minutes or more, and even then it may not exceed 10 minutes.
- Follow the drill mix preference: ${mixInstruction}
- Avoid generic block names like "Main skill focus", "Game-like team reps", "Competitive finish", "Focused skill drill", "Skill stations", or "Scrimmage". Use specific, coach-friendly drill names.
- If drill mix is "new", do not reuse names from the recent drill list. If drill mix is "mix", repeat at most one recent drill name and make the rest clearly new. If drill mix is "repeat", repeat familiar drills but change the progression, scoring, or constraint so the plan is not a copy.
- Do not reuse an entire recent practice shape. If recent plans used warmup > stations > game reps > finish, choose a different flow such as challenge ladder, coach checkpoints, scenario progression, or small-sided games.
- Every drill must have a clear unique purpose. Do not create multiple drills that are just "practice the focus with cones" using different wording.
- When the team profile includes favorite cues or concepts, use them naturally when they fit the requested focus. Do not force every favorite drill into every plan.
- For 6U teams, prefer single-step jobs, short cues, fast reps, and assistant-coach stations. Push back inside the plan if an idea would create collisions, long lines, or too much thinking.
- If the team profile asks for printable cheat-sheet style, color-coded positions, or position emojis, reflect that inside drill names, setup, coachScript, or coachingPoints where useful.
- Include assistant-coach delegation inside setup or instructions when stations are useful.
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
        max_output_tokens: 4200,
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
