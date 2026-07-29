import { once } from "node:events";
import { createServer, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createCodeUsageStreamFileHtml,
  createCodeUsageStreamReportHtml
} from "./report.js";

const INITIAL_ITEM_COUNT = 4;
const ITEM_BATCH_SIZE = 12;
const CODE_BATCH_LENGTH = 24 * 1024;

interface CodeFileSource {
  file: string;
  code: string;
  totalBytes: number;
}

interface CodeViewerLink {
  file: string;
  href: string;
  chunkIds: string[];
  totalBytes: number;
  partCount: number;
}

export interface CodeUsageReportServerOptions {
  inputPath: string;
  host?: string;
  port?: number;
}

export interface CodeUsageReportServer {
  url: string;
  close(): Promise<void>;
  server: Server;
}

export async function startCodeUsageReportServer(
  options: CodeUsageReportServerOptions
): Promise<CodeUsageReportServer> {
  const inputPath = resolve(options.inputPath);
  const report = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const usage = getUsage(report);
  const codeFiles = getCodeFiles(usage);
  const codeFileByName = new Map(codeFiles.map((file) => [file.file, file]));
  const viewers = createCodeViewerLinks(usage, codeFiles);
  const reportHtml = await createCodeUsageStreamReportHtml(report, viewers, "/api/report");
  const codeHtmlByFile = new Map<string, string>();

  const server = createServer((request, response) => {
    void handleRequest().catch((error) => {
      if (!response.headersSent) {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      response.end(error instanceof Error ? error.message : String(error));
    });

    async function handleRequest(): Promise<void> {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/" || url.pathname === "/index.html") {
        sendHtml(response, reportHtml);
        return;
      }
      if (url.pathname === "/api/report") {
        await streamReport(response, report, usage, viewers);
        return;
      }
      if (url.pathname === "/code") {
        const file = url.searchParams.get("file") ?? "";
        if (!codeFileByName.has(file)) {
          sendNotFound(response);
          return;
        }
        let html = codeHtmlByFile.get(file);
        if (html === undefined) {
          html = await createCodeUsageStreamFileHtml(`/api/code?file=${encodeURIComponent(file)}`);
          codeHtmlByFile.set(file, html);
        }
        sendHtml(response, html);
        return;
      }
      if (url.pathname === "/api/code") {
        const file = url.searchParams.get("file") ?? "";
        const source = codeFileByName.get(file);
        if (source === undefined) {
          sendNotFound(response);
          return;
        }
        await streamCode(response, usage, source);
        return;
      }
      if (url.pathname === "/favicon.ico") {
        response.writeHead(204);
        response.end();
        return;
      }
      sendNotFound(response);
    }
  });

  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4173;
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolveListen();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await closeServer(server);
    throw new Error("Unable to determine the report server address.");
  }
  return {
    server,
    url: `http://${host}:${address.port}/`,
    close: async () => await closeServer(server)
  };
}

export async function waitForCodeUsageReportServer(server: CodeUsageReportServer): Promise<void> {
  const close = () => void server.close();
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  try {
    if (server.server.listening) await once(server.server, "close");
  } finally {
    process.off("SIGINT", close);
    process.off("SIGTERM", close);
  }
}

async function streamReport(
  response: ServerResponse,
  report: unknown,
  usage: Record<string, unknown>,
  viewers: CodeViewerLink[]
): Promise<void> {
  startStream(response);
  const phases = getPhases(usage);
  const streamedPhases = phases.map((phase) => ({
    ...phase,
    chunks: getStreamItems(phase, "chunks").slice(0, INITIAL_ITEM_COUNT),
    sources: getStreamItems(phase, "sources").slice(0, INITIAL_ITEM_COUNT),
    packages: getStreamItems(phase, "packages").slice(0, INITIAL_ITEM_COUNT)
  }));
  const { codeFiles: _codeFiles, phases: _phases, ...usageRest } = usage;
  const root = isRecord(report) && isRecord(report.usage)
    ? { ...report, usage: { ...usageRest, phases: streamedPhases, codeViewers: viewers } }
    : { ...usageRest, phases: streamedPhases, codeViewers: viewers };
  await writeEvent(response, { type: "start", report: root });

  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
    const phase = phases[phaseIndex];
    if (phase === undefined) continue;
    for (const field of ["chunks", "sources", "packages"] as const) {
      const items = getStreamItems(phase, field);
      for (let offset = INITIAL_ITEM_COUNT; offset < items.length; offset += ITEM_BATCH_SIZE) {
        if (response.destroyed) return;
        await writeEvent(response, {
          type: "batch",
          phaseIndex,
          field,
          items: items.slice(offset, offset + ITEM_BATCH_SIZE)
        });
      }
    }
  }
  await writeEvent(response, { type: "done" });
  response.end();
}

function getStreamItems(
  phase: Record<string, unknown>,
  field: "chunks" | "sources" | "packages"
): unknown[] {
  const items = getArray(phase[field]);
  if (field === "chunks") return items;
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => streamPriority(left.item, field) - streamPriority(right.item, field)
      || left.index - right.index)
    .map(({ item }) => item);
}

