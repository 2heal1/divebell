export interface OfficialExtension {
  name: string;
  directory: string;
}

export interface RunCliOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  expectedExitCode?: number;
  allowStderr?: boolean;
}

export interface RunCliSuccessOptions
  extends Omit<RunCliOptions, "expectedExitCode"> {
  expectedExitCode?: 0;
}

export interface RunCliFailureOptions
  extends Omit<RunCliOptions, "expectedExitCode"> {
  expectedExitCode: 1;
}

export interface ProcessResult {
  exitCode: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface CliRunResult<T> extends ProcessResult {
  json: T;
}
