"use client";

import Link from "next/link";
import { useState } from "react";

// Mirrors the TraceStep / AgentScoreResult types returned by /api/agent-score
// (src/lib/agentScore.ts). Kept as a local copy so the page is self-contained.
type TraceStep =
  | { step: number; type: "tool_call"; tool: string; input: unknown }
  | { step: number; type: "tool_result"; tool: string; ok: boolean; preview: string }
  | { step: number; type: "final_answer" };

type AgentScoreResult = {
  fitScore: number;
  explanation: string;
  trace: TraceStep[];
};

// Color the fit score by band — same thresholds as the home page.
function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export default function AgentScorePage() {
  const [jobUrl, setJobUrl] = useState("");
  const [result, setResult] = useState<AgentScoreResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/agent-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      setResult(data as AgentScoreResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClasses =
    "w-full rounded-lg border border-black/[.12] dark:border-white/[.15] bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-foreground/60";

  return (
    <div className="font-sans min-h-screen mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Agent score</h1>
          <Link
            href="/"
            className="text-xs text-foreground/45 hover:text-foreground/70 hover:underline"
          >
            ← back to Loop
          </Link>
        </div>
        <p className="mt-1 text-sm text-foreground/60">
          Give Claude just a <span className="font-medium">URL</span> — no
          description. It decides to fetch the posting itself, reads it, then
          scores the fit. The trace below shows every step it took.
        </p>
      </header>

      {/* --- Job URL form --- */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-black/[.08] dark:border-white/[.12] p-5 sm:p-6"
      >
        <label className="mb-1.5 block text-xs font-medium text-foreground/70">
          Job posting URL
        </label>
        <input
          className={inputClasses}
          type="url"
          value={jobUrl}
          onChange={(e) => setJobUrl(e.target.value)}
          placeholder="https://company.com/careers/role"
          required
        />
        <div className="mt-5 flex items-center gap-4">
          <button
            type="submit"
            disabled={submitting || jobUrl.trim().length === 0}
            className="rounded-full bg-foreground px-5 h-10 text-sm font-medium text-background transition-colors hover:bg-foreground/85 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Agent running…" : "Run agent"}
          </button>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      </form>

      {/* --- Results --- */}
      {result && (
        <section className="mt-10 flex flex-col gap-8">
          {/* Final score */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-black/[.08] dark:border-white/[.12] p-5 sm:p-6">
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-foreground/70">
                Final score
              </h2>
              <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
                {result.explanation}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div
                className={`text-4xl font-semibold tabular-nums ${scoreColor(
                  result.fitScore,
                )}`}
              >
                {result.fitScore}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-foreground/40">
                fit
              </div>
            </div>
          </div>

          {/* Agent trace — each decision, in order */}
          <div>
            <h2 className="mb-1 text-sm font-medium text-foreground/70">
              Agent trace{" "}
              <span className="text-foreground/40">
                ({result.trace.length} step
                {result.trace.length === 1 ? "" : "s"})
              </span>
            </h2>
            <p className="mb-4 text-xs text-foreground/50">
              What the agent decided to do, in the order it happened. Tool calls
              are the agent&apos;s decisions; results are what our code returned.
            </p>
            <ol className="relative flex flex-col gap-3 border-l border-black/[.1] dark:border-white/[.14] pl-6">
              {result.trace.map((s) => (
                <TraceRow key={s.step} step={s} />
              ))}
            </ol>
          </div>
        </section>
      )}
    </div>
  );
}

// One row of the trace. Each step type gets its own dot color + label so the
// alternation (Claude decides → our code acts → …) is visible at a glance.
function TraceRow({ step }: { step: TraceStep }) {
  const meta = rowMeta(step);
  return (
    <li className="relative">
      {/* timeline dot */}
      <span
        aria-hidden
        className={`absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background ${meta.dot}`}
      />
      <div className="rounded-lg border border-black/[.08] dark:border-white/[.12] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium tabular-nums text-foreground/40">
            #{step.step}
          </span>
          <span className={`text-xs font-medium ${meta.label}`}>
            {meta.title}
          </span>
        </div>
        {meta.body && (
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-foreground/70">
            {meta.body}
          </pre>
        )}
      </div>
    </li>
  );
}

// Presentation for each trace-step type.
function rowMeta(step: TraceStep): {
  title: string;
  dot: string;
  label: string;
  body: string | null;
} {
  switch (step.type) {
    case "tool_call":
      return {
        title: `Claude decided to call ${step.tool}`,
        dot: "bg-blue-500",
        label: "text-blue-600 dark:text-blue-400",
        body: `input: ${JSON.stringify(step.input)}`,
      };
    case "tool_result":
      return {
        title: step.ok
          ? `Our code ran ${step.tool} → returned result`
          : `${step.tool} failed`,
        dot: step.ok ? "bg-emerald-500" : "bg-red-500",
        label: step.ok
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400",
        body: step.ok ? `preview: ${step.preview}…` : step.preview,
      };
    case "final_answer":
      return {
        title: "Claude returned the final score (no more tools)",
        dot: "bg-foreground",
        label: "text-foreground/70",
        body: null,
      };
  }
}
