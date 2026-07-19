import type { OpenRuntimeCodeUsageReport } from "@openruntime/chunk-map";

export interface AnalyzeCodeUsageFilesOptions {
  chunkMap: string;
  coverage: string[];
  assets?: string;
  output?: string;
}

export interface AnalyzeCodeUsageFilesResult {
  chunkMap: string;
  coverage: string[];
  assets: string;
  output: string;
  phaseCount: number;
  report: OpenRuntimeCodeUsageReport;
}

export interface CodeUsageReportWriteOptions {
  inputPath: string;
  outputPath?: string;
}

export interface CodeUsageReportWriteResult {
  inputPath: string;
  htmlPath: string;
  phaseCount: number;
}

export type HtmlReportOpener = (htmlPath: string) => Promise<void>;
