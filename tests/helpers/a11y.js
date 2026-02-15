const { AxeBuilder } = require("@axe-core/playwright");
const fs = require("fs");
const path = require("path");

// =======================
// CONFIG
// =======================
const TAGS_GATE = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const TAGS_AUDIT = [...TAGS_GATE, "best-practice"];

// Best-practice pravila koja "promovišeš" u gate (blokiraju merge):
const RULES_PROMOTED_TO_GATE = ["region"]; // npr ["region", "page-has-heading-one"]

const DEFAULT_BLOCKING_IMPACTS = ["critical", "serious", "moderate"];
const DEFAULT_BACKLOG_IMPACTS = ["minor"];

// =======================
// UTIL
// =======================
function ensureOutDir() {
  const outDir = path.join(process.cwd(), "test-results", "a11y");
  fs.mkdirSync(outDir, { recursive: true });
  return outDir;
}

function safeFileName(name) {
  return String(name || "a11y")
    .replace(/[^\w\-]+/g, "_")
    .toLowerCase();
}

function countByImpact(violations = []) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 };
  for (const v of violations) {
    if (counts[v.impact] !== undefined) counts[v.impact]++;
    else counts.unknown++;
  }
  return counts;
}

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
    // meta (checkpoint)
    step: v.__meta?.step,
    url: v.__meta?.url,
  }));
}

function prettyViolations(violations) {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    helpUrl: v.helpUrl,
    tags: v.tags,
    step: v.__meta?.step,
    url: v.__meta?.url,
    nodes: (v.nodes || []).map((n) => ({
      target: Array.isArray(n.target)
        ? n.target.join(", ")
        : String(n.target || ""),
      html: n.html,
      failureSummary: n.failureSummary,
    })),
  }));
}

// Dedupe ključ: rule id + impact + target set
function violationKey(v) {
  const targets =
    (v.nodes || [])
      .flatMap((n) =>
        Array.isArray(n.target) ? n.target : [String(n.target || "")],
      )
      .join("|") || "";
  return `${v.id}__${v.impact || "unknown"}__${targets}`;
}

function dedupeViolations(list, mode = "perCheckpoint") {
  if (!list?.length) return [];
  if (mode === "none") return list;

  const seen = new Set();
  const out = [];

  for (const v of list) {
    const base = violationKey(v);
    const key =
      mode === "global" ? base : `${v.__meta?.step || "unknown"}__${base}`;

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }

  return out;
}

// =======================
// AXE SCAN
// =======================
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
// TWO-PASS (Gate + Audit)
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

  // jedina istina šta blokira pipeline:
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
// AGGREGATED RUN API
// =======================
function createA11yRun({ testName, dedupeMode = "perCheckpoint" } = {}) {
  return {
    testName: testName || "a11y-run",
    startedAt: new Date().toISOString(),
    dedupeMode,

    checkpoints: [],

    // raw aggregated lists (with __meta)
    blockingAll: [],
    promotedAll: [],
    auditAll: [],
    backlogAll: [],
  };
}

function attachMetaToViolations(violations, meta) {
  return (violations || []).map((v) => ({
    ...v,
    __meta: meta,
  }));
}

async function scanCheckpoint(
  page,
  a11yRun,
  step,
  { exclude = [], disableRules = [], screenshot = false, testInfo = null } = {},
) {
  if (!a11yRun) throw new Error("scanCheckpoint: a11yRun is required");
  if (!step) throw new Error("scanCheckpoint: step label is required");

  const meta = { step, url: page.url(), ts: new Date().toISOString() };

  // optional screenshot evidence per step (samo ako želiš)
  if (screenshot && testInfo) {
    const outDir = ensureOutDir();
    const safeName = safeFileName(`${a11yRun.testName}__${step}`);
    await page.screenshot({
      path: path.join(outDir, `${safeName}.png`),
      fullPage: true,
    });
  }

  const { resultsGate, resultsAudit, blocking, backlog, promoted } =
    await runA11yTwoPass(page, { exclude, disableRules });

  const blockingM = attachMetaToViolations(blocking, meta);
  const promotedM = attachMetaToViolations(promoted, meta);
  const backlogM = attachMetaToViolations(backlog, meta);
  const auditM = attachMetaToViolations(resultsAudit.violations || [], meta);

  a11yRun.blockingAll.push(...blockingM);
  a11yRun.promotedAll.push(...promotedM);
  a11yRun.backlogAll.push(...backlogM);
  a11yRun.auditAll.push(...auditM);

  a11yRun.checkpoints.push({
    step,
    url: meta.url,
    timestamp: meta.ts,
    counts: {
      blocking: blocking.length,
      audit: (resultsAudit.violations || []).length,
      backlog: backlog.length,
      promoted: promoted.length,
    },
  });

  return {
    blockingCount: blocking.length,
    auditCount: (resultsAudit.violations || []).length,
    backlogCount: backlog.length,
  };
}

