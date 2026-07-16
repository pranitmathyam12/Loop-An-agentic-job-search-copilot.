import Anthropic from "@anthropic-ai/sdk";
import { convert } from "html-to-text";
import { z } from "zod";
import { RESUME } from "./resume";

// ===========================================================================
// A minimal, from-scratch agentic tool-use loop.
//
// The whole point of this file is to make the loop *visible*. Read it top to
// bottom and you can see exactly the two things that alternate:
//   1. Claude DECIDES  -> it returns a response asking to call a tool.
//   2. OUR CODE ACTS   -> we run the tool and hand the result back.
// We repeat until Claude stops asking for tools and returns a final answer.
// ===========================================================================

// --- 1. The ONE tool we expose to Claude -----------------------------------
// This is just a *description* of a capability. Claude never runs it; it only
// asks us to run it. The input_schema tells Claude the exact shape of the
// argument it must produce (a single `url` string).
const FETCH_JOB_POSTING_TOOL: Anthropic.Tool = {
  name: "fetch_job_posting",
  description:
    "Fetches the text content of a job posting from a given URL. " +
    "Use this to read the actual job description before scoring it.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL of the job posting to fetch.",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
};

// --- 2. The tool's ACTUAL implementation (this is OUR code, not Claude's) ---
// When Claude asks for `fetch_job_posting`, THIS runs: fetch the page, strip
// the HTML down to readable text, and return that text. Claude only ever sees
// the string this returns.
async function fetchJobPosting(url: string): Promise<string> {
  const res = await fetch(url, {
    // A browser-ish UA — some job boards reject the default fetch UA.
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LoopBot/1.0)" },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();

  // Strip tags/scripts/styles and collapse into clean text. We drop links and
  // images so the model isn't distracted by nav chrome and asset URLs.
  const text = convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  }).trim();

  // Guard against gigantic pages blowing up the context window.
  const MAX_CHARS = 20_000;
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "\n…[truncated]" : text;
}

// --- 3. The shape we expect Claude's FINAL answer to take -------------------
// NOTE: we deliberately do NOT use structured outputs (output_config.format)
// here. That feature forces the model to emit schema-conforming JSON on its
// VERY FIRST response, which means it can never emit a tool_use block — the
// loop breaks and Claude scores the job without ever fetching it. Instead we
// ask for JSON in the prompt and parse the final text ourselves. This is the
// correct way to combine a tool loop with a structured final answer.
const scoreSchema = z.object({
  fitScore: z.number().int().min(0).max(100),
  explanation: z.string(),
});

export type AgentScoreResult = z.infer<typeof scoreSchema>;

// Pull a JSON object out of the model's final text, tolerating stray prose or
// ```json code fences around it.
function parseFinalAnswer(text: string): AgentScoreResult {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return scoreSchema.parse(JSON.parse(candidate));
}

// --- 4. The trace: a record of every decision Claude made -------------------
// This is purely for *your* visibility — it's not sent to Claude. Each entry
// answers "what did the agent do on this turn?".
export type TraceStep =
  | { step: number; type: "tool_call"; tool: string; input: unknown }
  | {
      step: number;
      type: "tool_result";
      tool: string;
      ok: boolean;
      preview: string;
    }
  | { step: number; type: "final_answer" };

const SYSTEM_PROMPT = `
You are a technical recruiter scoring how well a candidate's resume matches a
job posting. You are given ONLY a URL — you do not yet know what the job is.

Your process:
1. Call the fetch_job_posting tool with the URL to read the actual posting.
2. Once you have the posting text, compare it against the candidate's resume.
3. Return a fit score (0-100) and a short explanation citing concrete matches
   and gaps.

Do not guess about the job before fetching it.

When you are done, respond with ONLY a JSON object and nothing else, in exactly
this shape (no markdown, no code fences, no surrounding prose):
{"fitScore": <integer 0-100>, "explanation": "<2-4 sentence justification citing concrete matches and gaps>"}
`.trim();

