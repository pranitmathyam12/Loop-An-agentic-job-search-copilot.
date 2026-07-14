import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ApplicationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { scoreJob, ScoringError } from "@/lib/score";

// Expected POST body.
const createSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  jobUrl: z.string().url(),
  jobDescription: z.string().min(1),
});

// POST /api/applications
// Scores the job description against the resume via Claude, then saves a new
// Application row (status APPLIED) with the resulting fitScore and breakdown
// (skillsMatch/experienceMatch/domainMatch/strengths/gaps).
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { company, role, jobUrl, jobDescription } = parsed.data;

  try {
    const { fitScore, skillsMatch, experienceMatch, domainMatch, strengths, gaps } =
      await scoreJob(jobDescription);

    const application = await prisma.application.create({
      data: {
        company,
        role,
        jobUrl,
        status: ApplicationStatus.APPLIED,
        fitScore,
        skillsMatch,
        experienceMatch,
        domainMatch,
        strengths,
        gaps,
      },
    });

    return NextResponse.json(application, { status: 201 });
  } catch (err) {
    if (err instanceof ScoringError) {
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

// GET /api/applications
// Returns all applications, most recently created first.
export async function GET() {
  try {
    const applications = await prisma.application.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(applications);
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
