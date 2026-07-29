import type { DivebellBrowserApi } from "@divebell/cli";

export interface MemoryCheckPage {
  eval(script: string): Promise<unknown>;
  waitEval(script: string, options?: { timeout?: number }): Promise<void>;
}

export interface MemoryCheckScenarioContext {
  page: MemoryCheckPage;
  iteration: number;
  phase: "setup" | "warmup" | "measure";
}

export interface MemoryCheckScenario {
  setup?(context: MemoryCheckScenarioContext): Promise<void> | void;
  run(context: MemoryCheckScenarioContext): Promise<void> | void;
}

export interface RunMemoryCheckOptions {
  url: string;
  scenarioPath: string;
  artifactDirectory: string;
  warmup: number;
  iterations: number;
  browser: DivebellBrowserApi;
  ui?: boolean;
}

export interface MemoryMetricPoint {
  iteration: number;
  jsHeapUsedSize: number | null;
  jsHeapTotalSize: number | null;
  documents: number | null;
  nodes: number | null;
  jsEventListeners: number | null;
}

export interface MemoryCheckReport {
  url: string;
  warmup: number;
  iterations: number;
  verdict: "no-clear-growth" | "suspicious-growth";
  reasons: string[];
  baseline: MemoryMetricPoint;
  final: MemoryMetricPoint;
  deltas: Record<string, number | null>;
  slopesPerIteration: Record<string, number | null>;
  topFunctions: unknown[];
  series: MemoryMetricPoint[];
}

export interface RunMemoryCheckResult {
  reportPath: string;
  baselineSnapshotPath: string;
  finalSnapshotPath: string;
  allocationProfilePath: string;
  report: MemoryCheckReport;
}
