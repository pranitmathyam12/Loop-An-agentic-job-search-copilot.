"use client";

import type { Application } from "@prisma/client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type FormState = {
  company: string;
  role: string;
  jobUrl: string;
  jobDescription: string;
};

const EMPTY_FORM: FormState = {
  company: "",
  role: "",
  jobUrl: "",
  jobDescription: "",
};

// Tailwind classes for each pipeline status.
const STATUS_STYLES: Record<string, string> = {
  APPLIED: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  PHONE_SCREEN: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  INTERVIEW: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  OFFER: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  REJECTED: "bg-red-500/10 text-red-600 dark:text-red-400",
  GHOSTED: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
};

// Color the fit score by band.
function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export default function Home() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadApplications = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/applications");
      if (!res.ok) throw new Error(`Failed to load applications (${res.status})`);
      setApplications((await res.json()) as Application[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load applications.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      // Prepend the newly-scored row so it shows instantly, then refresh from
      // the server to stay authoritative.
      setApplications((prev) => [data as Application, ...prev]);
      setForm(EMPTY_FORM);
      void loadApplications();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const inputClasses =
    "w-full rounded-lg border border-black/[.12] dark:border-white/[.15] bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-foreground/60";

  return (
    <div className="font-sans min-h-screen mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Loop</h1>
          <Link
            href="/tailor"
            className="text-xs text-foreground/45 hover:text-foreground/70 hover:underline"
          >
            tailor a resume →
          </Link>
        </div>
        <p className="mt-1 text-sm text-foreground/60">
          Add a job and Claude scores how well it fits your resume.
        </p>
      </header>

      {/* --- Add application form --- */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-black/[.08] dark:border-white/[.12] p-5 sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground/70">
              Company
            </label>
            <input
              className={inputClasses}
              value={form.company}
              onChange={(e) => update("company", e.target.value)}
              placeholder="Perplexity AI"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground/70">
              Role
            </label>
            <input
              className={inputClasses}
              value={form.role}
              onChange={(e) => update("role", e.target.value)}
              placeholder="Full-Stack Engineer"
              required
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-foreground/70">
            Job URL
          </label>
          <input
            className={inputClasses}
            type="url"
            value={form.jobUrl}
            onChange={(e) => update("jobUrl", e.target.value)}
            placeholder="https://company.com/careers/role"
            required
          />
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-foreground/70">
            Job description
          </label>
          <textarea
            className={`${inputClasses} min-h-32 resize-y`}
            value={form.jobDescription}
            onChange={(e) => update("jobDescription", e.target.value)}
            placeholder="Paste the full job description here…"
            required
          />
        </div>

        <div className="mt-5 flex items-center gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-foreground px-5 h-10 text-sm font-medium text-background transition-colors hover:bg-foreground/85 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Scoring with Claude…" : "Score & save"}
          </button>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      </form>

      {/* --- Applications list --- */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-medium text-foreground/70">
          Applications{" "}
          {!loadingList && (
            <span className="text-foreground/40">({applications.length})</span>
          )}
        </h2>

        {loadingList ? (
          <p className="text-sm text-foreground/50">Loading…</p>
        ) : applications.length === 0 ? (
          <p className="text-sm text-foreground/50">
            No applications yet. Add one above to get started.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {applications.map((app) => (
              <li
                key={app.id}
                className="rounded-xl border border-black/[.08] dark:border-white/[.12] p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{app.company}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          STATUS_STYLES[app.status] ?? STATUS_STYLES.GHOSTED
                        }`}
                      >
                        {app.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-foreground/70 truncate">
                      {app.role}
                    </p>
                    <a
                      href={app.jobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs text-foreground/45 hover:text-foreground/70 hover:underline truncate max-w-full"
                    >
                      {app.jobUrl}
                    </a>
                  </div>

                  {app.fitScore !== null && (
                    <div className="shrink-0 text-right">
                      <div
                        className={`text-2xl font-semibold tabular-nums ${scoreColor(
                          app.fitScore,
                        )}`}
                      >
                        {app.fitScore}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-foreground/40">
                        fit
                      </div>
                    </div>
                  )}
                </div>

                {(app.skillsMatch !== null ||
                  app.experienceMatch !== null ||
                  app.domainMatch !== null ||
                  app.strengths ||
                  app.gaps ||
                  app.fitNotes) && (
                  <div className="mt-3 border-t border-black/[.06] dark:border-white/[.08] pt-3">
                    {/* Sub-score breakdown */}
                    {(app.skillsMatch !== null ||
                      app.experienceMatch !== null ||
                      app.domainMatch !== null) && (
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                        {app.skillsMatch !== null && (
                          <span className="text-foreground/60">
                            Skills{" "}
                            <span className={`font-medium tabular-nums ${scoreColor(app.skillsMatch)}`}>
                              {app.skillsMatch}
                            </span>
                          </span>
                        )}
                        {app.experienceMatch !== null && (
                          <span className="text-foreground/60">
                            Experience{" "}
                            <span className={`font-medium tabular-nums ${scoreColor(app.experienceMatch)}`}>
                              {app.experienceMatch}
                            </span>
                          </span>
                        )}
                        {app.domainMatch !== null && (
                          <span className="text-foreground/60">
                            Domain{" "}
                            <span className={`font-medium tabular-nums ${scoreColor(app.domainMatch)}`}>
                              {app.domainMatch}
                            </span>
                          </span>
                        )}
                      </div>
                    )}

                    {app.strengths && (
                      <p className="mt-3 text-sm text-foreground/65 leading-relaxed">
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                          Strengths:{" "}
                        </span>
                        {app.strengths}
                      </p>
                    )}
                    {app.gaps && (
                      <p className="mt-2 text-sm text-foreground/65 leading-relaxed">
                        <span className="font-medium text-red-600 dark:text-red-400">
                          Gaps:{" "}
                        </span>
                        {app.gaps}
                      </p>
                    )}

                    {/* Legacy single-explanation rows from the earlier scorer. */}
                    {app.fitNotes && !app.strengths && !app.gaps && (
                      <p className="text-sm text-foreground/65 leading-relaxed">
                        {app.fitNotes}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
