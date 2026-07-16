import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

interface AgentBrowserJsonResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  errorCode?: string;
}

export const OPENRUNTIME_BROWSER_PROFILE_ENV = "OPENRUNTIME_BROWSER_PROFILE_DIR";
export const OPENRUNTIME_AGENT_BROWSER_EXECUTABLE_ENV = "OPENRUNTIME_AGENT_BROWSER_EXECUTABLE";
export const OPENRUNTIME_AGENT_BROWSER_SESSION_ENV = "OPENRUNTIME_AGENT_BROWSER_SESSION";
const AGENT_BROWSER_PROFILE_ENV = "AGENT_BROWSER_PROFILE";
const AGENT_BROWSER_SESSION_ENV = "AGENT_BROWSER_SESSION";
const AGENT_BROWSER_HEADED_ENV = "AGENT_BROWSER_HEADED";
const AGENT_BROWSER_STATE_ENV = "AGENT_BROWSER_STATE";
const OPENRUNTIME_AUTH_STATE_FILE_NAME = ".openruntime-auth-state.json";

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

export function createDefaultBrowserRunner(options: DefaultBrowserRunnerOptions = {}): BrowserRunner {
  const env = options.env ?? process.env;
  return createAgentBrowserRunner({
    ...options.agentBrowser,
    env
  });
}

export function createAgentBrowserRunner(options: AgentBrowserRunnerOptions = {}): BrowserRunner {
  const baseEnv = options.env ?? process.env;
  const executablePath = options.executablePath
    ?? baseEnv[OPENRUNTIME_AGENT_BROWSER_EXECUTABLE_ENV]
    ?? "agent-browser";
  const prefixArgs = options.prefixArgs ?? [];

  return {
    run: async (args, runOptions = {}) => {
      try {
        const result = await execFileAsync(executablePath, [...prefixArgs, ...args], {
          cwd: options.cwd,
          env: createAgentBrowserEnvironment(
            baseEnv,
            options.profileDirectory,
            options.session,
            runOptions
          ),
          maxBuffer: 1024 * 1024 * 10
        });
        return normalizeAgentBrowserRunResult({
          exitCode: 0,
          stdout: result.stdout,
          stderr: result.stderr
        }, args);
      } catch (error) {
        if (isExecError(error)) {
          return normalizeAgentBrowserRunResult({
            exitCode: typeof error.code === "number" ? error.code : 1,
            stdout: typeof error.stdout === "string" ? error.stdout : "",
            stderr: typeof error.stderr === "string" ? error.stderr : error.message
          }, args);
        }
        throw error;
      }
    }
  };
}

function normalizeAgentBrowserRunResult(result: BrowserRunResult, args: string[]): BrowserRunResult {
  if (!args.includes("--json") || result.stdout.trim().length === 0) {
    return result;
  }

  let response: AgentBrowserJsonResponse;
  try {
    response = JSON.parse(result.stdout) as AgentBrowserJsonResponse;
  } catch {
    return result;
  }
  if (typeof response.success !== "boolean") {
    return result;
  }
  if (!response.success) {
    const error = response.error ?? (result.stderr.trim() || "agent-browser command failed");
    return {
      exitCode: result.exitCode === 0 ? 1 : result.exitCode,
      stdout: response.errorCode === undefined
        ? ""
        : `${JSON.stringify({ errorCode: response.errorCode, error })}\n`,
      stderr: error
    };
  }
  return {
    exitCode: result.exitCode,
    stdout: response.data === undefined ? "" : `${JSON.stringify(response.data)}\n`,
    stderr: result.stderr
  };
}

export function createDefaultBrowserProfileDirectory(): string {
  return join(homedir(), ".openruntime", "browser-profile");
}

export function resolveBrowserProfileDirectory(
  baseEnv: NodeJS.ProcessEnv = process.env,
  profileDirectory?: string
): string {
  return resolve(
    profileDirectory ?? baseEnv[OPENRUNTIME_BROWSER_PROFILE_ENV] ?? createDefaultBrowserProfileDirectory()
  );
}

