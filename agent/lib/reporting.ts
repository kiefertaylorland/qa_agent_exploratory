import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Signal } from "./signals.js";

export type Severity = "S1" | "S2" | "S3" | "S4";

export interface ReportPaths {
  readonly runDir: string;
  readonly bugsDir: string;
  readonly evidenceDir: string;
  readonly reportMdPath: string;
  readonly reportJsonPath: string;
  readonly signalsJsonlPath: string;
  readonly bugsIndexPath: string;
}

export interface BugIndexEntry {
  readonly seq: number;
  readonly slug: string;
  readonly title: string;
  readonly severity: Severity;
  readonly filePath: string;
  readonly screenshotPath?: string;
  readonly reportedAt: string;
}

export interface BugInput {
  readonly title: string;
  readonly severity: Severity;
  readonly summary: string;
  readonly reproSteps: readonly string[];
  readonly expected: string;
  readonly actual: string;
}

export interface SessionSummaryInput {
  readonly charter: string;
  readonly summary: string;
  readonly coverageNotes: readonly string[];
  readonly openQuestions: readonly string[];
}

/** `<YYYYMMDD-HHmmss>-<session.id.slice(0,8)>` */
export function deriveRunId(sessionId: string, now: Date = new Date()): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${stamp}-${sessionId.slice(0, 8)}`;
}

export function reportPathsFor(runId: string): ReportPaths {
  const runDir = join(process.cwd(), "reports", runId);
  const bugsDir = join(runDir, "bugs");
  return {
    runDir,
    bugsDir,
    evidenceDir: join(runDir, "evidence"),
    reportMdPath: join(runDir, "report.md"),
    reportJsonPath: join(runDir, "report.json"),
    signalsJsonlPath: join(runDir, "signals.jsonl"),
    bugsIndexPath: join(bugsDir, "bugs.json"),
  };
}

export async function ensureReportDirs(paths: ReportPaths): Promise<void> {
  await mkdir(paths.bugsDir, { recursive: true });
  await mkdir(paths.evidenceDir, { recursive: true });
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "bug";
}

export async function readBugsIndex(paths: ReportPaths): Promise<BugIndexEntry[]> {
  try {
    const raw = await readFile(paths.bugsIndexPath, "utf8");
    return JSON.parse(raw) as BugIndexEntry[];
  } catch {
    return [];
  }
}

async function writeBugsIndex(paths: ReportPaths, entries: readonly BugIndexEntry[]): Promise<void> {
  await mkdir(paths.bugsDir, { recursive: true });
  await writeFile(paths.bugsIndexPath, JSON.stringify(entries, null, 2));
}

function renderBugMarkdown(input: BugInput, signals: readonly Signal[], reportedAt: string): string {
  const steps = input.reproSteps.map((step, i) => `${i + 1}. ${step}`).join("\n");
  const signalLines =
    signals.length > 0
      ? signals.map((s) => `- [${s.type}]${s.url ? ` ${s.url}` : ""} ${s.message}`).join("\n")
      : "_none captured_";
  return `# ${input.title}

- Severity: ${input.severity}
- Reported: ${reportedAt}

## Summary

${input.summary}

## Repro steps

${steps}

## Expected

${input.expected}

## Actual

${input.actual}

## Recent signals

${signalLines}
`;
}

/**
 * Writes (or, on a durable replay of the same title, overwrites) one bug
 * report. The sequence number comes from the bugs index, keyed by slug, so
 * a repeat call with an identical title reuses the same file instead of
 * duplicating it.
 */
export async function writeBugReport(
  paths: ReportPaths,
  input: BugInput,
  signals: readonly Signal[],
  reportedAt: string = new Date().toISOString(),
): Promise<BugIndexEntry> {
  const index = await readBugsIndex(paths);
  const slug = slugify(input.title);
  const existing = index.find((entry) => entry.slug === slug);
  const seq = existing?.seq ?? index.length + 1;
  const filename = `${String(seq).padStart(2, "0")}-${slug}.md`;
  const filePath = join(paths.bugsDir, filename);

  await mkdir(paths.bugsDir, { recursive: true });
  await writeFile(filePath, renderBugMarkdown(input, signals, reportedAt));

  const entry: BugIndexEntry = {
    seq,
    slug,
    title: input.title,
    severity: input.severity,
    filePath,
    screenshotPath: existing?.screenshotPath,
    reportedAt,
  };
  const nextIndex = existing ? index.map((e) => (e.slug === slug ? entry : e)) : [...index, entry];
  await writeBugsIndex(paths, nextIndex);
  return entry;
}

export async function attachScreenshotToBug(
  paths: ReportPaths,
  slug: string,
  screenshotPath: string,
): Promise<void> {
  const index = await readBugsIndex(paths);
  const nextIndex = index.map((entry) => (entry.slug === slug ? { ...entry, screenshotPath } : entry));
  await writeBugsIndex(paths, nextIndex);
}

export async function writeSessionReport(
  paths: ReportPaths,
  input: SessionSummaryInput,
  generatedAt: string = new Date().toISOString(),
): Promise<void> {
  const bugs = await readBugsIndex(paths);
  const bugTable =
    bugs.length > 0
      ? [
          "| # | Severity | Title | File |",
          "|---|---|---|---|",
          ...bugs.map(
            (bug) =>
              `| ${bug.seq} | ${bug.severity} | ${bug.title} | ${relative(paths.runDir, bug.filePath)} |`,
          ),
        ].join("\n")
      : "_No bugs reported this session._";

  const list = (items: readonly string[]) =>
    items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "_none_";

  const markdown = `# Session report

## Charter

${input.charter}

## Summary

${input.summary}

## Bugs found

${bugTable}

## Coverage notes

${list(input.coverageNotes)}

## Open questions

${list(input.openQuestions)}
`;

  await mkdir(paths.runDir, { recursive: true });
  await writeFile(paths.reportMdPath, markdown);
  await writeFile(
    paths.reportJsonPath,
    JSON.stringify({ ...input, bugs, generatedAt }, null, 2),
  );
}
