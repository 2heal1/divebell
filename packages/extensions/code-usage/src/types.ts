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
  peakBytes: number | null;
  peakTimeMs: number | null;
  stableBytes: number | null;
}

export interface CodeUsageExperiencePhase {
  schemaVersion: 1;
  label: string;
  url: string;
  pathname: string;
  readyTarget: string;
  readyDurationMs: number | null;
  navigation: CodeUsageExperienceNavigation;
  memory: CodeUsageExperienceMemory;
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
  readyTarget: string;
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