export function createAgentBrowserEnvironment(
  baseEnv: NodeJS.ProcessEnv,
  profileDirectory?: string,
  session?: string,
  options: BrowserRunOptions = {}
): NodeJS.ProcessEnv {
  const resolvedProfileDirectory = resolveBrowserProfileDirectory(baseEnv, profileDirectory);
  const authStatePath = join(resolvedProfileDirectory, OPENRUNTIME_AUTH_STATE_FILE_NAME);
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    [AGENT_BROWSER_PROFILE_ENV]: resolvedProfileDirectory,
    [AGENT_BROWSER_SESSION_ENV]: session
      ?? baseEnv[OPENRUNTIME_AGENT_BROWSER_SESSION_ENV]
      ?? "openruntime",
    ...(existsSync(authStatePath) ? { [AGENT_BROWSER_STATE_ENV]: authStatePath } : {})
  };

  if (options.ui === true) {
    env[AGENT_BROWSER_HEADED_ENV] = "1";
  } else {
    delete env[AGENT_BROWSER_HEADED_ENV];
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

export function createInteractiveTextClickScript(text: string): string {
  return [
    "((targetText) => {",
    "  const normalize = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();",
    "  const expected = normalize(targetText);",
    "  const selectors = [",
    "    'button',",
    "    'a[href]',",
    "    'input[type=\"button\"]',",
    "    'input[type=\"submit\"]',",
    "    'input[type=\"reset\"]',",
    "    '[role=\"button\"]',",
    "    '[role=\"link\"]',",
    "    '[role=\"menuitem\"]',",
    "    '[role=\"tab\"]',",
    "    '[role=\"option\"]',",
    "    '[role=\"checkbox\"]',",
    "    '[role=\"radio\"]',",
    "    '[role=\"switch\"]',",
    "    '[onclick]'",
    "  ];",
    "  const isVisible = (element) => {",
    "    if (!(element instanceof HTMLElement)) return false;",
    "    const style = window.getComputedStyle(element);",
    "    const rect = element.getBoundingClientRect();",
    "    return style.display !== 'none' &&",
    "      style.visibility !== 'hidden' &&",
    "      style.pointerEvents !== 'none' &&",
    "      Number(style.opacity) !== 0 &&",
    "      rect.width > 0 &&",
    "      rect.height > 0;",
    "  };",
    "  const isDisabled = (element) => Boolean(element.disabled) || element.getAttribute('aria-disabled') === 'true';",
    "  const getLabels = (element) => [",
    "    element.getAttribute('aria-label'),",
    "    element instanceof HTMLInputElement ? element.value : undefined,",
    "    element.textContent,",
    "    element.getAttribute('title')",
    "  ].map(normalize).filter(Boolean);",
    "  const matches = Array.from(document.querySelectorAll(selectors.join(',')))",
    "    .filter((element) => isVisible(element) && !isDisabled(element))",
    "    .map((element) => {",
    "      const matchedText = getLabels(element).find((label) => label === expected);",
    "      return matchedText === undefined ? undefined : { element, matchedText };",
    "    })",
    "    .filter(Boolean);",
    "  if (matches.length === 0) {",
    "    throw new Error(`No interactive element exactly matched text \"${expected}\".`);",
    "  }",
    "  if (matches.length > 1) {",
    "    const summary = matches.slice(0, 5).map(({ element, matchedText }) => {",
    "      const tagName = element.tagName.toLowerCase();",
    "      const role = element.getAttribute('role');",
    "      return role === null ? `${tagName}:${matchedText}` : `${tagName}[role=${role}]:${matchedText}`;",
    "    }).join(', ');",
    "    throw new Error(`Multiple interactive elements matched text \"${expected}\": ${summary}`);",
    "  }",
    "  const match = matches[0];",
    "  match.element.scrollIntoView({ block: 'center', inline: 'center' });",
    "  match.element.click();",
    "  return {",
    "    clicked: true,",
    "    mode: 'interactive-text',",
    "    text: expected,",
    "    tagName: match.element.tagName.toLowerCase(),",
    "    role: match.element.getAttribute('role'),",
    "    matchedText: match.matchedText",
    "  };",
    `})(${JSON.stringify(text)})`
  ].join("\n");
}

export function parseBrowserJsonOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return JSON.parse(trimmed);
}

function isExecError(error: unknown): error is Error & {
  code?: number | string;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
} {
  return error instanceof Error && ("stdout" in error || "stderr" in error || "code" in error);
}
