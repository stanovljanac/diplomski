const { AxeBuilder } = require("@axe-core/playwright");
const fs = require("fs");
const path = require("path");

// =======================
// CONFIG
// =======================
const TAGS_GATE = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const TAGS_AUDIT = [...TAGS_GATE, "best-practice"];

// Best-practice pravila koja želiš da "promovišeš" i da BLOKIRAJU merge:
const RULES_PROMOTED_TO_GATE = ["region"]; // npr ["region", "page-has-heading-one"]

const DEFAULT_BLOCKING_IMPACTS = ["critical", "serious", "moderate"];
const DEFAULT_BACKLOG_IMPACTS = ["minor"];

// =======================
// CORE HELPERS
// =======================
function splitByImpact(
  violations,
  {
    blockingImpacts = DEFAULT_BLOCKING_IMPACTS,
    backlogImpacts = DEFAULT_BACKLOG_IMPACTS,
  } = {},
) {
  return {
    blocking: violations.filter((v) => blockingImpacts.includes(v.impact)),
    backlog: violations.filter((v) => backlogImpacts.includes(v.impact)),
    other: violations.filter(
      (v) =>
        !blockingImpacts.includes(v.impact) &&
        !backlogImpacts.includes(v.impact),
    ),
  };
}

function summarizeViolations(violations) {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes?.length || 0,
    helpUrl: v.helpUrl,
  }));
}

function prettyViolations(violations) {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    helpUrl: v.helpUrl,
    tags: v.tags,
    nodes: (v.nodes || []).map((n) => ({
      target: Array.isArray(n.target)
        ? n.target.join(", ")
        : String(n.target || ""),
      html: n.html,
      failureSummary: n.failureSummary,
    })),
  }));
}

function ensureOutDir() {
  const outDir = path.join(process.cwd(), "test-results", "a11y");
  fs.mkdirSync(outDir, { recursive: true });
  return outDir;
}

function safeFileName(name) {
  return name.replace(/[^\w\-]+/g, "_").toLowerCase();
}

function countByImpact(violations = []) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 };
  for (const v of violations) {
    if (counts[v.impact] !== undefined) counts[v.impact]++;
    else counts.unknown++;
  }
  return counts;
}

async function runA11yScan(
  page,
  { tags = TAGS_GATE, exclude = [], disableRules = [] } = {},
) {
  const builder = new AxeBuilder({ page }).withTags(tags);
  exclude.forEach((sel) => builder.exclude(sel));
  if (disableRules.length) builder.disableRules(disableRules);
  return await builder.analyze();
}

// =======================
// MAIN: TWO-PASS (Gate + Audit)
// =======================
async function runA11yTwoPass(page, { exclude = [], disableRules = [] } = {}) {
  // 1) WCAG gate scan
  const resultsGate = await runA11yScan(page, {
    tags: TAGS_GATE,
    exclude,
    disableRules,
  });

  // 2) Audit scan (WCAG + best-practice)
  const resultsAuditFull = await runA11yScan(page, {
    tags: TAGS_AUDIT,
    exclude,
    disableRules,
  });

  const gateSplit = splitByImpact(resultsGate.violations || []);

  // promoted (best-practice -> gate)
  const promoted = (resultsAuditFull.violations || []).filter((v) =>
    RULES_PROMOTED_TO_GATE.includes(v.id),
  );

  // audit bez promoted (da nema dupliranja)
  const auditFindings = (resultsAuditFull.violations || []).filter(
    (v) => !RULES_PROMOTED_TO_GATE.includes(v.id),
  );

  const auditSplit = splitByImpact(auditFindings);

  // ovo je JEDINA istina šta blokira pipeline:
  const blocking = [...gateSplit.blocking, ...promoted];

  return {
    resultsGate,
    resultsAudit: { ...resultsAuditFull, violations: auditFindings },
    blocking,
    promoted,
    backlog: auditSplit.backlog,
  };
}

