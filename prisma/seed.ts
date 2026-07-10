import { PrismaClient, ApplicationStatus } from "@prisma/client";

const prisma = new PrismaClient();

// A handful of realistic sample applications spanning the pipeline.
// Some have Claude's fitScore/fitNotes filled in; others are still null
// to mirror rows that haven't been scored yet.
const applications = [
  {
    company: "Vercel",
    role: "Senior Full-Stack Engineer",
    jobUrl: "https://vercel.com/careers/senior-fullstack-engineer",
    status: ApplicationStatus.INTERVIEW,
    fitScore: 88,
    fitNotes:
      "Strong Next.js and TypeScript overlap with the candidate's recent work; edge/runtime experience is a plus.",
    coverLetter:
      "Dear Vercel team, I've been building on Next.js since the App Router beta and would love to help shape the platform...",
  },
  {
    company: "Anthropic",
    role: "Product Engineer, Claude Apps",
    jobUrl: "https://anthropic.com/careers/product-engineer",
    status: ApplicationStatus.PHONE_SCREEN,
    fitScore: 92,
    fitNotes:
      "Excellent alignment: agentic tooling experience, TypeScript, and a demonstrated interest in LLM-powered UX.",
    coverLetter: null,
  },
  {
    company: "Linear",
    role: "Frontend Engineer",
    jobUrl: "https://linear.app/careers/frontend-engineer",
    status: ApplicationStatus.APPLIED,
    fitScore: null,
    fitNotes: null,
    coverLetter: null,
  },
  {
    company: "Stripe",
    role: "Software Engineer, Payments",
    jobUrl: "https://stripe.com/jobs/swe-payments",
    status: ApplicationStatus.REJECTED,
    fitScore: 61,
    fitNotes:
      "Backend-heavy role skewed toward Ruby and large-scale systems; candidate's strengths are more frontend/product.",
    coverLetter: null,
  },
  {
    company: "Notion",
    role: "Full-Stack Engineer",
    jobUrl: "https://notion.so/careers/fullstack-engineer",
    status: ApplicationStatus.GHOSTED,
    fitScore: 74,
    fitNotes: "Solid overlap, but no response after the take-home was submitted three weeks ago.",
    coverLetter: null,
  },
  {
    company: "Ramp",
    role: "Founding Engineer, AI",
    jobUrl: "https://ramp.com/careers/founding-engineer-ai",
    status: ApplicationStatus.OFFER,
    fitScore: 95,
    fitNotes: "Top match — AI product focus, early-stage ownership, and a strong TypeScript/agent background.",
    coverLetter:
      "Hi Ramp team, building an agentic copilot from scratch is exactly the kind of zero-to-one work I'm looking for...",
  },
];

async function main() {
  // Idempotent: clear existing rows so re-running the seed is safe.
  await prisma.application.deleteMany();

  for (const data of applications) {
    const app = await prisma.application.create({ data });
    console.log(`  + ${app.company} — ${app.role} [${app.status}]`);
  }

  const count = await prisma.application.count();
  console.log(`\nSeeded ${count} applications.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
