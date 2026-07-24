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
  schemaVersion: 3;
  command: "open";
  key: string;
  cwd: string;
  url: string;
  normalizedUrl: string;
  bridgeUrl: string | null;
  bridgePort: number | null;
  sessionId: string | null;
  openedAt: number;
  exitCode: number;
  activeExtensions: string[];
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
