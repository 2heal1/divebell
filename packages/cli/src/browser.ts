import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface BrowserRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface BrowserRunner {
  run(args: string[]): Promise<BrowserRunResult>;
}

const OPENRUNTIME_BROWSER_PROFILE_ENV = "OPENRUNTIME_BROWSER_PROFILE_DIR";
const NEXT_BROWSER_PROFILE_ENV = "OPENRUNTIME_NEXT_BROWSER_PROFILE_DIR";

export interface NextBrowserRunnerOptions {
  profileDirectory?: string;
}

export function createNextBrowserRunner(options: NextBrowserRunnerOptions = {}): BrowserRunner {
  return {
    run: async (args) => {
      try {
        const result = await execFileAsync(process.execPath, [resolveNextBrowserCliPath(), ...args], {
          env: createNextBrowserEnvironment(process.env, options.profileDirectory),
          maxBuffer: 1024 * 1024 * 10
        });
        return {
          exitCode: 0,
          stdout: result.stdout,
          stderr: result.stderr
        };
      } catch (error) {
        if (isExecError(error)) {
          return {
            exitCode: typeof error.code === "number" ? error.code : 1,
            stdout: typeof error.stdout === "string" ? error.stdout : "",
            stderr: typeof error.stderr === "string" ? error.stderr : error.message
          };
        }
        throw error;
      }
    }
  };
}

export function createDefaultBrowserProfileDirectory(): string {
  return join(homedir(), ".openruntime", "browser-profile");
}

export function createNextBrowserEnvironment(baseEnv: NodeJS.ProcessEnv, profileDirectory?: string): NodeJS.ProcessEnv {
  const resolvedProfileDirectory = resolve(
    profileDirectory ?? baseEnv[OPENRUNTIME_BROWSER_PROFILE_ENV] ?? createDefaultBrowserProfileDirectory()
  );

  return {
    ...baseEnv,
    [NEXT_BROWSER_PROFILE_ENV]: resolvedProfileDirectory,
    NODE_OPTIONS: appendNodeImportOption(baseEnv.NODE_OPTIONS, resolveNextBrowserProfilePreloadUrl())
  };
}

export function createGetWindowScript(path: string): string {
  return [
    "((path) => {",
    "  const segments = path.split('.').filter(Boolean);",
    "  let value = globalThis;",
    "  for (const segment of segments) {",
    "    if (value == null) {",
    "      value = undefined;",
    "      break;",
    "    }",
    "    value = value[segment];",
    "  }",
    "  return {",
    "    path,",
    "    found: value !== undefined,",
    "    value: value === undefined ? null : value",
    "  };",
    `})(${JSON.stringify(path)})`
  ].join("\n");
}

export function createWaitEvalScript(script: string): string {
  return `Boolean((${script}))`;
}

export function parseBrowserJsonOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return JSON.parse(trimmed);
}

function resolveNextBrowserCliPath(): string {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve("@vercel/next-browser/package.json");
  return join(dirname(packageJsonPath), "dist", "cli.js");
}

function resolveNextBrowserProfilePreloadUrl(): string {
  return new URL("./next-browser-profile-preload.js", import.meta.url).href;
}

function appendNodeImportOption(nodeOptions: string | undefined, importUrl: string): string {
  const importOption = `--import ${importUrl}`;
  if (nodeOptions === undefined || nodeOptions.trim().length === 0) {
    return importOption;
  }
  return `${nodeOptions} ${importOption}`;
}

function isExecError(error: unknown): error is Error & {
  code?: number | string;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
} {
  return error instanceof Error && ("stdout" in error || "stderr" in error || "code" in error);
}
