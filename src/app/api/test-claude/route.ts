import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// --- Hardcoded sample inputs (placeholder for now) -------------------------
// Later these will come from the request / database instead of being inlined.
const SAMPLE_RESUME = `
Jane Doe — Full-Stack Engineer (4 years experience)
- Built and shipped production apps with Next.js, React, and TypeScript.
- Designed PostgreSQL schemas and REST APIs; comfortable with Prisma.
- Some exposure to LLM APIs and prompt design on side projects.
- Strong on frontend/product work; lighter on large-scale backend systems.
`.trim();

const SAMPLE_JOB_DESCRIPTION = `
Senior Full-Stack Engineer — AI Product Team
We're looking for an engineer to build agentic, LLM-powered product features.
Must-haves: Next.js + TypeScript, solid API/database design, and genuine
interest in AI/LLM UX. Nice-to-have: experience integrating the Anthropic or
OpenAI APIs. This is a product-focused role with lots of frontend ownership.
`.trim();

// --- Shape we force Claude to return --------------------------------------
const fitSchema = z.object({
  fitScore: z.number().int().min(0).max(100),
  explanation: z.string(),
});

// JSON Schema handed to the API so the model's output is structurally valid.
// (Structured outputs can't express numeric min/max, so we state 0–100 in the
// prompt and re-validate the range with zod below.)
const fitJsonSchema = {
  type: "object",
  properties: {
    fitScore: {
      type: "integer",
      description: "How well the resume matches the job, from 0 to 100.",
    },
    explanation: {
      type: "string",
      description: "A brief (2-3 sentence) justification for the score.",
    },
  },
  required: ["fitScore", "explanation"],
  additionalProperties: false,
} as const;

export async function GET() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not set. Add it to your .env file and restart the dev server.",
      },
      { status: 500 },
    );
  }

  // The SDK reads ANTHROPIC_API_KEY from the environment automatically.
  const client = new Anthropic();

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: fitJsonSchema } },
      system:
        "You are a technical recruiter. Score how well a candidate's resume " +
        "matches a job description on a scale of 0 to 100 (100 = perfect fit), " +
        "and briefly explain your reasoning.",
      messages: [
        {
          role: "user",
          content:
            `JOB DESCRIPTION:\n${SAMPLE_JOB_DESCRIPTION}\n\n` +
            `CANDIDATE RESUME:\n${SAMPLE_RESUME}\n\n` +
            "Return the fit score (0-100) and a short explanation.",
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The model declined to answer.", stop_details: message.stop_details },
        { status: 502 },
      );
    }

    // With thinking enabled the response may contain thinking blocks; grab the text.
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No text content returned by the model." },
        { status: 502 },
      );
    }

    const result = fitSchema.parse(JSON.parse(textBlock.text));

    return NextResponse.json({
      model: message.model,
      ...result,
      usage: message.usage,
    });
  } catch (err) {
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