// Raised when Claude refuses or the loop can't produce a valid final answer.
export class AgentScoreError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AgentScoreError";
  }
}

/**
 * Run the agentic loop: give Claude the goal + the fetch_job_posting tool,
 * then keep executing whatever tool it asks for and feeding the result back
 * until it returns a final structured score.
 *
 * Returns the score/explanation plus a `trace` of every step so the caller can
 * SEE the agent's decisions.
 */
export async function agentScoreJob(
  jobUrl: string,
): Promise<AgentScoreResult & { trace: TraceStep[] }> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the env

  // The conversation. We keep appending to this array — it IS the agent's
  // memory. Claude is stateless; the full history is re-sent every turn.
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        `Fetch this job posting and score how well it fits the candidate's ` +
        `resume.\n\nJOB POSTING URL: ${jobUrl}\n\n` +
        `CANDIDATE RESUME:\n${RESUME}`,
    },
  ];

  const trace: TraceStep[] = [];
  const MAX_TURNS = 6; // safety cap so a misbehaving loop can't run forever

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // ---- (A) Claude DECIDES ------------------------------------------------
    // We send the goal, the tool, and the conversation so far. Claude replies
    // either with tool calls (stop_reason "tool_use") or a final answer.
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      tools: [FETCH_JOB_POSTING_TOOL],
      messages,
    });

    if (message.stop_reason === "refusal") {
      throw new AgentScoreError(
        "The model declined to score this job.",
        502,
        message.stop_details,
      );
    }

    // Whatever Claude produced (tool calls and/or text) becomes the next
    // assistant turn in the history. We MUST append the raw content blocks so
    // the tool_use IDs line up with the tool_result blocks we send back.
    messages.push({ role: "assistant", content: message.content });

    // ---- (B) Did Claude ask for a tool? ------------------------------------
    const toolUses = message.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    // No tool calls => Claude is done. Its text block is the final JSON answer.
    if (toolUses.length === 0) {
      trace.push({ step: trace.length + 1, type: "final_answer" });

      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new AgentScoreError("No final text answer returned by the model.");
      }
      const parsed = parseFinalAnswer(textBlock.text);
      return { ...parsed, trace };
    }

    // ---- (C) OUR CODE ACTS -------------------------------------------------
    // Claude asked for one or more tool calls. Run each, and collect the
    // results into a SINGLE user message (the API requires all tool_results
    // for one assistant turn to come back together).
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      // Record the decision: "Claude called <tool> with <input>".
      trace.push({
        step: trace.length + 1,
        type: "tool_call",
        tool: toolUse.name,
        input: toolUse.input,
      });

      try {
        // We only defined one tool, but we still dispatch by name — that's the
        // pattern that scales when you add more tools later.
        if (toolUse.name !== "fetch_job_posting") {
          throw new Error(`Unknown tool: ${toolUse.name}`);
        }
        const { url } = toolUse.input as { url: string };
        const jobText = await fetchJobPosting(url);

        trace.push({
          step: trace.length + 1,
          type: "tool_result",
          tool: toolUse.name,
          ok: true,
          preview: jobText.slice(0, 200),
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: jobText,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown tool error";

        trace.push({
          step: trace.length + 1,
          type: "tool_result",
          tool: toolUse.name,
          ok: false,
          preview: errMsg,
        });

        // Return the error to Claude (is_error: true) so it can recover —
        // e.g. explain it couldn't read the posting — rather than us crashing.
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Error: ${errMsg}`,
          is_error: true,
        });
      }
    }

    // Feed the tool results back and loop again. Next iteration, Claude sees
    // them and decides its next move.
    messages.push({ role: "user", content: toolResults });
  }

  throw new AgentScoreError(
    `Agent did not finish within ${MAX_TURNS} turns.`,
    504,
  );
}
