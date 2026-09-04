import type { DivebellCodeUsageReport } from "@divebell/chunk-map";

export interface AnalyzeCodeUsageFilesOptions {
  chunkMap: string;
  coverage: string[];
  experience?: string[];
  assets?: string;
  output?: string;
}

export interface CodeUsageExperienceNavigation {
  responseStartMs: number | null;
  domContentLoadedMs: number | null;
  loadEventMs: number | null;
  durationMs: number | null;
  transferSize: number | null;
  encodedBodySize: number | null;
  decodedBodySize: number | null;
}

export interface CodeUsageExperienceMemory {
  atReadyBytes: number | null;
  totalAtReadyBytes: number | null;
  atReadySource?: "page-sample" | "command-fallback" | "unavailable";
  peakBytes: number | null;
  peakTimeMs: number | null;
  stableBytes: number | null;
}

export type CodeUsageReadySpec =
  | { kind: "mark"; name: string }
  | { kind: "measure"; name: string }
  | { kind: "selector"; selector: string; condition: "visible" }
  | {
      kind: "heuristic";
      algorithm: "page-stable";
      version: 1;
      quietWindowMs: number;
      timeoutMs: number;
    }
  | {
      kind: "heuristic";
      algorithm: "page-stable";
      version: 2;
      quietWindowMs: number;
      maxInflightRequests: number;
      initialNetworkDrainTimeoutMs: number;
      timeoutMs: number;
    };

export interface CodeUsageReadyResult {
  spec: CodeUsageReadySpec;
  specId: string;
  selectedBy: "user" | "tool-default";
  confidence: "high" | "medium" | "inferred";
  status: "ready" | "timeout";
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  reason: string;
}

export interface CodeUsageExperiencePhase {
  schemaVersion: 1 | 2;
  label: string;
  url: string;
  pathname: string;
  readyTarget: string;
  readyDurationMs: number | null;
  ready?: CodeUsageReadyResult;
  navigation: CodeUsageExperienceNavigation;
  memory: CodeUsageExperienceMemory;
  memorySampling?: {
    api: "performance.memory";
    attempts: number;
    accepted: number;
    firstTimeMs: number | null;
    lastTimeMs: number | null;
    reason: string;
  };
  resourceSampling?: {
    observed: number;
    firstStartTimeMs: number | null;
    lastResponseEndMs: number | null;
  };
  memorySamples: Array<{ timeMs: number; usedBytes: number; totalBytes: number | null }>;
  resources: Array<{
    url: string;
    initiatorType: string;
    startTimeMs: number;
    responseEndMs: number;
    durationMs: number;
    transferSize: number;
    encodedBodySize: number;
    decodedBodySize: number;
  }>;
}

export interface CodeUsageCombinedReport {
  schemaVersion: 1;
  url: string;
  capturedAt: string;
  experience: {
    mode: "current";
    runCount: 1;
    phases: CodeUsageExperiencePhase[];
  };
  usage: DivebellCodeUsageReport;
}

export interface AnalyzeCodeUsageFilesResult {
  chunkMap: string;
  coverage: string[];
  experience?: string[];
  assets: string;
  output: string;
  phaseCount: number;
  report: DivebellCodeUsageReport | CodeUsageCombinedReport;
}

export interface CodeUsageExperienceCaptureOptions {
  outputPath: string;
  label: string;
  readyTarget?: string;
  settleMs: number;
}

export interface CodeUsageExperienceCaptureResult {
  outputPath: string;
  phase: CodeUsageExperiencePhase;
}

export interface CodeUsageReportWriteOptions {
  inputPath: string;
  outputPath?: string;
}

export interface CodeUsageReportWriteResult {
  inputPath: string;
  htmlPath: string;
  dataPath: string;
  phaseCount: number;
  codeFileCount: number;
  codeViewerPageCount: number;
  codeDirectory?: string;
}

export type HtmlReportOpener = (htmlPath: string) => Promise<void>;
