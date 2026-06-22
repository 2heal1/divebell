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
const OPENRUNTIME_BROWSER_HEADLESS_ENV = "OPENRUNTIME_BROWSER_HEADLESS";
const NEXT_BROWSER_PROFILE_ENV = "OPENRUNTIME_NEXT_BROWSER_PROFILE_DIR";
const NEXT_BROWSER_HEADLESS_ENV = "NEXT_BROWSER_HEADLESS";

export interface NextBrowserRunnerOptions {
  profileDirectory?: string;
  headless?: boolean;
  restartForHeadless?: boolean;
}

export function createNextBrowserRunner(options: NextBrowserRunnerOptions = {}): BrowserRunner {
  let restartedForHeadless = false;
  return {
    run: async (args) => {
      const browserCliPath = resolveNextBrowserCliPath();
      const env = createNextBrowserEnvironment(process.env, options.profileDirectory, options.headless);
      if (options.headless === true && options.restartForHeadless === true && restartedForHeadless === false && args[0] !== "close") {
        restartedForHeadless = true;
        await execFileAsync(process.execPath, [browserCliPath, "close"], {
          env,
          maxBuffer: 1024 * 1024 * 10
        }).catch(() => undefined);
      }
      try {
        const result = await execFileAsync(process.execPath, [browserCliPath, ...args], {
          env,
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

export function createNextBrowserEnvironment(
  baseEnv: NodeJS.ProcessEnv,
  profileDirectory?: string,
  headless?: boolean
): NodeJS.ProcessEnv {
  const resolvedProfileDirectory = resolve(
    profileDirectory ?? baseEnv[OPENRUNTIME_BROWSER_PROFILE_ENV] ?? createDefaultBrowserProfileDirectory()
  );
  const useHeadless = resolveHeadlessMode(baseEnv, headless);

  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    [NEXT_BROWSER_PROFILE_ENV]: resolvedProfileDirectory,
    NODE_OPTIONS: appendNodeImportOption(baseEnv.NODE_OPTIONS, resolveNextBrowserProfilePreloadUrl())
  };
  if (useHeadless) {
    env[NEXT_BROWSER_HEADLESS_ENV] = "1";
  } else {
    delete env[NEXT_BROWSER_HEADLESS_ENV];
  }
  return env;
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

function resolveHeadlessMode(baseEnv: NodeJS.ProcessEnv, override: boolean | undefined): boolean {
  if (override !== undefined) return override;

  const openRuntimeValue = parseBooleanEnvValue(baseEnv[OPENRUNTIME_BROWSER_HEADLESS_ENV]);
  if (openRuntimeValue !== undefined) return openRuntimeValue;

  const nextBrowserValue = parseBooleanEnvValue(baseEnv[NEXT_BROWSER_HEADLESS_ENV]);
  return nextBrowserValue ?? false;
}

function parseBooleanEnvValue(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["", "0", "false", "no", "off"].includes(normalized)) return false;
  return true;
}

function isExecError(error: unknown): error is Error & {
  code?: number | string;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
} {
  return error instanceof Error && ("stdout" in error || "stderr" in error || "code" in error);
}
