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

export interface BrowserRunOptions {
  ui?: boolean;
}

export interface BrowserRunner {
  run(args: string[], options?: BrowserRunOptions): Promise<BrowserRunResult>;
}

export const OPENRUNTIME_BROWSER_PROFILE_ENV = "OPENRUNTIME_BROWSER_PROFILE_DIR";
const NEXT_BROWSER_PROFILE_ENV = "OPENRUNTIME_NEXT_BROWSER_PROFILE_DIR";

export interface NextBrowserRunnerOptions {
  profileDirectory?: string;
}

export function createNextBrowserRunner(options: NextBrowserRunnerOptions = {}): BrowserRunner {
  return {
    run: async (args, runOptions = {}) => {
      try {
        const result = await execFileAsync(process.execPath, [resolveNextBrowserCliPath(), ...args], {
          env: createNextBrowserEnvironment(process.env, options.profileDirectory, runOptions),
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

export function resolveBrowserProfileDirectory(
  baseEnv: NodeJS.ProcessEnv = process.env,
  profileDirectory?: string
): string {
  return resolve(
    profileDirectory ?? baseEnv[OPENRUNTIME_BROWSER_PROFILE_ENV] ?? createDefaultBrowserProfileDirectory()
  );
}

export function createNextBrowserEnvironment(
  baseEnv: NodeJS.ProcessEnv,
  profileDirectory?: string,
  options: BrowserRunOptions = {}
): NodeJS.ProcessEnv {
  const resolvedProfileDirectory = resolveBrowserProfileDirectory(baseEnv, profileDirectory);
  const envWithoutBrowserMode = { ...baseEnv };
  delete envWithoutBrowserMode.NEXT_BROWSER_HEADLESS;

  return {
    ...envWithoutBrowserMode,
    [NEXT_BROWSER_PROFILE_ENV]: resolvedProfileDirectory,
    ...(options.ui === true ? {} : { NEXT_BROWSER_HEADLESS: "1" }),
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

export function createConsoleLogScript(): string {
  return [
    "(() => {",
    "  const logs = window.__NEXT_BROWSER_CONSOLE_LOGS__;",
    "  return Array.isArray(logs) ? logs : [];",
    "})()"
  ].join("\n");
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
