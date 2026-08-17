import type { DivebellBrowserApi } from "@divebell/cli";

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

type DebugOptionScalar = string | number | boolean;
type DebugOptionValue = DebugOptionScalar | readonly DebugOptionScalar[];

export class DebugClient {
  readonly browser: DivebellBrowserApi;
  // Follow-up debugger commands use the stable tab selector. Forwarding the
  // CDP ID as `--session` can be consumed as an agent-browser daemon session
  // during process bootstrap instead of as the debugger page selector.
  private readonly tabBySession = new Map<string, string>();

  constructor(browser: DivebellBrowserApi) {
    this.browser = browser;
  }

  async status(): Promise<DebugStatus> {
    const result = await this.run<DebugStatus>(["status"]);
    this.rememberTabs(result.sessions);
    return result;
  }

  async enable(): Promise<DebugEnableResult> {
    const result = await this.run<DebugEnableResult>(["enable"]);
    this.rememberTabs(result.sessions);
    return result;
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
    debugSessionId?: string
  ): Promise<T> {
    const tabId = debugSessionId === undefined
      ? undefined
      : this.tabBySession.get(debugSessionId);
    const command = ["debug", ...args];
    appendDebugOptions(command, {
      ...options,
      ...(tabId === undefined ? {} : { tab: tabId }),
      json: true
    });
    const result = await this.browser.raw(command);
    if (result.exitCode !== 0) {
      throw rstackError({
        code: "RSTACK_DEBUG_COMMAND_FAILED",
        kind: "browser",
        message: result.stderr.trim() || result.stdout.trim() || "agent-browser debugger command failed.",
        details: {
          command,
          ...(result.stdout.trim().length === 0 ? {} : { stdout: result.stdout.trim() }),
          ...(result.stderr.trim().length === 0 ? {} : { stderr: result.stderr.trim() })
        }
      });
    }
    try {
      return JSON.parse(result.stdout) as T;
    } catch (error) {
      throw rstackError({
        code: "RSTACK_DEBUG_OUTPUT_INVALID",
        kind: "browser",
        message: `agent-browser returned invalid debugger JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
        details: { output: result.stdout }
      });
    }
  }

  private rememberTabs(
    sessions: ReadonlyArray<{ sessionId: string; tabId?: string }>
  ): void {
    for (const session of sessions) {
      if (session.tabId !== undefined) {
        this.tabBySession.set(session.sessionId, session.tabId);
      }
    }
  }
}

function appendDebugOptions(
  args: string[],
  options: Readonly<Record<string, DebugOptionValue>>
): void {
  for (const [name, rawValue] of Object.entries(options)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      args.push(`--${name}`);
      if (value !== true) args.push(String(value));
    }
  }
}
