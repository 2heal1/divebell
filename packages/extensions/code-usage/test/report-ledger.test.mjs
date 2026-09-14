import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../assets/code-usage-report.html", import.meta.url), "utf8");
function renderFunction(name, nextName) {
  return html.slice(html.indexOf(`const ${name} =`), html.indexOf(`const ${nextName} =`));
}
function fixture() {
  const elements = new Map();
  const element = () => ({ children: [], textContent: "", hidden: false, append(...items) { this.children.push(...items); }, replaceChildren() { this.children = []; } });
  const context = vm.createContext({
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element, createTextNode: text => text },
    formatText: (text, values = {}) => text.replace(/\{(\w+)\}/g, (_, key) => String(values[key])),
    formatBytes: n => String(n), formatPercent: n => String(n), numberOrNull: n => n,
    classifyScriptUrl: () => "unknown", scriptCategoryLabel: x => x, scriptReasonLabel: x => x
  });
  vm.runInContext(renderFunction("renderCoverageScope", "renderOpportunities"), context);
  const start = html.indexOf("const renderOpportunities =");
  const end = html.indexOf("\n        const ", start + 6);
  vm.runInContext(html.slice(start, end), context);
  return { elements, context };
}

test("runtime identity warning distinguishes URL matches from verified content", () => {
  const { elements, context } = fixture();
  context.phase = { scriptsObserved: 2, scriptsMatched: 2 };
  vm.runInContext("renderCoverageScope(phase)", context);
  assert.match(elements.get("coverage-scope-summary").textContent, /NOT fully verified: 2 unverified/);
  context.phase.contentIdentity = { verified: true, exact: 1, embedded: 1, unverified: 0, mismatch: 0 };
  vm.runInContext("renderCoverageScope(phase)", context);
  assert.match(elements.get("coverage-scope-summary").textContent, /1 exact, 1 embedded/);
  assert.doesNotMatch(elements.get("coverage-scope-summary").textContent, /NOT fully/);
});

test("exclusive ledger keeps all chunks in unexecuted-byte order without overlapping attribution rows", () => {
  const { elements, context } = fixture();
  context.phase = { opportunities: [
    { subject: "overlapping package", kind: "large-low-use-package", savingsAccounting: "overlapping-attribution", potentialSavingsBytes: 10000 },
    ...Array.from({ length: 12 }, (_, i) => ({ subject: `chunk-${i}`, kind: "large-low-use-chunk", potentialSavingsBytes: i + 1, totalBytes: 100, usedBytes: 1 }))
  ] };
  vm.runInContext("renderOpportunities(phase)", context);
  const rows = elements.get("opportunity-list").children;
  assert.equal(rows.length, 12);
  assert.equal(rows[0].children[0].textContent, "chunk-11");
  assert.equal(rows.at(-1).children[0].textContent, "chunk-0");
});

test("opportunity cards present observed total/executed/unexecuted bytes and support legacy aliases", () => {
  const { elements, context } = fixture();
  context.phase = { opportunities: [
    { subject: "current", kind: "large-low-use-chunk", totalBytes: 100, usedBytes: 30, unusedBytes: 70, potentialSavingsBytes: 70, coverageFloorBytes: 30 },
    { subject: "legacy", kind: "large-low-use-chunk", totalBytes: 80, potentialSavingsBytes: 60, coverageFloorBytes: 20 }
  ] };
  vm.runInContext("renderOpportunities(phase)", context);
  const rows = elements.get("opportunity-list").children;
  assert.equal(rows[0].children[1].textContent, "Observed raw: 100 total · 30 executed · 70 unexecuted (ranking)");
  assert.equal(rows[1].children[1].textContent, "Observed raw: 80 total · 20 executed · 60 unexecuted (ranking)");
});