// =======================
// FINAL ARTIFACTS (1 gate + 1 audit)
// =======================
function writeAggregatedArtifacts(a11yRun) {
  const outDir = ensureOutDir();
  const safeName = safeFileName(a11yRun.testName);

  const gateSummaryPath = path.join(outDir, `${safeName}__gate.summary.json`);
  const gatePrettyPath = path.join(outDir, `${safeName}__gate.pretty.json`);

  const auditSummaryPath = path.join(outDir, `${safeName}__audit.summary.json`);
  const auditPrettyPath = path.join(outDir, `${safeName}__audit.pretty.json`);

  const blockingAll = dedupeViolations(a11yRun.blockingAll, a11yRun.dedupeMode);
  const blockingKeys = new Set(blockingAll.map((v) => violationKey(v)));

  const auditAll = dedupeViolations(
    a11yRun.auditAll.filter((v) => !blockingKeys.has(violationKey(v))),
    a11yRun.dedupeMode,
  );

  const promotedAll = dedupeViolations(a11yRun.promotedAll, a11yRun.dedupeMode);
  const backlogAll = dedupeViolations(a11yRun.backlogAll, a11yRun.dedupeMode);

  // Gate summary
  const gateSummary = {
    testName: a11yRun.testName,
    mode: "gate",
    startedAt: a11yRun.startedAt,
    finishedAt: new Date().toISOString(),
    checkpointCount: a11yRun.checkpoints.length,
    checkpoints: a11yRun.checkpoints,
    counts: {
      gateBlockers: blockingAll.length,
      byImpact: countByImpact(blockingAll),
    },
    gateBlockers: summarizeViolations(blockingAll),
  };

  // Audit summary
  const auditSummary = {
    testName: a11yRun.testName,
    mode: "audit",
    startedAt: a11yRun.startedAt,
    finishedAt: new Date().toISOString(),
    checkpointCount: a11yRun.checkpoints.length,
    checkpoints: a11yRun.checkpoints,
    counts: {
      auditFindings: auditAll.length,
      byImpact: countByImpact(auditAll),
      promotedToGate: promotedAll.length,
      backlogMinor: backlogAll.length,
    },
    auditFindings: summarizeViolations(auditAll),
    promotedToGate: summarizeViolations(promotedAll),
    backlog: summarizeViolations(backlogAll),
  };

  fs.writeFileSync(
    gateSummaryPath,
    JSON.stringify(gateSummary, null, 2),
    "utf-8",
  );
  fs.writeFileSync(
    gatePrettyPath,
    JSON.stringify(prettyViolations(blockingAll), null, 2),
    "utf-8",
  );

  fs.writeFileSync(
    auditSummaryPath,
    JSON.stringify(auditSummary, null, 2),
    "utf-8",
  );
  fs.writeFileSync(
    auditPrettyPath,
    JSON.stringify(prettyViolations(auditAll), null, 2),
    "utf-8",
  );

  return {
    gateSummaryPath,
    gatePrettyPath,
    auditSummaryPath,
    auditPrettyPath,
    blockingAll,
    auditAll,
    backlogAll,
    promotedAll,
  };
}

// backlog u 1 fajl (1 entry po test run-u)
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
    if (v.__meta?.step) lines.push(`  - step: ${v.__meta.step}`);
    if (v.__meta?.url) lines.push(`  - url: ${v.__meta.url}`);
    lines.push(`  - ${v.helpUrl}`);
    lines.push(`  - nodes: ${(v.nodes || []).length}`);
  });

  lines.push("");
  fs.appendFileSync(mdPath, lines.join("\n") + "\n", "utf-8");

  return { mdPath };
}

function finalizeA11yRun(a11yRun, { writeBacklog = true } = {}) {
  const {
    gateSummaryPath,
    gatePrettyPath,
    auditSummaryPath,
    auditPrettyPath,
    blockingAll,
    backlogAll,
  } = writeAggregatedArtifacts(a11yRun);

  // backlog (minor) upiši jednom po testu (ako želiš)
  if (writeBacklog && backlogAll.length) {
    appendToMinorBacklog({
      testName: a11yRun.testName,
      minorViolations: backlogAll,
    });
    appendToMinorBacklogMarkdown({
      testName: a11yRun.testName,
      minorViolations: backlogAll,
    });
  }

  // mali console output
  if (blockingAll.length) {
    console.log("❌ A11y gate blockers found.");
    console.log("Gate summary:", gateSummaryPath);
    console.log("Gate pretty:", gatePrettyPath);
  } else {
    console.log("✅ A11y gate: no blockers.");
    console.log("Gate summary:", gateSummaryPath);
  }

  console.log("Audit summary:", auditSummaryPath);
  console.log("Audit pretty:", auditPrettyPath);

  return { blockingAll, backlogAll };
}

module.exports = {
  TAGS_GATE,
  TAGS_AUDIT,
  RULES_PROMOTED_TO_GATE,

  // existing
  runA11yTwoPass,
  summarizeViolations,

  // new aggregated API
  createA11yRun,
  scanCheckpoint,
  finalizeA11yRun,

  // backlog
  appendToMinorBacklog,
  appendToMinorBacklogMarkdown,
};
