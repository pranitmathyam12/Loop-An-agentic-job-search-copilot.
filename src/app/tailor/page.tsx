"use client";

import Link from "next/link";
import { useState } from "react";

type Verification = {
  passed: boolean;
  flags: string[];
};

type TailorResult = {
  tailoredResume: string;
  changeLog: string;
  verification: Verification;
};

export default function TailorPage() {
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState<TailorResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      setResult(data as TailorResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyResume() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.tailoredResume);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy to clipboard.");
    }
  }

  const inputClasses =
    "w-full rounded-lg border border-black/[.12] dark:border-white/[.15] bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-foreground/60";

  return (
    <div className="font-sans min-h-screen mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Tailor resume</h1>
          <Link
            href="/"
            className="text-xs text-foreground/45 hover:text-foreground/70 hover:underline"
          >
            ← back to Loop
          </Link>
        </div>
        <p className="mt-1 text-sm text-foreground/60">
          Claude reorders and re-words your resume for a specific job —{" "}
          <span className="font-medium">without inventing anything</span>. Every
          change is logged so you can verify it.
        </p>
      </header>

      {/* --- Job description form --- */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-black/[.08] dark:border-white/[.12] p-5 sm:p-6"
      >
        <label className="mb-1.5 block text-xs font-medium text-foreground/70">
          Job description
        </label>
        <textarea
          className={`${inputClasses} min-h-40 resize-y`}
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the full job description here…"
          required
        />
        <div className="mt-5 flex items-center gap-4">
          <button
            type="submit"
            disabled={submitting || jobDescription.trim().length === 0}
            className="rounded-full bg-foreground px-5 h-10 text-sm font-medium text-background transition-colors hover:bg-foreground/85 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Tailoring with Claude…" : "Tailor resume"}
          </button>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      </form>

      {/* --- Results --- */}
      {result && (
        <section className="mt-10 flex flex-col gap-8">
          {/* Fact-check verification — deterministic, no LLM */}
          {result.verification.passed ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[.06] px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <span aria-hidden>✓</span>
              Verified: no fabricated facts detected
            </div>
          ) : (
            <div className="rounded-xl border border-red-500/30 bg-red-500/[.06] px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
                <span aria-hidden>⚠</span>
                Verification failed —{" "}
                {result.verification.flags.length} possible fabrication
                {result.verification.flags.length === 1 ? "" : "s"} detected
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-8 text-sm text-red-700/90 dark:text-red-400/90">
                {result.verification.flags.map((flag, i) => (
                  <li key={i}>{flag}</li>
                ))}
              </ul>
              <p className="mt-2 pl-1 text-xs text-foreground/50">
                These numbers, dates, companies, or titles appear in the tailored
                resume but not in your original. Review them before using this
                version.
              </p>
            </div>
          )}

          {/* Tailored resume */}
          <div>
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="text-sm font-medium text-foreground/70">
                Tailored resume
              </h2>
              <button
                type="button"
                onClick={copyResume}
                className="rounded-full border border-black/[.12] dark:border-white/[.15] px-3 h-8 text-xs font-medium transition-colors hover:border-foreground/60"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-xl border border-black/[.08] dark:border-white/[.12] bg-black/[.02] dark:bg-white/[.03] p-4 sm:p-5 font-mono text-[13px] leading-relaxed text-foreground/85">
              {result.tailoredResume}
            </pre>
          </div>

          {/* Change log — the audit trail */}
          <div>
            <h2 className="mb-1 text-sm font-medium text-foreground/70">
              What changed &amp; why
            </h2>
            <p className="mb-3 text-xs text-foreground/50">
              Review this to confirm nothing was fabricated — only reordered,
              re-worded, and emphasized.
            </p>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[.04] p-4 sm:p-5">
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground/75">
                {result.changeLog}
              </pre>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
