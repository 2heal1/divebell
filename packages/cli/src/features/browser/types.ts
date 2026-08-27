export interface BrowserRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  defaultProfile?: string;
}

export interface BrowserRunOptions {
  ui?: boolean;
  headless?: boolean;
  input?: string;
  session?: string;
  autoConnect?: boolean;
  idleTimeoutMs?: number;
  disableRestore?: boolean;
  disableDefaultProfile?: boolean;
  defaultProfile?: string;
  ignoreConfiguredProfile?: boolean;
  ignoreConfiguredState?: boolean;
  defaultTimeoutMs?: number;
  unencryptedStateOutput?: boolean;
  reuseInitialBlankPage?: boolean;
  browserArguments?: string;
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
  latestChromeProfileResolver?: () => Promise<string | undefined>;
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
