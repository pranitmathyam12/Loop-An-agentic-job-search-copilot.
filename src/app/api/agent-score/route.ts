import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { agentScoreJob, AgentScoreError } from "@/lib/agentScore";

// Expected POST body: just a URL (no description — the agent fetches it).
const requestSchema = z.object({
  jobUrl: z.string().url(),
});

// POST /api/agent-score
// Runs an agentic tool-use loop: Claude is given the fetch_job_posting tool and
// a resume, decides to fetch the URL, then scores the fit. Returns
// { fitScore, explanation, trace } where `trace` shows each agent decision.
// Stateless and standalone — does not touch /api/applications or /api/tailor.
export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not set. Add it to your .env file and restart the dev server.",
      },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body. Expected { jobUrl }.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await agentScoreJob(parsed.data.jobUrl);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AgentScoreError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: err.status },
      );
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: err.message, status: err.status },
        { status: err.status ?? 500 },
      );
    }
    const messageText = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