// =======================
// ARTIFACTS (ovo rešava tvoj problem)
// =======================
function writeA11yArtifacts({
  testName,
  results,
  mode = "gate", // "gate" | "audit"
  gateBlockers = [], // ✅ kad je gate: OBAVEZNO pošalji blocking ovde
  promoted = [], // audit: lista promoted (informativno)
  writeRaw = false,
}) {
  const outDir = ensureOutDir();
  const safeName = safeFileName(testName);

  const summaryPath = path.join(outDir, `${safeName}.summary.json`);
  const prettyPath = path.join(outDir, `${safeName}.pretty.json`);
  const rawPath = path.join(outDir, `${safeName}.axe.json`);

  const violations = results?.violations || [];

  // backlog je uvek minor iz *ovog* results-a (audit ili gate)
  const { backlog } = splitByImpact(violations);

  let prettyForFile = violations;
  let summary;

  if (mode === "gate") {
    // ✅ ključ: gate.pretty mora prikazati ono što BLOKIRA (WCAG + promoted)
    prettyForFile = gateBlockers;

    summary = {
      testName,
      mode: "gate",
      url: results?.url,
      timestamp: new Date().toISOString(),
      counts: {
        gateBlockers: gateBlockers.length,
        byImpact: countByImpact(gateBlockers),
      },
      gateBlockers: summarizeViolations(gateBlockers),
    };
  } else if (mode === "audit") {
    summary = {
      testName,
      mode: "audit",
      url: results?.url,
      timestamp: new Date().toISOString(),
      counts: {
        auditFindings: violations.length,
        byImpact: countByImpact(violations),
        promotedToGate: promoted.length,
      },
      auditFindings: summarizeViolations(violations),
      promotedToGate: summarizeViolations(promoted),
      backlog: summarizeViolations(backlog),
    };
  } else {
    throw new Error(`writeA11yArtifacts: invalid mode "${mode}"`);
  }

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
  fs.writeFileSync(
    prettyPath,
    JSON.stringify(prettyViolations(prettyForFile), null, 2),
    "utf-8",
  );

  if (writeRaw) {
    fs.writeFileSync(rawPath, JSON.stringify(results, null, 2), "utf-8");
  }

  return { summaryPath, prettyPath, rawPath: writeRaw ? rawPath : null };
}

function appendToMinorBacklog({ testName, minorViolations }) {
  const outDir = ensureOutDir();
  const backlogPath = path.join(outDir, "minor-backlog.json");

  let backlog = [];
  if (fs.existsSync(backlogPath)) {
    try {
      backlog = JSON.parse(fs.readFileSync(backlogPath, "utf-8"));
      if (!Array.isArray(backlog)) backlog = [];
    } catch {
      backlog = [];
    }
  }

  backlog.push({
    timestamp: new Date().toISOString(),
    testName,
    count: minorViolations.length,
    items: prettyViolations(minorViolations),
  });

  fs.writeFileSync(backlogPath, JSON.stringify(backlog, null, 2), "utf-8");
  return { backlogPath };
}

function appendToMinorBacklogMarkdown({ testName, minorViolations }) {
  const outDir = ensureOutDir();
  const mdPath = path.join(outDir, "minor-backlog.md");

  const lines = [];
  lines.push(`## ${new Date().toISOString()} — ${testName}`);
  lines.push(`Minor issues: ${minorViolations.length}`);
  lines.push("");

  minorViolations.forEach((v) => {
    lines.push(`- **${v.id}** (${v.impact}) — ${v.help}`);
    lines.push(`  - ${v.helpUrl}`);
    lines.push(`  - nodes: ${(v.nodes || []).length}`);
  });

  lines.push("");
  fs.appendFileSync(mdPath, lines.join("\n") + "\n", "utf-8");

  return { mdPath };
}

module.exports = {
  TAGS_GATE,
  TAGS_AUDIT,
  RULES_PROMOTED_TO_GATE,

  runA11yTwoPass,
  writeA11yArtifacts,
  appendToMinorBacklog,
  appendToMinorBacklogMarkdown,
  summarizeViolations,
};
