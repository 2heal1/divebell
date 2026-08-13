export interface ParsedCliArgs {
  command: string[];
  options: Map<string, string[]>;
}


export type CommandOutputStatus = "ok" | "needs_input" | "error";

export type CommandErrorKind =
  | "validation"
  | "needs_input"
  | "auth"
  | "browser"
  | "runtime"
  | "not_found"
  | "internal";

export interface CommandOutputMeta {
  version: 1;
  command: string;
}

export interface CliCommandInvocation<TSuccess, TFailure = never> {
  readonly args: readonly string[];
  readonly result?: {
    readonly success: TSuccess;
    readonly failure: TFailure;
  };
}

export interface CliCommandOkResult<T> {
  status: "ok";
  message?: string;
  data: T;
  meta: CommandOutputMeta;
}

export interface CliCommandErrorResult<T = unknown> {
  status: "error";
  message: string;
  error: {
    code: string;
    kind: CommandErrorKind;
    retryable: boolean;
    hint?: string;
    details?: Record<string, unknown>;
  };
  data?: T;
  meta: CommandOutputMeta;
}

export interface CliCommandNeedsInputResult<T = unknown> {
  status: "needs_input";
  message: string;
  options: readonly unknown[];
  data?: T;
  meta: CommandOutputMeta;
}

export interface CommandOutputWriter {
  write(chunk: string): void;
}

export interface CommandErrorOptions {
  code: string;
  kind: CommandErrorKind;
  message: string;
  outputCommand?: string;
  retryable?: boolean;
  hint?: string;
  details?: Record<string, unknown>;
  data?: unknown;
}

export interface CommandOutput {
  ok<T>(data: T, message?: string): void;
  needsInput(message: string, options: readonly unknown[], data?: unknown): void;
  error(error: unknown): void;
}


export interface CliOperationLogEntry {
  schemaVersion: 4;
  command: "open";
  key: string;
  cwd: string;
  url: string;
  openedUrl?: string;
  normalizedUrl: string;
  bridgeUrl: string | null;
  bridgePort: number | null;
  sessionId: string | null;
  openedAt: number;
  exitCode: number;
  activeExtensions: string[];
  browserRestoreDisabled: boolean;
  browserDefaultProfileDisabled: boolean;
  browserDefaultProfile?: string;
  browserRestoreOptions?: Record<string, string[]>;
  headers?: Record<string, string>;
  stackDetection?: {
    url: string;
    detectedAt: number;
    detections: unknown[];
    failures: unknown[];
    detectorCount: number;
    detectorSignature: string;
  };
}

export interface CliOperationLogStore {
  read(): Promise<CliOperationLogEntry | undefined>;
  write(entry: Omit<CliOperationLogEntry, "schemaVersion" | "key" | "cwd">): Promise<void>;
  remove(): Promise<void>;
}
