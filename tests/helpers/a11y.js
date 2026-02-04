const { AxeBuilder } = require("@axe-core/playwright");
const fs = require("fs");
const path = require("path");

const DEFAULT_BLOCKING_IMPACTS = ["critical", "serious", "moderate"];
const DEFAULT_BACKLOG_IMPACTS = ["minor"];
const TAGS_GATE = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const TAGS_AUDIT = [...TAGS_GATE, "best-practice"];

// Ovo je ključ:
const RULES_PROMOTED_TO_GATE = [
  "page-has-heading-one",
  "region",
  "heading-order",
];

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

function summarizeViolations(violations) {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
    helpUrl: v.helpUrl,
  }));
}

async function runA11yScan(
  page,
  { tags = ["wcag2a", "wcag2aa"], exclude = [], disableRules = [] } = {},
) {
  const builder = new AxeBuilder({ page }).withTags(tags);

  exclude.forEach((sel) => builder.exclude(sel));
  if (disableRules.length) builder.disableRules(disableRules);

  return await builder.analyze();
}

function writeA11yArtifacts({ testName, results, writeRaw = false }) {
  const outDir = path.join(process.cwd(), "test-results", "a11y");
  fs.mkdirSync(outDir, { recursive: true });

  const safeName = testName.replace(/[^\w\-]+/g, "_").toLowerCase();

  const summaryPath = path.join(outDir, `${safeName}.summary.json`);
  const prettyPath = path.join(outDir, `${safeName}.pretty.json`);
  const rawPath = path.join(outDir, `${safeName}.axe.json`);

  const { blocking, backlog } = splitByImpact(results.violations);

  const summary = {
    testName,
    url: results.url,
    timestamp: new Date().toISOString(),
    counts: {
      total: results.violations.length,
      blocking: blocking.length,
      backlog: backlog.length,
    },
    blocking: summarizeViolations(blocking),
    backlog: summarizeViolations(backlog),
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
  fs.writeFileSync(
    prettyPath,
    JSON.stringify(prettyViolations(results.violations), null, 2),
    "utf-8",
  );

  if (writeRaw) {
    fs.writeFileSync(rawPath, JSON.stringify(results, null, 2), "utf-8");
  }

  return { summaryPath, prettyPath, rawPath: writeRaw ? rawPath : null };
}

// ✅ OVO JE NOVO: backlog export
function appendToMinorBacklog({ testName, minorViolations }) {
  const outDir = path.join(process.cwd(), "test-results", "a11y");
  fs.mkdirSync(outDir, { recursive: true });

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
  const outDir = path.join(process.cwd(), "test-results", "a11y");
  fs.mkdirSync(outDir, { recursive: true });

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

module.exports = {
  runA11yScan,
  splitByImpact,
  summarizeViolations,
  prettyViolations,
  writeA11yArtifacts,
  appendToMinorBacklog,
  appendToMinorBacklogMarkdown,
};
