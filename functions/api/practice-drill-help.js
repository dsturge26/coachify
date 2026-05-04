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

const drillHelpSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "reframedBlock"],
  properties: {
    answer: { type: "string" },
    reframedBlock: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
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
      ]
    }
  }
};

function parseAiResponse(data) {
  const text = extractText(data).replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  if (!text) {
    return {
      answer: "I could not get a clean answer back. Try asking the question a little more specifically.",
      reframedBlock: null
    };
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      answer: text,
      reframedBlock: null
    };
  }
}

export async function onRequestPost({ request, env }) {
  let input;
  try {
    input = await request.json();
  } catch (error) {
    return jsonResponse({ error: "Could not read the drill question." }, 400);
  }

  if (!input.question || !input.drill) {
    return jsonResponse({ error: "A drill and question are required." }, 400);
  }

  if (!env.OPENAI_API_KEY) {
    return jsonResponse({
      error: "AI is not connected yet. Add OPENAI_API_KEY in Cloudflare Pages environment variables."
    }, 500);
  }

  const mode = input.mode === "reframe" ? "reframe" : "question";
  const prompt = `
You are Coachify, a practical assistant for volunteer youth sports coaches.

Answer a coach's question about one drill. Be direct, encouraging, and field-ready.
Keep the answer concise: 120-180 words unless the coach asks for a clearer version.

Mode: ${mode}
Coach question: ${input.question}

Team:
- Name: ${input.team?.name || "Team"}
- Division: ${input.team?.divisionName || "Unknown"}
- Players on field: ${input.team?.playersOnField || "Unknown"}
- Roster size: ${input.team?.rosterSize || "Unknown"}

Practice plan:
- Title: ${input.plan?.title || "Practice Plan"}
- Summary: ${input.plan?.summary || ""}
- Total minutes: ${input.plan?.totalMinutes || "Unknown"}

Current drill:
${JSON.stringify(input.drill, null, 2)}

Recent conversation about this drill:
${JSON.stringify(input.recentConversation || [], null, 2)}

Return JSON only:
{
  "answer": "short field-ready answer",
  "reframedBlock": null
}

If mode is "reframe", also return "reframedBlock" with this exact shape:
{
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

Rules:
- Do not change the drill duration.
- Do not invent equipment the coach did not mention unless you give a no-equipment alternative.
- Assume the coach is inexperienced and needs plain steps.
- If reframing, make the drill clearer and easier to run, not more complex.
`;

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
        max_output_tokens: mode === "reframe" ? 1600 : 700,
        text: {
          format: {
            type: "json_schema",
            name: "practice_drill_help",
            strict: true,
            schema: drillHelpSchema
          }
        },
        store: false
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return jsonResponse({ error: data.error?.message || "OpenAI request failed." }, 500);
    }

    return jsonResponse(parseAiResponse(data));
  } catch (error) {
    return jsonResponse({
      error: "Coachify could not answer that drill question. Try again in a minute."
    }, 500);
  }
}
