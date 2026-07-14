import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { tailorResume, TailoringError } from "@/lib/tailor";
import { verifyTailoredResume } from "@/lib/verify";
import { RESUME } from "@/lib/resume";

// Expected POST body. The resume itself is sourced from src/lib/resume.ts, so
// the client only supplies the job description to tailor toward.
const tailorRequestSchema = z.object({
  jobDescription: z.string().min(1),
});

// POST /api/tailor
// Tailors the resume (src/lib/resume.ts) to the given job description via
// Claude, then runs a deterministic (no-LLM) fact-check comparing the tailored
// output against the original resume. Returns
// { tailoredResume, changeLog, verification }. Stateless — nothing is
// persisted; this is a direct Claude feature for now.
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

  const parsed = tailorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await tailorResume(parsed.data.jobDescription);
    // Deterministic backstop: confirm the tailored output introduced no
    // numbers/dates/companies/titles absent from the original resume.
    const verification = verifyTailoredResume(RESUME, result.tailoredResume);
    return NextResponse.json({ ...result, verification });
  } catch (err) {
    if (err instanceof TailoringError) {
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
