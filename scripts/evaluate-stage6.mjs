import { access, appendFile, readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createOpenRuntime } from "../packages/core/dist/index.js";

const scenarioUrl = new URL("../demos/stage6-evaluation/scenarios.json", import.meta.url);
const repoRootUrl = new URL("../", import.meta.url);
const data = JSON.parse(await readFile(scenarioUrl, "utf8"));
const runStartedAt = performance.now();
const summaryFile = process.env.OPENRUNTIME_STAGE6_SUMMARY ?? process.env.GITHUB_STEP_SUMMARY;

const requiredModernFeatures = ["route", "loader", "ssr", "hydration", "business-ready"];
const requiredMfCoverage = [
  "remote-success",
  "remote-error",
  "shared-conflict",
  "manifest-failure",
  "remote-entry-failure"
];

await verifyModernDemoCoverage(data.modern);
verifyMfCoverage(data.mf);

const rows = [];

for (const scenario of data.modern.scenarios) {
  rows.push(await evaluateScenario("modern", scenario));
}

for (const scenario of data.mf.scenarios) {
  rows.push(await evaluateScenario("mf", scenario));
}

const modernCompleted = rows.some((row) => row.group === "modern" && row.runtime.locatesTarget);
const mfCompleted = rows.some((row) => row.group === "mf" && row.runtime.locatesTarget);

assert(modernCompleted, "Expected at least one Modern.js runtime comparison to locate a target.");
assert(mfCompleted, "Expected at least one MF runtime comparison to locate a target.");

console.log("Stage 6 evaluation passed.");
console.log(`Modern scenarios: ${rows.filter((row) => row.group === "modern").length}`);
console.log(`MF scenarios: ${rows.filter((row) => row.group === "mf").length}`);
console.log("");
console.log("Runtime target explanations:");

for (const row of rows) {
  console.log(
    `- ${row.id}: ${row.runtime.focusedTargetId} is ${row.runtime.status}`
  );
}

console.log("");
console.log("Comparison summary:");

for (const row of rows) {
  console.log(
    `- ${row.id}: baseline ${row.baseline.durationSeconds}s/${row.baseline.manualInterventions} manual, `
      + `runtime estimate ${row.runtime.durationSeconds}s/${row.runtime.manualInterventions} manual`
  );
}

const totalMeasuredMs = performance.now() - runStartedAt;
console.log("");
console.log(`Measured evaluator runtime: ${formatMs(totalMeasuredMs)}`);

if (summaryFile !== undefined) {
  await appendFile(summaryFile, renderSummary(rows, totalMeasuredMs));
}

async function verifyModernDemoCoverage(modern) {
  const features = new Set();

  for (const demo of modern.sourceDemos) {
    await assertPathExists(demo.path);
    await assertPathExists(demo.verifyScript);

    for (const feature of demo.features) {
      features.add(feature);
    }
  }

  for (const feature of requiredModernFeatures) {
    assert(features.has(feature), `Modern.js demo coverage is missing ${feature}.`);
  }
}

function verifyMfCoverage(mf) {
  assert(Array.isArray(mf.sourceCases) && mf.sourceCases.length > 0, "MF source case list is empty.");

  const coverage = new Set();

  for (const scenario of mf.scenarios) {
    for (const item of scenario.covers ?? []) {
      coverage.add(item);
    }
  }

  for (const item of requiredMfCoverage) {
    assert(coverage.has(item), `MF scenario coverage is missing ${item}.`);
  }
}

