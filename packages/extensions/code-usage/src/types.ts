import type { DivebellCodeUsageReport } from "@divebell/chunk-map";

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
  report: DivebellCodeUsageReport;
}

export interface CodeUsageReportWriteOptions {
  inputPath: string;
  outputPath?: string;
}

export interface CodeUsageReportWriteResult {
  inputPath: string;
  htmlPath: string;
  phaseCount: number;
  codeFileCount: number;
  codeViewerPageCount: number;
  codeDirectory?: string;
}

export type HtmlReportOpener = (htmlPath: string) => Promise<void>;
