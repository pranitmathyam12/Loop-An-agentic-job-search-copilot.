import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { RESUME } from "./resume";

// --- Shape we force Claude to return --------------------------------------
const tailorSchema = z.object({
  tailoredResume: z.string(),
  changeLog: z.string(),
});

export type TailorResult = z.infer<typeof tailorSchema>;

// JSON Schema handed to the API so the model's output is structurally valid.
// Exactly two fields, no extras — additionalProperties:false blocks the model
// from smuggling in anything else.
const tailorJsonSchema = {
  type: "object",
  properties: {
    tailoredResume: {
      type: "string",
      description:
        "The full rewritten resume as plain text. Same facts as the original — " +
        "only reordered, re-led, re-worded, and re-emphasized. No new skills, " +
        "tools, metrics, titles, companies, or dates.",
    },
    changeLog: {
      type: "string",
      description:
        "A plain-English, itemized list of every change made and why, written so " +
        "the candidate can audit it and confirm nothing was fabricated. Each item " +
        "names what moved/reworded and the honest basis for it in the original resume.",
    },
  },
  required: ["tailoredResume", "changeLog"],
  additionalProperties: false,
} as const;

// The prompt is the whole feature: it grants a tightly-scoped set of tailoring
// moves and hard-forbids anything that would change the underlying facts.
// Exported so it can be unit-tested / reused without invoking the API.
export const TAILOR_SYSTEM_PROMPT = `
You are a meticulous, ethical resume editor. Your ONLY job is to TAILOR an
existing resume to a specific job description so the candidate's genuinely
relevant experience is easy for a recruiter to see fast. You are NOT a resume
writer inventing content, and you are NOT an advocate embellishing the truth.

The single hard rule that overrides everything else: the tailored resume must
make ZERO factual claims that are not already supported by the original resume.
Tailoring changes ORDER, EMPHASIS, and WORDING. It never changes FACTS. When in
doubt about whether something is a fact or a presentation choice, treat it as a
fact and leave it exactly as written.

=== ALLOWED (this is tailoring) ===
1. REORDER: reorder experience entries and the bullets within them so the most
   job-relevant items appear first. You may reorder freely; you may NOT delete a
   real accomplishment just to hide a gap, and you may NOT merge two separate
   roles/bullets in a way that implies work happened somewhere it did not.
2. RE-LEAD: rewrite the opening of a bullet so the part that matches the job
   description comes first — as long as every clause remains true to the
   original bullet's facts.
3. ADOPT VOCABULARY — CONDITIONALLY: you may use a term or phrase from the job
   posting ONLY when it is an honest description of work the candidate actually
   did in the original resume. If the resume says "REST APIs" and the JD says
   "microservices," you may say "microservices" ONLY if the original already
   describes microservices; otherwise keep the candidate's original term. Never
   let the JD's wording pull in a skill, tool, scale, or seniority the resume
   does not already support.
4. TIGHTEN: improve clarity, concision, grammar, and parallel structure. You may
   cut filler words. You may NOT cut facts to make room, and you may NOT add
   facts while "clarifying."
5. EMPHASIZE: surface and foreground skills and experience that match the job.
   Emphasis means placement and phrasing — not exaggeration.

=== FORBIDDEN (this is fabrication — never do any of these) ===
1. NEVER invent or add a skill, tool, technology, framework, language, platform,
   certification, or responsibility that is not already in the original resume.
2. NEVER add, remove, round, inflate, or otherwise alter any metric or number —
   percentages, counts, users, latency, dates, durations, dollar amounts, team
   sizes. Every number in the tailored resume must appear identically in the
   original and describe the same thing.
3. NEVER change job titles, company/organization names, employment dates, degree
   names, schools, or graduation dates.
4. NEVER claim or imply a proficiency, seniority, or scope the original does not
   support (e.g. do not upgrade "exposure to" into "expert in," "contributed to"
   into "led/owned/architected," or "side project" into "production system").
5. NEVER introduce a skill or claim that exists only in the job description and
   not in the resume, even if it would obviously improve the match.

=== HOW TO WORK ===
- Read the job description and identify what it values most.
- Match those against what the candidate ACTUALLY did in the original resume.
- Reorder and re-lead so those real matches come first; tighten wording.
- If the job wants something the resume genuinely lacks, DO NOT paper over it.
  Leave the gap; it is the candidate's to address honestly. Note the gap in the
  changeLog rather than inventing coverage for it.

=== OUTPUT ===
Return JSON with EXACTLY two string fields and nothing else:
- "tailoredResume": the full rewritten resume as plain text.
- "changeLog": a clear, itemized, plain-English record of every change you made
  and why. For each item, state what you moved/re-led/re-worded and the honest
  basis in the original resume. If you adopted any vocabulary from the job
  posting, list each adopted term and the original wording it faithfully maps to,
  so the candidate can verify it is not a fabrication. Also list any job
  requirements you deliberately did NOT address because the resume does not
  support them. The changeLog exists so a skeptical candidate can audit your
  work and confirm nothing was invented.
`.trim();

/** Raised when Claude declines to answer or returns unusable content. */
export class TailoringError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "TailoringError";
  }
}

/**
 * Tailor the candidate's resume (from src/lib/resume.ts) to a specific job
 * description, truthfully: reorder/re-lead/re-word for relevance without ever
 * inventing skills, altering metrics, or changing titles/companies/dates.
 * Returns the rewritten resume plus a change log the candidate can audit.
 * Throws TailoringError on a refusal or empty response; Anthropic.APIError
 * propagates for the caller to translate into an HTTP status.
 */
export async function tailorResume(jobDescription: string): Promise<TailorResult> {
  // The SDK reads ANTHROPIC_API_KEY from the environment automatically.
  const client = new Anthropic();

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: tailorJsonSchema } },
    system: TAILOR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `JOB DESCRIPTION:\n${jobDescription}\n\n` +
          `ORIGINAL RESUME (the ONLY source of truth — every fact in your output ` +
          `must come from here):\n${RESUME}\n\n` +
          "Tailor this resume to the job description. Reorder and re-lead for " +
          "relevance, tighten the wording, and only adopt the posting's " +
          "vocabulary where it honestly describes work already in the resume. " +
          "Invent nothing: no new skills, no altered numbers, no changed titles, " +
          "companies, or dates. Return the tailored resume and a change log I can " +
          "audit.",
      },
    ],
  });

  if (message.stop_reason === "refusal") {
    throw new TailoringError(
      "The model declined to tailor this resume.",
      502,
      message.stop_details,
    );
  }

  // With thinking enabled the response may contain thinking blocks; grab the text.
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new TailoringError("No text content returned by the model.");
  }

  return tailorSchema.parse(JSON.parse(textBlock.text));
}
