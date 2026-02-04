const { AxeBuilder } = require("@axe-core/playwright");
const fs = require("fs");
const path = require("path");

// =======================
// CONFIG
// =======================
const TAGS_GATE = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const TAGS_AUDIT = [...TAGS_GATE, "best-practice"];

// Ako kasnije poželiš da neka best-practice pravila postanu “gate”:
const RULES_PROMOTED_TO_GATE = []; // npr ["region", "page-has-heading-one"]

const DEFAULT_BLOCKING_IMPACTS = ["critical", "serious", "moderate"];
const DEFAULT_BACKLOG_IMPACTS = ["minor"];

// =======================
// HELPERS
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
    nodes: v.nodes.length,
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
    nodes: v.nodes.map((n) => ({
      target: Array.isArray(n.target)
        ? n.target.join(", ")
        : String(n.target || ""),
      html: n.html,
      failureSummary: n.failureSummary,
    })),
  }));
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
// ARTIFACTS
// =======================
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

function writeA11yArtifacts({
  testName,
  results,
  mode = "gate", // "gate" | "audit"
  promoted = [], // promoted findings (audit → gate)
  writeRaw = false,
}) {
  const outDir = path.join(process.cwd(), "test-results", "a11y");
  fs.mkdirSync(outDir, { recursive: true });

  const safeName = testName.replace(/[^\w\-]+/g, "_").toLowerCase();

  const summaryPath = path.join(outDir, `${safeName}.summary.json`);
  const prettyPath = path.join(outDir, `${safeName}.pretty.json`);
  const rawPath = path.join(outDir, `${safeName}.axe.json`);

  // svi nalazi iz ovog rezultata
  const violations = results.violations || [];

  // impact statistika (lep dodatak za diplomski)
  const impactCounts = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    unknown: 0,
  };

  for (const v of violations) {
    if (impactCounts[v.impact] !== undefined) impactCounts[v.impact]++;
    else impactCounts.unknown++;
  }

  // standardni split (minor backlog)
  const { blocking, backlog } = splitByImpact(violations);

  // --- SUMMARY struktura zavisi od moda ---
  let summary;

  if (mode === "gate") {
    summary = {
      testName,
      mode: "gate",
      url: results.url,
      timestamp: new Date().toISOString(),

      counts: {
        total: violations.length,
        gateBlockers: blocking.length,
        backlog: backlog.length,
        byImpact: impactCounts,
      },

      gateBlockers: summarizeViolations(blocking),
      backlog: summarizeViolations(backlog),
    };
  }

  if (mode === "audit") {
    summary = {
      testName,
      mode: "audit",
      url: results.url,
      timestamp: new Date().toISOString(),

      counts: {
        total: violations.length,
        auditFindings: violations.length,
        backlog: backlog.length,
        promotedToGate: promoted.length,
        byImpact: impactCounts,
      },

      auditFindings: summarizeViolations(violations),

      // ova lista će rasti kako promovišeš pravila u gate
      promotedToGate: summarizeViolations(promoted),

      backlog: summarizeViolations(backlog),
    };
  }

  // snimi summary
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf-8");

  // pretty = full detalji (uvek isto)
  fs.writeFileSync(
    prettyPath,
    JSON.stringify(prettyViolations(violations), null, 2),
    "utf-8",
  );

  // raw opcionalno
  if (writeRaw) {
    fs.writeFileSync(rawPath, JSON.stringify(results, null, 2), "utf-8");
  }

  return {
    summaryPath,
    prettyPath,
    rawPath: writeRaw ? rawPath : null,
  };
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
    lines.push(`  - nodes: ${v.nodes.length}`);
  });

  lines.push("");
  fs.appendFileSync(mdPath, lines.join("\n") + "\n", "utf-8");

  return { mdPath };
}

// =======================
// MAIN: TWO-PASS (Gate + Audit)
// =======================
async function runA11yTwoPass(page, { exclude = [], disableRules = [] } = {}) {
  // Gate scan: WCAG only
  const resultsGate = await runA11yScan(page, {
    tags: TAGS_GATE,
    exclude,
    disableRules,
  });

  // Audit scan: WCAG + best-practice
  const resultsAudit = await runA11yScan(page, {
    tags: TAGS_AUDIT,
    exclude,
    disableRules,
  });

  // Gate blockers = WCAG blockers (critical/serious/moderate)
  const gateSplit = splitByImpact(resultsGate.violations);

  // Ako imaš promovisana best-practice pravila, ona ulaze u blocking
  const promoted = resultsAudit.violations.filter((v) =>
    RULES_PROMOTED_TO_GATE.includes(v.id),
  );

  // Backlog: uzimamo MINOR iz audit-a (da bude “dokaz/backlog”, ne blokira)
  const auditSplit = splitByImpact(resultsAudit.violations);

  return {
    resultsGate,
    resultsAudit,
    blocking: [...gateSplit.blocking, ...promoted],
    backlog: auditSplit.backlog,
  };
}

module.exports = {
  // config/export
  TAGS_GATE,
  TAGS_AUDIT,
  RULES_PROMOTED_TO_GATE,

  // scan
  runA11yTwoPass,

  // artifacts + logs (ovo test koristi)
  writeA11yArtifacts,
  appendToMinorBacklog,
  appendToMinorBacklogMarkdown,
  summarizeViolations,
};
