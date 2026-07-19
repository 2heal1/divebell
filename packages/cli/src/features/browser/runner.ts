import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

import type { BrowserRunResult, BrowserRunOptions, BrowserRunner, AgentBrowserJsonResponse, AgentBrowserRunnerOptions, DefaultBrowserRunnerOptions } from "./types.js";
export type { BrowserRunResult, BrowserRunOptions, BrowserRunner, AgentBrowserRunnerOptions, DefaultBrowserRunnerOptions } from "./types.js";

export const OPENRUNTIME_BROWSER_PROFILE_ENV = "OPENRUNTIME_BROWSER_PROFILE_DIR";
export const OPENRUNTIME_AGENT_BROWSER_EXECUTABLE_ENV = "OPENRUNTIME_AGENT_BROWSER_EXECUTABLE";
export const OPENRUNTIME_AGENT_BROWSER_SESSION_ENV = "OPENRUNTIME_AGENT_BROWSER_SESSION";
const AGENT_BROWSER_PROFILE_ENV = "AGENT_BROWSER_PROFILE";
const AGENT_BROWSER_SESSION_ENV = "AGENT_BROWSER_SESSION";
const AGENT_BROWSER_HEADED_ENV = "AGENT_BROWSER_HEADED";
const AGENT_BROWSER_STATE_ENV = "AGENT_BROWSER_STATE";
const AGENT_BROWSER_RESTORE_ENV = "AGENT_BROWSER_RESTORE";

export function createDefaultBrowserRunner(options: DefaultBrowserRunnerOptions = {}): BrowserRunner {
  const env = options.env ?? process.env;
  return createAgentBrowserRunner({
    ...options.agentBrowser,
    env
  });
}

export function createAgentBrowserRunner(options: AgentBrowserRunnerOptions = {}): BrowserRunner {
  const baseEnv = options.env ?? process.env;
  const profileDirectory = resolveBrowserProfileDirectory(baseEnv, options.profileDirectory);
  const restoreName = resolveAgentBrowserSession(baseEnv, profileDirectory, options.session);
  const configuredExecutablePath = options.executablePath
    ?? baseEnv[OPENRUNTIME_AGENT_BROWSER_EXECUTABLE_ENV];
  const bundledEntryPath = configuredExecutablePath === undefined
    ? resolveBundledAgentBrowserEntryPath()
    : undefined;
  const executablePath = configuredExecutablePath
    ?? (bundledEntryPath === undefined ? "agent-browser" : process.execPath);
  const prefixArgs = [
    ...(bundledEntryPath === undefined ? [] : [bundledEntryPath]),
    ...(options.prefixArgs ?? [])
  ];

  return {
    authState: {
      profileDirectory,
      restoreName
    },
    run: async (args, runOptions = {}) => {
      try {
        const result = await execFileAsync(executablePath, [...prefixArgs, ...args], {
          cwd: options.cwd,
          env: createAgentBrowserEnvironment(
            baseEnv,
            profileDirectory,
            restoreName,
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

export function resolveBundledAgentBrowserEntryPath(): string | undefined {
  try {
    return require.resolve("@openruntime/agent-browser/bin/agent-browser.js");
  } catch {
    return undefined;
  }
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
  const resolvedSession = resolveAgentBrowserSession(baseEnv, resolvedProfileDirectory, session);
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    [AGENT_BROWSER_SESSION_ENV]: resolvedSession,
    [AGENT_BROWSER_RESTORE_ENV]: resolvedSession
  };
  delete env[AGENT_BROWSER_PROFILE_ENV];
  delete env[AGENT_BROWSER_STATE_ENV];

  if (options.ui === true) {
    env[AGENT_BROWSER_HEADED_ENV] = "1";
  } else {
    delete env[AGENT_BROWSER_HEADED_ENV];
  }
  return env;
}

export function resolveAgentBrowserSession(
  baseEnv: NodeJS.ProcessEnv = process.env,
  profileDirectory?: string,
  session?: string
): string {
  const configuredSession = session ?? baseEnv[OPENRUNTIME_AGENT_BROWSER_SESSION_ENV];
  if (configuredSession !== undefined && configuredSession.length > 0) {
    return configuredSession;
  }

  const resolvedProfileDirectory = resolveBrowserProfileDirectory(baseEnv, profileDirectory);
  if (resolvedProfileDirectory === resolve(createDefaultBrowserProfileDirectory())) {
    return "openruntime";
  }
  const profileKey = createHash("sha256").update(resolvedProfileDirectory).digest("hex").slice(0, 12);
  return `openruntime-${profileKey}`;
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
