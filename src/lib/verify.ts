// Deterministic, LLM-free fact-checker for tailored resumes.
//
// The tailoring prompt (src/lib/tailor.ts) forbids fabrication, but that's a
// soft, model-side guarantee. This module is the hard, code-side backstop: it
// extracts the concrete, checkable facts — numbers/metrics, dates, company /
// organization names, and job titles / degrees — from BOTH the original resume
// and the tailored output, then flags anything present in the tailored version
// that does NOT appear in the original. Reordering and re-wording are fine;
// introducing a new number, date, employer, or title is not.
//
// It is intentionally conservative: it can only verify facts it knows how to
// extract, so a clean pass means "no fabricated facts were detected among the
// checked categories," not a mathematical proof of zero fabrication.

export type Verification = {
  passed: boolean;
  flags: string[];
};

// --- Normalization ---------------------------------------------------------

/** Lowercase and drop thousands separators so "1,000+" === "1000+". */
function normalizeNumber(token: string): string {
  return token.toLowerCase().replace(/,/g, "");
}

/** Lowercase and collapse internal whitespace for text comparisons. */
function normalizeText(token: string): string {
  return token.toLowerCase().replace(/\s+/g, " ").trim();
}

// --- Extractors ------------------------------------------------------------

// A numeric token: a run of digits (with optional commas / decimal), an
// optional magnitude suffix (K/M), and an optional unit (% or +). This catches
// "30%", "500+", "10K+", "1,000+", "99.9%", "3", years like "2026", and the
// digit groups inside a phone number — all of which must survive tailoring
// unchanged.
const NUMBER_RE = /\d[\d,]*(?:\.\d+)?[km]?[%+]?/gi;

function extractNumbers(text: string): string[] {
  return (text.match(NUMBER_RE) ?? []).map(normalizeNumber);
}

// Month-year dates ("Dec 2025", "May 2023"), bare 4-digit years, and the
// literal "Present". Employment dates must not change.
const MONTH_YEAR_RE =
  /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}/gi;
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;

function extractDates(text: string): string[] {
  const monthYears = (text.match(MONTH_YEAR_RE) ?? []).map(normalizeText);
  const years = (text.match(YEAR_RE) ?? []).map(normalizeText);
  const present = /\bpresent\b/i.test(text) ? ["present"] : [];
  return [...monthYears, ...years, ...present];
}

// Companies/organizations and titles/degrees live on the resume's structured
// "Company — Title (dates), Location" lines (em dash, U+2014). We parse the
// left of the dash as the employer/school and the text up to the date paren as
// the title/degree. Lines without an em dash (skills, projects, header) are
// skipped — projects intentionally aren't treated as employers.
function extractEntities(text: string): {
  companies: string[];
  titles: string[];
} {
  const companies: string[] = [];
  const titles: string[] = [];

  for (const rawLine of text.split("\n")) {
    // Strip a leading list marker so a bulleted/indented header line can't
    // pollute the company token (e.g. "- Company — Title").
    const line = rawLine.trim().replace(/^[-•*]\s+/, "");
    const dashIdx = line.indexOf("—"); // em dash
    if (dashIdx === -1) continue;

    const company = line.slice(0, dashIdx).trim();

    let rest = line.slice(dashIdx + 1).trim();
    const parenIdx = rest.indexOf("(");
    // Title = everything before the date parenthesis; fall back to the first
    // comma (in case a line omits the parenthesized dates).
    rest = parenIdx !== -1 ? rest.slice(0, parenIdx) : rest.split(",")[0];
    const title = rest.trim();

    if (company) companies.push(normalizeText(company));
    if (title) titles.push(normalizeText(title));
  }

  return { companies, titles };
}

// --- Verification ----------------------------------------------------------

/**
 * Verify a tailored resume against the original, using deterministic extraction
 * only (no LLM call). Every number, date, company, and title in `tailored` must
 * also appear in `original`; anything that doesn't is flagged as a possible
 * fabrication. `passed` is true only when there are zero flags.
 */
export function verifyTailoredResume(
  original: string,
  tailored: string,
): Verification {
  const flags: string[] = [];

  const check = (
    label: string,
    originalTokens: string[],
    tailoredTokens: string[],
  ) => {
    const allowed = new Set(originalTokens);
    // Dedup the tailored tokens so each novel value is flagged once.
    for (const token of new Set(tailoredTokens)) {
      if (!allowed.has(token)) {
        flags.push(`${label} not found in original resume: "${token}"`);
      }
    }
  };

  check("Number/metric", extractNumbers(original), extractNumbers(tailored));
  check("Date", extractDates(original), extractDates(tailored));

  const origEntities = extractEntities(original);
  const tailEntities = extractEntities(tailored);
  check("Company/organization", origEntities.companies, tailEntities.companies);
  check("Job title/degree", origEntities.titles, tailEntities.titles);

  return { passed: flags.length === 0, flags };
}
