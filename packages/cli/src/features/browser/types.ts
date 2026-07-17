export interface BrowserRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface BrowserRunOptions {
  ui?: boolean;
}

export interface BrowserRunner {
  run(args: string[], options?: BrowserRunOptions): Promise<BrowserRunResult>;
}

export interface AgentBrowserJsonResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  errorCode?: string;
}

export interface AgentBrowserRunnerOptions {
  executablePath?: string;
  prefixArgs?: string[];
  profileDirectory?: string;
  session?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

export interface DefaultBrowserRunnerOptions {
  env?: NodeJS.ProcessEnv;
  agentBrowser?: AgentBrowserRunnerOptions;
}


export type BrowserConsoleLevel = "log" | "info" | "warn" | "error";

export interface BrowserConsoleEntry {
  level: BrowserConsoleLevel;
  args: string;
  timestamp?: number;
}

