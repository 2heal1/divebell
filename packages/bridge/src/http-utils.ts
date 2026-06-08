import type { IncomingMessage, ServerResponse } from "node:http";
import type { BridgeErrorBody } from "./types.js";

export class BridgeHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function writeCorsHeaders(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

export function writeJson(response: ServerResponse, status: number, body: unknown): void {
  writeCorsHeaders(response);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

export function writeError(response: ServerResponse, error: unknown): void {
  const httpError = error instanceof BridgeHttpError
    ? error
    : new BridgeHttpError(500, "internal_error", error instanceof Error ? error.message : String(error));

  const body: BridgeErrorBody = {
    error: {
      message: httpError.message,
      code: httpError.code
    }
  };
  writeJson(response, httpError.status, body);
}

export async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) return undefined;

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BridgeHttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

export function getPathSegments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
}
