import type {
  DivebellBrowserApi,
  DivebellBrowserCommandOptionValue
} from "@divebell/cli";

import { rstackError } from "./errors.js";

export interface DebugStatus {
  connectionGeneration: number;
  enabledSessions: number;
  sessions: Array<{
    sessionId: string;
    documentGeneration: number;
    enabled: boolean;
    tabId?: string;
    targetId?: string;
  }>;
}

export interface DebugEnableResult {
  enabled: boolean;
  connectionGeneration: number;
  sessions: Array<{
    sessionId: string;
    tabId?: string;
  }>;
}

export interface DebugScript {
  connectionGeneration: number;
  sessionId: string;
  documentGeneration: number;
  scriptId: string;
  executionContextId?: number;
  url?: string;
  scriptInstanceKey?: unknown;
  runtimeOwner?: unknown;
}

export interface DebugSourceSearchResult {
  matches: Array<{
    scriptId: string;
    sessionId: string;
    url?: string;
    line: number;
    column: number;
  }>;
}

export interface DebugEventsResult {
  events: DebugEvent[];
  oldestSequence?: number;
  latestSequence: number;
  gap: boolean;
  bufferGap: boolean;
  transportGap: boolean;
  droppedThroughSequence?: number;
  lastTransportGapSequence?: number;
}

export interface DebugEvent {
  sequence: number;
  timestamp: number;
  type: string;
  connectionGeneration: number;
  sessionId?: string;
  documentGeneration?: number;
  data?: unknown;
}

export interface DebugProbeResult {
  probeId: string;
  status: string;
  bindings?: Array<{
    actualLocation?: {
      line?: number;
      column?: number;
    };
  }>;
}

type DebugOptionValue = DivebellBrowserCommandOptionValue;

export class DebugClient {
  readonly browser: DivebellBrowserApi;

  constructor(browser: DivebellBrowserApi) {
    this.browser = browser;
  }

  async status(): Promise<DebugStatus> {
    return await this.run<DebugStatus>(["status"]);
  }

  async enable(): Promise<DebugEnableResult> {
    return await this.run<DebugEnableResult>(["enable"]);
  }

  async disable(sessionId: string): Promise<unknown> {
    return await this.run(["disable"], {}, sessionId);
  }

  async scripts(sessionId?: string): Promise<DebugScript[]> {
    const result = await this.run<{ scripts: DebugScript[] }>(
      ["scripts"],
      {},
      sessionId
    );
    return result.scripts;
  }

  async sourceSearch(query: string, sessionId?: string): Promise<DebugSourceSearchResult> {
    return await this.run<DebugSourceSearchResult>(
      ["source", "search", query],
      { "max-results": 1000 },
      sessionId
    );
  }

  async source(scriptId: string, sessionId: string): Promise<{
    script: DebugScript;
    scriptSource: string;
  }> {
    return await this.run(["source", scriptId], {}, sessionId);
  }

  async events(since: number, wait = 0): Promise<DebugEventsResult> {
    return await this.run<DebugEventsResult>(["events"], {
      since,
      ...(wait <= 0 ? {} : { wait })
    });
  }

  async setLogpoint(input: {
    sessionId: string;
    scriptId: string;
    line: number;
    column: number;
    expressions: readonly string[];
    tags: readonly string[];
  }): Promise<DebugProbeResult> {
    return await this.run<DebugProbeResult>(
      ["logpoint", "set", input.scriptId, String(input.line)],
      {
        column: input.column,
        expression: input.expressions,
        tag: input.tags,
        after: true,
        "max-lines": 1,
        "max-utf16-distance": 512
      },
      input.sessionId
    );
  }

  async listLogpoints(): Promise<{ probes: DebugProbeResult[] }> {
    return await this.run(["logpoint", "list"]);
  }

  async listBreakpoints(): Promise<{ probes: DebugProbeResult[] }> {
    return await this.run(["breakpoint", "list"]);
  }

  async removeLogpoint(probeId: string): Promise<unknown> {
    return await this.run(["logpoint", "remove", probeId]);
  }

  private async run<T>(
    args: readonly string[],
    options: Readonly<Record<string, DebugOptionValue>> = {},
    cdpSession?: string
  ): Promise<T> {
    const output = await this.browser.run("debug", {
      args,
      options: {
        ...options,
        ...(cdpSession === undefined ? {} : { "cdp-session": cdpSession }),
        json: true
      }
    });
    try {
      return JSON.parse(output) as T;
    } catch (error) {
      throw rstackError({
        code: "RSTACK_DEBUG_OUTPUT_INVALID",
        kind: "browser",
        message: `agent-browser returned invalid debugger JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
        details: { output }
      });
    }
  }
}
