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

function fallbackPlan(input) {
  const total = Number(input.totalMinutes || 60);
  const blocks = [
    {
      minutes: Math.max(5, Math.round(total * 0.15)),
      name: "Dynamic warmup and ball touches",
      setup: "Use one sideline or a small grid with cones.",
      instructions: "Move through light running, backpedal, shuffles, and short partner throws.",
      coachingPoints: "Keep kids moving, praise effort early, and watch who needs confidence.",
      makeEasier: "Shorten distances and use walk-through pace.",
      makeHarder: "Add quick reaction calls and tighter spacing."
    },
    {
      minutes: Math.max(12, Math.round(total * 0.35)),
      name: "Main skill focus",
      setup: `Build stations around: ${input.focus || "team fundamentals"}.`,
      instructions: "Run quick reps with short lines. Rotate groups every few minutes.",
      coachingPoints: "Give one correction at a time and celebrate clean reps.",
      makeEasier: "Remove defenders or slow the tempo.",
      makeHarder: "Add a defender, a time limit, or a scoring goal."
    },
    {
      minutes: Math.max(12, Math.round(total * 0.3)),
      name: "Game situation",
      setup: "Use the same field size and player count as games when possible.",
      instructions: "Run controlled game-like reps tied to the skill focus.",
      coachingPoints: "Pause only for quick teachable moments, then restart fast.",
      makeEasier: "Walk through assignments before each rep.",
      makeHarder: "Keep score and require quick decisions."
    },
    {
      minutes: Math.max(5, total - Math.max(5, Math.round(total * 0.15)) - Math.max(12, Math.round(total * 0.35)) - Math.max(12, Math.round(total * 0.3))),
      name: "Fun finish",
      setup: "Use a small field or cone box.",
      instructions: "End with a competitive relay, short scrimmage, or challenge game.",
      coachingPoints: "Finish upbeat and remind the team of the one thing they improved.",
      makeEasier: "Keep teams small and rules simple.",
      makeHarder: "Add constraints tied to the practice focus."
    }
  ];

  return {
    title: `${input.sport || "Team"} Practice Plan`,
    totalMinutes: total,
    summary: `Focused on ${input.focus || "team fundamentals"}.`,
    blocks
  };
}

export async function onRequestPost({ request, env }) {
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

  const prompt = `
Create a youth sports practice plan as JSON only.

Sport: ${input.sport}
Practice length: ${input.totalMinutes} minutes
Team: ${input.team?.name || "Team"} (${input.team?.divisionName || "division unknown"}, ${input.team?.playersOnField || "unknown"} on field, ${input.team?.rosterSize || "unknown"} players)
Coach focus: ${input.focus}
Team energy/level: ${input.energy || "mixed"}
Space/equipment: ${input.equipment || "not specified"}

Return exactly this JSON shape:
{
  "title": "string",
  "totalMinutes": number,
  "summary": "string",
  "blocks": [
    {
      "minutes": number,
      "name": "string",
      "setup": "string",
      "instructions": "string",
      "coachingPoints": "string",
      "makeEasier": "string",
      "makeHarder": "string"
    }
  ]
}

Rules:
- Total block minutes must equal the practice length.
- Include water/rest moments inside blocks when needed.
- Keep drills simple enough for volunteer youth coaches.
- Use big-energy, age-appropriate language.
- Make it practical for a field, cones, flags, and footballs.
`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-5.4-mini",
        input: prompt,
        max_output_tokens: 1800,
        store: false
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return jsonResponse({ error: data.error?.message || "OpenAI request failed." }, 500);
    }

    const text = extractText(data).replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    const plan = JSON.parse(text);
    return jsonResponse({ plan });
  } catch (error) {
    return jsonResponse({
      error: "AI plan generation failed. Try again, or add a little more detail.",
      plan: fallbackPlan(input)
    }, 500);
  }
}
