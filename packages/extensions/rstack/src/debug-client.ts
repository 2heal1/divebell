import type {
  DivebellBrowserApi,
  DivebellBrowserDebugEnableResult,
  DivebellBrowserDebugEvent,
  DivebellBrowserDebugEventsResult,
  DivebellBrowserDebugProbeResult,
  DivebellBrowserDebugScript,
  DivebellBrowserDebugSourceSearchResult,
  DivebellBrowserDebugStatusResult
} from "@divebell/cli";

export type DebugStatus = DivebellBrowserDebugStatusResult;
export type DebugEnableResult = DivebellBrowserDebugEnableResult;
export type DebugScript = DivebellBrowserDebugScript;
export type DebugSourceSearchResult = DivebellBrowserDebugSourceSearchResult;
export type DebugEventsResult = DivebellBrowserDebugEventsResult;
export type DebugEvent = DivebellBrowserDebugEvent;
export type DebugProbeResult = DivebellBrowserDebugProbeResult;

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
    const result = await this.browser.debug.status();
    this.rememberTabs(result.sessions);
    return result;
  }

  async enable(): Promise<DebugEnableResult> {
    const result = await this.browser.debug.enable();
    this.rememberTabs(result.sessions);
    return result;
  }

  async disable(sessionId: string): Promise<unknown> {
    return await this.browser.debug.disable(this.targetOptions(sessionId));
  }

  async scripts(sessionId?: string): Promise<DebugScript[]> {
    return await this.browser.debug.scripts(this.targetOptions(sessionId));
  }

  async sourceSearch(query: string, sessionId?: string): Promise<DebugSourceSearchResult> {
    return await this.browser.debug.sourceSearch(query, {
      ...this.targetOptions(sessionId),
      maxResults: 1000
    });
  }

  async source(scriptId: string, sessionId: string): Promise<{
    script: DebugScript;
    scriptSource: string;
  }> {
    return await this.browser.debug.source(scriptId, this.targetOptions(sessionId));
  }

  async events(since: number, wait = 0): Promise<DebugEventsResult> {
    return await this.browser.debug.events({
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
    tags: Readonly<Record<string, string>>;
  }): Promise<DebugProbeResult> {
    return await this.browser.debug.logpoints.set({
      ...this.targetOptions(input.sessionId),
      scriptId: input.scriptId,
      line: input.line,
      column: input.column,
      expressions: input.expressions,
      tags: input.tags,
      mode: "after",
      maxLines: 1,
      maxUtf16Distance: 512
    });
  }

  async listLogpoints(): Promise<{ probes: DebugProbeResult[] }> {
    return await this.browser.debug.logpoints.list();
  }

  async listBreakpoints(): Promise<{ probes: DebugProbeResult[] }> {
    return await this.browser.debug.breakpoints.list();
  }

  async removeLogpoint(probeId: string): Promise<unknown> {
    return await this.browser.debug.logpoints.remove(probeId);
  }

  private targetOptions(sessionId: string | undefined): { tab?: string } {
    const tab = sessionId === undefined ? undefined : this.tabBySession.get(sessionId);
    return tab === undefined ? {} : { tab };
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