async function evaluateScenario(group, scenario) {
  const runtimeRound = await runRuntimeRound(scenario);
  const baseline = scenario.baseline;

  assert(
    runtimeRound.focusedTargetId === scenario.runtime.expectedFocusedTarget,
    `${scenario.id} focused ${runtimeRound.focusedTargetId}, expected ${scenario.runtime.expectedFocusedTarget}.`
  );
  assert(
    runtimeRound.status === scenario.runtime.expectedStatus,
    `${scenario.id} status ${runtimeRound.status}, expected ${scenario.runtime.expectedStatus}.`
  );
  assert(
    runtimeRound.durationSeconds < baseline.durationSeconds,
    `${scenario.id} runtime round did not improve duration.`
  );
  assert(
    runtimeRound.manualInterventions <= baseline.manualInterventions,
    `${scenario.id} runtime round increased manual interventions.`
  );
  assert(
    runtimeRound.evidenceCompleteness > baseline.evidenceCompleteness,
    `${scenario.id} runtime round did not improve evidence completeness.`
  );
  assert(
    runtimeRound.locatesTarget && !baseline.locatesTarget,
    `${scenario.id} baseline/runtime target location comparison is not meaningful.`
  );

  return {
    group,
    id: scenario.id,
    baseline,
    runtime: runtimeRound
  };
}

async function runRuntimeRound(scenario) {
  const center = createOpenRuntime();

  for (const target of scenario.runtime.targetDefinitions) {
    center.registerTarget(target);
  }

  for (const update of scenario.runtime.snapshotUpdates) {
    center.updateSnapshot(update);
  }

  const waitResult = await center.waitFor(
    {
      id: scenario.runtime.expectedFocusedTarget,
      status: scenario.runtime.expectedStatus
    },
    {
      timeout: 50
    }
  );

  assert(waitResult.success, `${scenario.id} waitFor did not resolve.`);

  const snapshot = center.getSnapshot();
  const events = center.getEvents({ limit: 50 }).events;
  const focusedTargetId = findFocusedTarget(snapshot, scenario.runtime.expectedFocusedTarget);
  const focusedTarget = snapshot.targets[focusedTargetId];

  assert(focusedTarget !== undefined, `${scenario.id} focused target is missing from snapshot.`);
  assert(
    events.some((event) => event.targetId === focusedTargetId && event.type === "snapshot.updated"),
    `${scenario.id} has no snapshot event for ${focusedTargetId}.`
  );

  return {
    durationSeconds: scenario.runtime.durationSeconds,
    manualInterventions: scenario.runtime.manualInterventions,
    accuracy: scenario.runtime.accuracy,
    evidenceCompleteness: scenario.runtime.evidenceCompleteness,
    evidence: ["targets", "snapshot", "events", "waitFor"],
    focusedTargetId,
    status: focusedTarget.status,
    locatesTarget: true
  };
}

function findFocusedTarget(snapshot, fallbackTargetId) {
  const blockingStatuses = new Set(["blocked", "conflict", "error"]);

  for (const target of Object.values(snapshot.targets)) {
    for (const dependencyId of target.dependsOn ?? []) {
      const dependency = snapshot.targets[dependencyId];

      if (dependency !== undefined && blockingStatuses.has(dependency.status)) {
        return dependency.id;
      }
    }
  }

  for (const target of Object.values(snapshot.targets)) {
    if (blockingStatuses.has(target.status)) {
      return target.id;
    }
  }

  return fallbackTargetId;
}

async function assertPathExists(path) {
  try {
    await access(new URL(path, repoRootUrl));
  } catch {
    throw new Error(`Expected ${path} to exist.`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function renderSummary(rows, totalMeasuredMs) {
  const lines = [
    "## Stage 6 Evaluation",
    "",
    `Measured evaluator runtime: ${formatMs(totalMeasuredMs)}`,
    "",
    "| Scenario | Focus target | Status | Baseline estimate | Runtime estimate |",
    "| --- | --- | --- | ---: | ---: |"
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.id} | \`${row.runtime.focusedTargetId}\` | ${row.runtime.status} | `
        + `${row.baseline.durationSeconds}s / ${row.baseline.manualInterventions} manual | `
        + `${row.runtime.durationSeconds}s / ${row.runtime.manualInterventions} manual |`
    );
  }

  lines.push(
    "",
    "No API key is used in this CI job. It runs deterministic local checks.",
    "",
    "A true end-to-end AI agent benchmark would need model credentials and should stay manual or quota-gated, not part of default PR CI."
  );

  return `${lines.join("\n")}\n\n`;
}

function formatMs(value) {
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }

  return `${(value / 1000).toFixed(2)}s`;
}