function streamPriority(item: unknown, field: "sources" | "packages"): number {
  if (!isRecord(item)) return 2;
  if (field === "packages") return item.kind === "application" ? 0 : 1;
  return isRecord(item.owner) && item.owner.kind === "application" ? 0 : 1;
}

async function streamCode(
  response: ServerResponse,
  usage: Record<string, unknown>,
  source: CodeFileSource
): Promise<void> {
  startStream(response);
  const phases = getPhases(usage).flatMap((phase) => {
    const codeFiles = getArray(phase.codeFiles);
    const result = codeFiles.find((item) => isRecord(item) && item.file === source.file);
    if (!isRecord(result)) return [];
    return [{
      label: typeof phase.label === "string" ? phase.label : "",
      totalBytes: finiteNumber(result.totalBytes) ?? source.totalBytes,
      usedBytes: finiteNumber(result.usedBytes) ?? 0,
      usedRatio: finiteNumber(result.usedRatio),
      executedRanges: getArray(result.executedRanges),
      sources: getSourceRangesForFile(phase, source.file)
    }];
  });
  await writeEvent(response, {
    type: "start",
    data: {
      file: source.file,
      totalBytes: source.totalBytes,
      partIndex: 0,
      partCount: 1,
      partStartOffset: 0,
      partEndOffset: source.code.length,
      partLength: source.code.length,
      reportHref: "/",
      previousHref: null,
      nextHref: null,
      phases
    }
  });
  for (let offset = 0; offset < source.code.length; offset += CODE_BATCH_LENGTH) {
    if (response.destroyed) return;
    await writeEvent(response, {
      type: "code",
      value: source.code.slice(offset, offset + CODE_BATCH_LENGTH)
    });
  }
  await writeEvent(response, { type: "done" });
  response.end();
}

function getSourceRangesForFile(
  phase: Record<string, unknown>,
  file: string
): Array<Record<string, unknown>> {
  return getArray(phase.sources).flatMap((source) => {
    if (!isRecord(source) || typeof source.sourcePath !== "string") return [];
    const fileRange = getArray(source.fileRanges)
      .find((item) => isRecord(item) && item.file === file);
    if (!isRecord(fileRange)) return [];
    return [{
      sourcePath: source.sourcePath,
      totalBytes: finiteNumber(source.totalBytes) ?? 0,
      usedBytes: finiteNumber(source.usedBytes) ?? 0,
      usedRatio: finiteNumber(source.usedRatio),
      mappedRanges: getArray(fileRange.mappedRanges),
      executedRanges: getArray(fileRange.executedRanges)
    }];
  });
}

function createCodeViewerLinks(
  usage: Record<string, unknown>,
  codeFiles: CodeFileSource[]
): CodeViewerLink[] {
  const phases = getPhases(usage);
  return codeFiles.map((source) => {
    const chunkIds = new Set<string>();
    for (const phase of phases) {
      for (const item of getArray(phase.codeFiles)) {
        if (!isRecord(item) || item.file !== source.file) continue;
        for (const chunkId of getArray(item.chunkIds)) chunkIds.add(String(chunkId));
      }
    }
    return {
      file: source.file,
      href: `/code?file=${encodeURIComponent(source.file)}`,
      chunkIds: [...chunkIds],
      totalBytes: source.totalBytes,
      partCount: 1
    };
  });
}

function getUsage(report: unknown): Record<string, unknown> {
  if (!isRecord(report)) throw new Error("The report must be a JSON object.");
  const usage = isRecord(report.usage) ? report.usage : report;
  if (getPhases(usage).length === 0) throw new Error("The report has no code usage phases.");
  return usage;
}

function getCodeFiles(usage: Record<string, unknown>): CodeFileSource[] {
  return getArray(usage.codeFiles).flatMap((item) => {
    if (!isRecord(item) || typeof item.file !== "string" || typeof item.code !== "string") return [];
    return [{
      file: item.file,
      code: item.code,
      totalBytes: finiteNumber(item.totalBytes) ?? Buffer.byteLength(item.code, "utf8")
    }];
  });
}

function getPhases(usage: Record<string, unknown>): Record<string, unknown>[] {
  return getArray(usage.phases).filter(isRecord);
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function startStream(response: ServerResponse): void {
  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    "X-Content-Type-Options": "nosniff",
    "X-Accel-Buffering": "no"
  });
  response.flushHeaders();
}

async function writeEvent(response: ServerResponse, event: unknown): Promise<void> {
  if (!response.write(`${JSON.stringify(event)}\n`)) await once(response, "drain");
  await new Promise<void>((resolveImmediate) => setImmediate(resolveImmediate));
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(html);
}

function sendNotFound(response: ServerResponse): void {
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => error === undefined ? resolveClose() : reject(error));
    server.closeIdleConnections();
    server.closeAllConnections();
  });
}
