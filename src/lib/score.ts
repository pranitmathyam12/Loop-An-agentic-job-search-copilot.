import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { RESUME } from "./resume";

// --- Shape we force Claude to return --------------------------------------
const fitSchema = z.object({
  fitScore: z.number().int().min(0).max(100),
  skillsMatch: z.number().int().min(0).max(100),
  experienceMatch: z.number().int().min(0).max(100),
  domainMatch: z.number().int().min(0).max(100),
  strengths: z.string(),
  gaps: z.string(),
});

export type FitResult = z.infer<typeof fitSchema>;

// JSON Schema handed to the API so the model's output is structurally valid.
// (Structured outputs can't express numeric min/max, so we state 0–100 in the
// prompt and re-validate the range with zod below.)
const fitJsonSchema = {
  type: "object",
  properties: {
    fitScore: {
      type: "integer",
      description:
        "Overall fit, 0-100. A holistic judgement dominated by required must-haves, NOT an average of the sub-scores. Missing must-haves should pull this down hard.",
    },
    skillsMatch: {
      type: "integer",
      description:
        "0-100. How well the resume covers the skills/technologies the JD lists, weighting REQUIRED skills far above preferred/nice-to-haves.",
    },
    experienceMatch: {
      type: "integer",
      description:
        "0-100. Alignment of years, seniority, and scope of experience with what the JD requires.",
    },
    domainMatch: {
      type: "integer",
      description:
        "0-100. Alignment with the JD's industry, domain, and problem space.",
    },
    strengths: {
      type: "string",
      description:
        "Concrete strengths, each tied to a specific JD requirement the resume clearly satisfies with evidence.",
    },
    gaps: {
      type: "string",
      description:
        "Explicit gaps: requirements the JD emphasizes that the resume is missing or only weakly supports. Call out any missing MUST-HAVE by name.",
    },
  },
  required: [
    "fitScore",
    "skillsMatch",
    "experienceMatch",
    "domainMatch",
    "strengths",
    "gaps",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `
You are a strict, skeptical senior hiring manager who personally has to defend
every hire to a demanding panel. You are hard to impress and you do NOT reward
surface-level keyword overlap. Your job is to give an honest, conservative
assessment of how well a candidate's resume matches a specific job description.

How to evaluate:

1. First, read the job description and mentally split its requirements into
   REQUIRED (must-haves: phrased as "required", "must have", "X+ years",
   "strong", core responsibilities) versus PREFERRED (nice-to-haves: "preferred",
   "bonus", "a plus", "nice to have"). Weight the REQUIRED items far more
   heavily. A candidate who nails the nice-to-haves but misses a must-have is
   NOT a strong fit.

2. Demand evidence, not keywords. A technology merely appearing on the resume is
   weak signal. Look for depth: shipped work, scope, years, ownership, outcomes.
   Treat one-line mentions and side projects as weak evidence for a required
   skill.

3. Penalize gaps. For every must-have the resume does not clearly satisfy,
   lower the score meaningfully. Missing a core required skill or a hard
   experience bar (e.g. seniority, years, a required domain) should cap the
   overall score well below 80 no matter how much else overlaps.

Scoring scale (be conservative — most real applications land 55-80):
- 90-100: Exceptional, near-perfect match. Meets essentially every must-have
  with strong evidence and most preferred items. Rare. Do not give this just
  because many keywords overlap.
- 75-89: Strong candidate. Meets all or nearly all must-haves; only minor or
  preferred gaps.
- 60-74: Moderate fit. Meets some must-haves but has at least one notable gap.
- 40-59: Weak fit. Misses multiple must-haves.
- 0-39: Poor fit.

Return the required JSON. fitScore is your overall holistic judgement (NOT a
simple average of the sub-scores) and must reflect must-have gaps heavily. In
'strengths', list concrete strengths mapped to specific JD requirements. In
'gaps', explicitly name what the JD requires or emphasizes that the resume is
missing or only weakly supports — and flag any missing must-have by name.
`.trim();

/** Raised when Claude declines to answer or returns unusable content. */
export class ScoringError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ScoringError";
  }
}

/**
 * Score a job description against your resume (from src/lib/resume.ts) as a
 * strict, skeptical hiring manager, returning an overall fitScore plus a
 * breakdown (skills/experience/domain) and separated strengths vs gaps.
 * Throws ScoringError on a refusal or empty response; Anthropic.APIError
 * propagates for the caller to translate into an HTTP status.
 */
export async function scoreJob(jobDescription: string): Promise<FitResult> {
  // The SDK reads ANTHROPIC_API_KEY from the environment automatically.
  const client = new Anthropic();

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: fitJsonSchema } },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `JOB DESCRIPTION:\n${jobDescription}\n\n` +
          `CANDIDATE RESUME:\n${RESUME}\n\n` +
          "Score this candidate strictly. Weight required skills far above " +
          "nice-to-haves, penalize missing must-haves, and separate strengths " +
          "from gaps. Return the fit score, sub-scores, strengths, and gaps.",
      },
    ],
  });

  if (message.stop_reason === "refusal") {
    throw new ScoringError(
      "The model declined to score this job.",
      502,
      message.stop_details,
    );
  }

  // With thinking enabled the response may contain thinking blocks; grab the text.
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new ScoringError("No text content returned by the model.");
  }

  return fitSchema.parse(JSON.parse(textBlock.text));
}
