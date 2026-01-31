const { AxeBuilder } = require("@axe-core/playwright");
const fs = require("fs");
const path = require("path");

function filterByImpact(
  violations,
  impacts = ["critical", "serious", "moderate"],
) {
  return violations.filter((v) => impacts.includes(v.impact));
}

// Super korisno za diplomski i za debug:
function prettyViolations(violations) {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    helpUrl: v.helpUrl,
    tags: v.tags,
    nodes: v.nodes.map((n) => ({
      target: n.target?.join(", "),
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
  { tags = ["wcag2a", "wcag2aa"], exclude = [] } = {},
) {
  const builder = new AxeBuilder({ page }).withTags(tags);
  exclude.forEach((sel) => builder.exclude(sel));
  return await builder.analyze();
}

function writeA11yArtifacts({ testName, results }) {
  const outDir = path.join(process.cwd(), "test-results", "a11y");
  fs.mkdirSync(outDir, { recursive: true });

  const safeName = testName.replace(/[^\w\-]+/g, "_").toLowerCase();
  const jsonPath = path.join(outDir, `${safeName}.axe.json`);
  const prettyPath = path.join(outDir, `${safeName}.pretty.json`);

  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), "utf-8");
  fs.writeFileSync(
    prettyPath,
    JSON.stringify(prettyViolations(results.violations), null, 2),
    "utf-8",
  );

  return { jsonPath, prettyPath };
}

module.exports = {
  runA11yScan,
  filterByImpact,
  summarizeViolations,
  prettyViolations,
  writeA11yArtifacts,
};
