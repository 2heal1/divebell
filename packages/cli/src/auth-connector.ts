import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { AddressInfo, Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { exportAuthStateProfile, type ProfileExportResult } from "./profile.js";

const AUTH_CONNECTOR_TIMEOUT_MS = 120_000;
const AUTH_CONNECTOR_MAX_BODY_BYTES = 20 * 1024 * 1024;
const AUTH_CONNECTOR_QUERY_PARAM = "openruntimeAuthConnector";
const AUTH_CONNECTOR_EXTENSION_VERSION = "0.1.0";
const AUTH_CONNECTOR_ICON_SIZES = [16, 32, 48, 128] as const;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_CRC_TABLE = createPngCrcTable();

export interface AuthConnectorExportOptions {
  requestedUrl: string;
  outputPath?: string;
  timeout?: number;
  extensionDirectory?: string;
  extensionInstallUrl?: string;
  extensionIconPath?: string;
  browserOpener?: AuthConnectorBrowserOpener;
}

export interface AuthConnectorExtensionOptions {
  iconPath?: string;
}

export type AuthConnectorBrowserOpener = (url: string) => Promise<void>;

export interface AuthConnectorCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "no_restriction" | "lax" | "strict" | "unspecified";
  session?: boolean;
  expirationDate?: number;
  partitionKey?: {
    topLevelSite?: string;
  } | string | null;
}

export interface AuthConnectorStorageEntry {
  name: string;
  value: string;
}

export interface AuthConnectorOriginState {
  origin: string;
  localStorage?: AuthConnectorStorageEntry[];
  sessionStorage?: AuthConnectorStorageEntry[];
}

export interface AuthConnectorPayload {
  requestedUrl: string;
  exportedAt?: string;
  cookies: AuthConnectorCookie[];
  origins: AuthConnectorOriginState[];
}

export interface AuthConnectorStorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    partitionKey?: string;
  }>;
  origins: Array<{
    origin: string;
    localStorage: AuthConnectorStorageEntry[];
  }>;
}

type AuthConnectorStatus = "waiting_for_extension" | "exporting" | "exported" | "error";

interface AuthConnectorServerState {
  status: AuthConnectorStatus;
  message: string;
  token: string;
  requestedUrl: string;
  extensionDirectory: string;
  extensionInstallUrl?: string;
  openBrowser: AuthConnectorBrowserOpener;
  resolve(payload: AuthConnectorPayload): void;
  reject(error: Error): void;
}

export async function exportAuthProfileWithConnector(options: AuthConnectorExportOptions): Promise<ProfileExportResult> {
  const requestedUrl = normalizeRequestedHttpUrl(options.requestedUrl);
  const token = randomUUID();
  const extensionDirectory = await writeAuthConnectorExtension(options.extensionDirectory, {
    ...(options.extensionIconPath === undefined ? {} : { iconPath: options.extensionIconPath })
  });

  let settleExport: (payload: AuthConnectorPayload) => void = () => undefined;
  let settleError: (error: Error) => void = () => undefined;
  const exportPromise = new Promise<AuthConnectorPayload>((resolve, reject) => {
    settleExport = resolve;
    settleError = reject;
  });

  const state: AuthConnectorServerState = {
    status: "waiting_for_extension",
    message: "正在等待 OpenRuntime Auth Connector 扩展。",
    token,
    requestedUrl,
    extensionDirectory,
    ...(options.extensionInstallUrl === undefined ? {} : { extensionInstallUrl: options.extensionInstallUrl }),
    openBrowser: options.browserOpener ?? openAuthConnectorSetupPage,
    resolve: settleExport,
    reject: settleError
  };

  const server = createServer((request, response) => {
    void handleAuthConnectorRequest(request, response, state);
  });
  const sockets = trackServerSockets(server);

  try {
    await listen(server);
    const address = server.address() as AddressInfo;
    const setupUrl = `http://127.0.0.1:${address.port}/?${AUTH_CONNECTOR_QUERY_PARAM}=1&token=${encodeURIComponent(token)}&auto=1`;
    await state.openBrowser(setupUrl);

    const timeout = options.timeout ?? AUTH_CONNECTOR_TIMEOUT_MS;
    const payload = await withTimeout(exportPromise, timeout, () => {
      state.status = "error";
      state.message = `Timed out waiting for Chrome auth export after ${timeout}ms.`;
      return new Error(state.message);
    });

    return await exportAuthStateProfile({
      storageState: convertAuthConnectorPayloadToStorageState(payload),
      ...(options.outputPath === undefined ? {} : { outputPath: options.outputPath })
    });
  } finally {
    await closeServer(server, sockets);
  }
}

export function convertAuthConnectorPayloadToStorageState(payload: AuthConnectorPayload): AuthConnectorStorageState {
  return {
    cookies: payload.cookies.map(convertAuthConnectorCookie),
    origins: payload.origins.map((origin) => ({
      origin: origin.origin,
      localStorage: normalizeStorageEntries(origin.localStorage)
    }))
  };
}

export function getDefaultAuthConnectorExtensionDirectory(): string {
  return join(homedir(), ".openruntime", "auth-connector-extension");
}

export async function writeAuthConnectorExtension(
  directory = getDefaultAuthConnectorExtensionDirectory(),
  options: AuthConnectorExtensionOptions = {}
): Promise<string> {
  const extensionDirectory = resolve(directory);
  await mkdir(extensionDirectory, {
    recursive: true,
    mode: 0o700
  });

  await writeJsonFile(join(extensionDirectory, "manifest.json"), createAuthConnectorManifest());
  await writeFile(join(extensionDirectory, "setup-content.js"), AUTH_CONNECTOR_SETUP_CONTENT_SCRIPT, {
    encoding: "utf8",
    mode: 0o600
  });
  await writeFile(join(extensionDirectory, "service-worker.js"), AUTH_CONNECTOR_SERVICE_WORKER_SCRIPT, {
    encoding: "utf8",
    mode: 0o600
  });
  const customIcon = options.iconPath === undefined ? undefined : await readAuthConnectorIconPng(options.iconPath);
  for (const size of AUTH_CONNECTOR_ICON_SIZES) {
    const icon = customIcon ?? await readAuthConnectorDefaultIconPng(size);
    await writeFile(join(extensionDirectory, `icon-${size}.png`), icon, {
      mode: 0o600
    });
  }

  return extensionDirectory;
}

export async function openAuthConnectorSetupPage(url: string): Promise<void> {
  const command = createOpenChromeCommand(url, process.platform);
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command.command, command.args, {
      detached: true,
      stdio: "ignore"
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolvePromise();
    });
  });
}

function convertAuthConnectorCookie(cookie: AuthConnectorCookie): AuthConnectorStorageState["cookies"][number] {
  const converted = {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path ?? "/",
    expires: cookie.session === true || cookie.expirationDate === undefined ? -1 : cookie.expirationDate,
    httpOnly: cookie.httpOnly ?? false,
    secure: cookie.secure ?? false,
    ...createOptionalSameSite(cookie.sameSite),
    ...createOptionalPartitionKey(cookie.partitionKey)
  };
  return converted;
}

function createOptionalSameSite(sameSite: AuthConnectorCookie["sameSite"]): { sameSite?: "Strict" | "Lax" | "None" } {
  if (sameSite === "strict") return { sameSite: "Strict" };
  if (sameSite === "lax") return { sameSite: "Lax" };
  if (sameSite === "no_restriction") return { sameSite: "None" };
  return {};
}

function createOptionalPartitionKey(partitionKey: AuthConnectorCookie["partitionKey"]): { partitionKey?: string } {
  if (typeof partitionKey === "string" && partitionKey.length > 0) {
    return { partitionKey };
  }
  if (partitionKey !== null && typeof partitionKey === "object" && typeof partitionKey.topLevelSite === "string" && partitionKey.topLevelSite.length > 0) {
    return { partitionKey: partitionKey.topLevelSite };
  }
  return {};
}

function normalizeStorageEntries(entries: AuthConnectorStorageEntry[] | undefined): AuthConnectorStorageEntry[] {
  return (entries ?? [])
    .filter((entry) => typeof entry.name === "string" && typeof entry.value === "string")
    .map((entry) => ({
      name: entry.name,
      value: entry.value
    }));
}

async function handleAuthConnectorRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: AuthConnectorServerState
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/") {
      sendHtml(response, renderSetupPage(state));
      return;
    }

    const pageIconSize = getAuthConnectorPageIconSize(url.pathname);
    if (request.method === "GET" && pageIconSize !== undefined) {
      sendPng(response, await readAuthConnectorDefaultIconPng(pageIconSize));
      return;
    }

    if (request.method === "GET" && url.pathname === "/request") {
      assertValidToken(url, state);
      state.status = "exporting";
      state.message = "扩展已连接，正在导出登录状态。";
      sendJson(response, {
        requestedUrl: state.requestedUrl
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/status") {
      assertValidToken(url, state);
      sendJson(response, {
        status: state.status,
        message: state.message
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/open-extensions") {
      assertValidToken(url, state);
      await state.openBrowser("chrome://extensions");
      state.message = "已打开 Chrome 扩展页。加载复制的扩展目录后，回到这里继续导出。";
      sendJson(response, {
        ok: true
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/event") {
      assertValidToken(url, state);
      const body = await readJsonBody(request);
      const message = getRecord(body);
      const status = typeof message?.status === "string" ? message.status : "exporting";
      if (status === "exporting" || status === "waiting_for_extension") {
        state.status = status;
      }
      if (typeof message?.message === "string" && message.message.length > 0) {
        state.message = message.message;
      }
      sendJson(response, {
        ok: true
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/export") {
      assertValidToken(url, state);
      const payload = assertAuthConnectorPayload(await readJsonBody(request));
      state.status = "exported";
      state.message = "登录状态已导出。";
      state.resolve(payload);
      sendJson(response, {
        ok: true
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/error") {
      assertValidToken(url, state);
      const body = getRecord(await readJsonBody(request));
      const message = typeof body?.message === "string" && body.message.length > 0
        ? body.message
        : "Chrome auth export failed.";
      state.status = "error";
      state.message = message;
      state.reject(new Error(message));
      sendJson(response, {
        ok: true
      });
      return;
    }

    sendJson(response, {
      error: "not_found"
    }, 404);
  } catch (error) {
    sendJson(response, {
      error: error instanceof Error ? error.message : String(error)
    }, 400);
  }
}

function renderSetupPage(state: AuthConnectorServerState): string {
  const installBlock = state.extensionInstallUrl === undefined
    ? `<p>没有检测到 OpenRuntime Auth Connector。首次使用需要加载一次扩展。</p>
      <div class="steps">
        <div class="step">
          <span class="step-number">1</span>
          <div>
            <strong>复制扩展目录</strong>
            <code id="extension-path">${escapeHtml(state.extensionDirectory)}</code>
            <button id="copy-path" type="button" class="secondary highlight">复制扩展目录</button>
          </div>
        </div>
        <div class="step">
          <span class="step-number">2</span>
          <div>
            <strong>打开 Chrome 扩展页</strong>
            <p class="muted">点击后会打开扩展页。Chrome 仍需要你点一次“加载已解压的扩展程序”，然后选择刚复制的目录。</p>
            <button id="install-extension" type="button" class="secondary">安装扩展</button>
          </div>
        </div>
        <div class="step">
          <span class="step-number">3</span>
          <div>
            <strong>回到这里继续导出</strong>
            <p class="muted">扩展加载完成后，这个页面会自动检测；如果没有自动开始，点击上面的导出按钮。</p>
          </div>
        </div>
      </div>`
    : `<p>没有检测到 OpenRuntime Auth Connector。首次使用需要先安装扩展。</p>
      <div class="actions">
        <a class="secondary highlight" href="${escapeHtml(state.extensionInstallUrl)}" target="_blank" rel="noreferrer">安装扩展</a>
      </div>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenRuntime Auth Export</title>
  <link rel="icon" type="image/png" sizes="16x16" href="/icon-16.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">
  <link rel="apple-touch-icon" href="/icon-128.png">
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 760px; margin: 48px auto; padding: 0 24px; color: #1f2937; line-height: 1.5; }
    .header { display: flex; gap: 14px; align-items: center; margin-bottom: 12px; }
    .brand-icon { width: 48px; height: 48px; border-radius: 10px; flex: 0 0 auto; }
    h1 { font-size: 28px; margin: 0 0 12px; }
    .header h1 { margin: 0; }
    p { margin: 10px 0; }
    code { display: block; padding: 12px; border: 1px solid #d1d5db; border-radius: 6px; overflow-wrap: anywhere; background: #f9fafb; }
    .panel { border: 1px solid #d1d5db; border-radius: 8px; padding: 18px; margin: 20px 0; }
    .hidden { display: none; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
    button, .secondary { display: inline-flex; align-items: center; min-height: 40px; padding: 0 14px; border-radius: 6px; border: 1px solid #9ca3af; font: inherit; cursor: pointer; text-decoration: none; color: #111827; background: white; }
    .primary { min-height: 44px; border-color: #111827; background: #111827; color: white; }
    .muted { color: #6b7280; }
    .steps { display: grid; gap: 16px; margin-top: 14px; }
    .step { display: grid; grid-template-columns: 30px 1fr; gap: 12px; align-items: start; }
    .step-number { display: inline-flex; width: 30px; height: 30px; align-items: center; justify-content: center; border-radius: 999px; background: #111827; color: white; font-weight: 700; }
    .step strong { display: block; margin-bottom: 8px; }
    .highlight { animation: openruntime-pulse 1.4s ease-in-out infinite; border-color: #2563eb; box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.35); }
    @keyframes openruntime-pulse {
      0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.35); }
      70% { box-shadow: 0 0 0 8px rgba(37, 99, 235, 0); }
      100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
    }
  </style>
</head>
<body>
  <div class="header">
    <img class="brand-icon" src="/icon-128.png" alt="" width="48" height="48">
    <h1>导出浏览器登录状态</h1>
  </div>
  <p>目标网站：</p>
  <code>${escapeHtml(state.requestedUrl)}</code>
  <div class="actions">
    <button id="start-export" type="button" class="primary">导出登录状态</button>
  </div>
  <div id="install-panel" class="panel hidden">
    ${installBlock}
  </div>
  <p id="status" class="muted">${escapeHtml(state.message)}</p>
  <script>
    const token = ${JSON.stringify(state.token)};
    const autoStart = new URLSearchParams(window.location.search).get('auto') === '1';
    let lastStatus = ${JSON.stringify(state.status)};
    let connectorReady = false;
    let exportCompleted = false;
    let installPanelVisible = false;
    const installAttemptedKey = 'openruntimeAuthConnectorInstallAttempted:' + token;
    const reloadAttemptedKey = 'openruntimeAuthConnectorReloadAttempted:' + token;
    let didReloadAfterClick = sessionStorage.getItem(reloadAttemptedKey) === '1';

    function setStatus(message) {
      document.getElementById('status').textContent = message;
    }

    function showInstallPanel(message) {
      installPanelVisible = true;
      document.getElementById('install-panel').classList.remove('hidden');
      setStatus(message);
    }

    function hideInstallPanel() {
      installPanelVisible = false;
      document.getElementById('install-panel').classList.add('hidden');
    }

    function highlightInstallStep() {
      document.getElementById('copy-path')?.classList.remove('highlight');
      document.getElementById('install-extension')?.classList.add('highlight');
    }

    function reloadToDetectInstalledExtension() {
      if (connectorReady || exportCompleted || didReloadAfterClick) return;
      if (sessionStorage.getItem(installAttemptedKey) !== '1') return;
      didReloadAfterClick = true;
      sessionStorage.setItem(reloadAttemptedKey, '1');
      location.reload();
    }

    function markExportComplete() {
      exportCompleted = true;
      const button = document.getElementById('start-export');
      button.textContent = '关闭页面';
      button.onclick = () => window.close();
      setStatus('导出成功。命令行已输出文件路径，可以关闭这个标签页。');
      setTimeout(() => window.close(), 800);
    }

    function requestExportStart() {
      if (exportCompleted) {
        window.close();
        return;
      }
      document.getElementById('start-export').textContent = '正在导出...';
      setStatus('正在连接 OpenRuntime Auth Connector...');
      window.postMessage({
        type: 'openruntime.auth.startFromPage',
        token
      }, window.location.origin);

      setTimeout(() => {
        if (connectorReady) return;
        if (sessionStorage.getItem(installAttemptedKey) === '1' && lastStatus === 'waiting_for_extension' && !didReloadAfterClick) {
          didReloadAfterClick = true;
          sessionStorage.setItem(reloadAttemptedKey, '1');
          location.reload();
          return;
        }
        document.getElementById('start-export').textContent = '导出登录状态';
        showInstallPanel('没有检测到扩展。请先安装扩展，然后回到这里点击导出。');
      }, 1200);
    }

    async function refreshStatus() {
      try {
        const response = await fetch('/status?token=' + encodeURIComponent(token), { cache: 'no-store' });
        const state = await response.json();
        lastStatus = state.status || lastStatus;
        if (state.status === 'exported') {
          markExportComplete();
          return;
        }
        if (installPanelVisible && state.status === 'waiting_for_extension') {
          return;
        }
        setStatus(state.message || state.status || '等待中...');
      } catch {
        if (exportCompleted) return;
        setStatus('本地 OpenRuntime 命令已结束或不可用。');
      }
    }

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== 'openruntime.auth.connectorReady' || event.data.token !== token) return;
      connectorReady = true;
      sessionStorage.removeItem(installAttemptedKey);
      sessionStorage.removeItem(reloadAttemptedKey);
      document.getElementById('start-export').textContent = '导出登录状态';
      hideInstallPanel();
      if (autoStart) {
        setStatus('已检测到扩展，正在导出登录状态。');
        requestExportStart();
        return;
      }
      setStatus('已检测到扩展，点击导出登录状态。');
    });

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== 'openruntime.auth.exportComplete' || event.data.token !== token) return;
      markExportComplete();
    });

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== 'openruntime.auth.exportError' || event.data.token !== token) return;
      document.getElementById('start-export').textContent = '重新导出';
      setStatus(event.data.message || '导出失败，请回到命令行查看错误。');
    });

    document.getElementById('start-export').addEventListener('click', requestExportStart);
    document.getElementById('install-extension')?.addEventListener('click', async () => {
      const path = document.getElementById('extension-path')?.textContent || '';
      if (path.length > 0) await navigator.clipboard.writeText(path);
      highlightInstallStep();
      sessionStorage.setItem(installAttemptedKey, '1');
      sessionStorage.removeItem(reloadAttemptedKey);
      didReloadAfterClick = false;
      await fetch('/open-extensions?token=' + encodeURIComponent(token), { method: 'POST' });
      setStatus('已打开 Chrome 扩展页，并复制了扩展目录。请选择“加载已解压的扩展程序”。');
    });
    document.getElementById('copy-path')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(document.getElementById('extension-path').textContent || '');
      highlightInstallStep();
      setStatus('扩展目录已复制。下一步点击“安装扩展”。');
    });
    window.addEventListener('focus', () => setTimeout(reloadToDetectInstalledExtension, 300));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') setTimeout(reloadToDetectInstalledExtension, 300);
    });

    setInterval(refreshStatus, 1000);
    refreshStatus();
    if (autoStart) {
      setStatus('正在检测 OpenRuntime Auth Connector...');
      setTimeout(() => {
        if (connectorReady || exportCompleted) return;
        showInstallPanel('没有检测到扩展。请按步骤安装扩展。');
      }, 1600);
    }
  </script>
</body>
</html>`;
}

function createAuthConnectorManifest(): Record<string, unknown> {
  return {
    manifest_version: 3,
    name: "OpenRuntime Auth Connector",
    version: AUTH_CONNECTOR_EXTENSION_VERSION,
    description: "Exports browser auth state to a local OpenRuntime CLI command.",
    permissions: [
      "cookies",
      "scripting",
      "tabs"
    ],
    host_permissions: [
      "http://*/*",
      "https://*/*"
    ],
    background: {
      service_worker: "service-worker.js"
    },
    content_scripts: [
      {
        matches: [
          "http://127.0.0.1/*",
          "http://localhost/*"
        ],
        js: [
          "setup-content.js"
        ]
      }
    ],
    icons: createAuthConnectorIconManifest(),
    action: {
      default_title: "OpenRuntime Auth Connector",
      default_icon: createAuthConnectorActionIconManifest()
    }
  };
}

function createAuthConnectorIconManifest(): Record<string, string> {
  return Object.fromEntries(AUTH_CONNECTOR_ICON_SIZES.map((size) => [String(size), `icon-${size}.png`]));
}

function createAuthConnectorActionIconManifest(): Record<string, string> {
  return {
    "16": "icon-16.png",
    "32": "icon-32.png"
  };
}

function getAuthConnectorPageIconSize(pathname: string): typeof AUTH_CONNECTOR_ICON_SIZES[number] | undefined {
  if (pathname === "/favicon.ico") return 32;
  const match = /^\/icon-(\d+)\.png$/.exec(pathname);
  if (match === null) return undefined;
  const size = Number(match[1]);
  return isAuthConnectorIconSize(size) ? size : undefined;
}

function isAuthConnectorIconSize(size: number): size is typeof AUTH_CONNECTOR_ICON_SIZES[number] {
  return AUTH_CONNECTOR_ICON_SIZES.includes(size as typeof AUTH_CONNECTOR_ICON_SIZES[number]);
}

async function readAuthConnectorIconPng(path: string): Promise<Buffer> {
  const icon = await readFile(resolve(path));
  if (!isPng(icon)) {
    throw new Error(`Auth connector extension icon must be a PNG file: ${path}.`);
  }
  return icon;
}

async function readAuthConnectorDefaultIconPng(size: typeof AUTH_CONNECTOR_ICON_SIZES[number]): Promise<Buffer> {
  const iconFileName = `icon-${size}.png`;
  for (const iconPath of getAuthConnectorDefaultIconPaths(iconFileName)) {
    try {
      return await readAuthConnectorIconPng(iconPath);
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }
    }
  }
  return createAuthConnectorIconPng(size);
}

function getAuthConnectorDefaultIconPaths(iconFileName: string): string[] {
  const paths: string[] = [];
  try {
    if (import.meta.url.startsWith("file:")) {
      paths.push(fileURLToPath(new URL(`../assets/auth-connector/${iconFileName}`, import.meta.url)));
    }
  } catch {
    // Some test runners rewrite import.meta.url in a way that still looks file-like.
  }
  paths.push(join(process.cwd(), "assets", "auth-connector", iconFileName));
  return [...new Set(paths)];
}

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function isPng(buffer: Buffer): boolean {
  return buffer.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, index) => buffer[index] === byte);
}

function createAuthConnectorIconPng(size: number): Buffer {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const background = [17, 24, 39, 255] as const;
  const surface = [31, 41, 55, 255] as const;
  const cyan = [34, 211, 238, 255] as const;
  const green = [34, 197, 94, 255] as const;
  const white = [248, 250, 252, 255] as const;
  const transparent = [0, 0, 0, 0] as const;
  const radius = Math.max(3, Math.round(size * 0.18));

  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x += 1) {
      const color = getAuthConnectorIconPixelColor(x, y, size, radius, {
        background,
        surface,
        cyan,
        green,
        white,
        transparent
      });
      const offset = y * stride + 1 + x * 4;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
      raw[offset + 3] = color[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    createPngChunk("IHDR", ihdr),
    createPngChunk("IDAT", deflateSync(raw)),
    createPngChunk("IEND", Buffer.alloc(0))
  ]);
}

function getAuthConnectorIconPixelColor(
  x: number,
  y: number,
  size: number,
  radius: number,
  colors: Record<"background" | "surface" | "cyan" | "green" | "white" | "transparent", readonly [number, number, number, number]>
): readonly [number, number, number, number] {
  if (isOutsideRoundedSquare(x, y, size, radius)) return colors.transparent;

  const unit = size / 128;
  if (isInsideRect(x, y, 29 * unit, 34 * unit, 41 * unit, 95 * unit)) return colors.cyan;
  if (isInsideRect(x, y, 29 * unit, 34 * unit, 69 * unit, 46 * unit)) return colors.cyan;
  if (isInsideRect(x, y, 29 * unit, 83 * unit, 69 * unit, 95 * unit)) return colors.cyan;
  if (isInsideRect(x, y, 73 * unit, 34 * unit, 84 * unit, 95 * unit)) return colors.white;
  if (isInsideRect(x, y, 84 * unit, 34 * unit, 102 * unit, 46 * unit)) return colors.white;
  if (isInsideRect(x, y, 84 * unit, 58 * unit, 100 * unit, 70 * unit)) return colors.white;
  if (isInsideRect(x, y, 84 * unit, 83 * unit, 105 * unit, 95 * unit)) return colors.white;

  const center = 64 * unit;
  const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
  if (distance >= 12 * unit && distance <= 22 * unit) return colors.green;
  if (isInsideRect(x, y, 18 * unit, 20 * unit, 110 * unit, 108 * unit)) return colors.surface;
  return colors.background;
}

function isOutsideRoundedSquare(x: number, y: number, size: number, radius: number): boolean {
  const left = x < radius;
  const right = x >= size - radius;
  const top = y < radius;
  const bottom = y >= size - radius;
  if (!(left || right) || !(top || bottom)) return false;

  const cornerX = left ? radius - 0.5 : size - radius - 0.5;
  const cornerY = top ? radius - 0.5 : size - radius - 0.5;
  return Math.hypot(x - cornerX, y - cornerY) > radius;
}

function isInsideRect(x: number, y: number, left: number, top: number, right: number, bottom: number): boolean {
  return x >= left && x < right && y >= top && y < bottom;
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(calculatePngCrc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function calculatePngCrc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (PNG_CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPngCrcTable(): number[] {
  const table: number[] = [];
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const AUTH_CONNECTOR_SETUP_CONTENT_SCRIPT = `"use strict";

(async () => {
  const url = new URL(window.location.href);
  if (url.searchParams.get("${AUTH_CONNECTOR_QUERY_PARAM}") !== "1") return;
  const token = url.searchParams.get("token");
  if (!token) return;
  let started = false;

  async function start() {
    if (started) return;
    started = true;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "openruntime.auth.start",
        connectorUrl: window.location.origin,
        token
      });
      if (response && response.ok === true) {
        window.postMessage({
          type: "openruntime.auth.exportComplete",
          token
        }, window.location.origin);
        return;
      }
      started = false;
      window.postMessage({
        type: "openruntime.auth.exportError",
        token,
        message: response && response.message ? response.message : "Chrome auth export failed."
      }, window.location.origin);
    } catch (error) {
      started = false;
      window.postMessage({
        type: "openruntime.auth.exportError",
        token,
        message: error instanceof Error ? error.message : String(error)
      }, window.location.origin);
    }
  }

  window.postMessage({
    type: "openruntime.auth.connectorReady",
    token
  }, window.location.origin);

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (!event.data || event.data.type !== "openruntime.auth.startFromPage" || event.data.token !== token) return;
    void start();
  });
})();
`;

const AUTH_CONNECTOR_SERVICE_WORKER_SCRIPT = `"use strict";

const runningTokens = new Set();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "openruntime.auth.start") return false;
  startExport(message).then(
    () => sendResponse({ ok: true }),
    (error) => {
      reportError(message.connectorUrl, message.token, error).finally(() => {
        sendResponse({ ok: false, message: error instanceof Error ? error.message : String(error) });
      });
    }
  );
  return true;
});

async function startExport(message) {
  const connectorUrl = message.connectorUrl;
  const token = message.token;
  if (runningTokens.has(token)) return;
  runningTokens.add(token);
  try {
    await postEvent(connectorUrl, token, "exporting", "正在打开目标网站。");
    const request = await fetchJson(connectorUrl + "/request?token=" + encodeURIComponent(token));
    const requestedUrl = request.requestedUrl;
    const tab = await getOrCreateTargetTab(requestedUrl);
    await waitForTabLoaded(tab.id);
    await postEvent(connectorUrl, token, "exporting", "正在读取 Cookie 和浏览器存储。");
    const cookies = await chrome.cookies.getAll({ url: requestedUrl });
    const storage = await readTabStorage(tab.id);
    await postJson(connectorUrl + "/export?token=" + encodeURIComponent(token), {
      requestedUrl,
      exportedAt: new Date().toISOString(),
      cookies,
      origins: [
        {
          origin: new URL(requestedUrl).origin,
          localStorage: storage.localStorage,
          sessionStorage: storage.sessionStorage
        }
      ]
    });
  } finally {
    runningTokens.delete(token);
  }
}

async function getOrCreateTargetTab(requestedUrl) {
  const requestedOrigin = new URL(requestedUrl).origin;
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => {
    try {
      return tab.url && new URL(tab.url).origin === requestedOrigin;
    } catch {
      return false;
    }
  });
  if (existing && existing.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    return existing;
  }
  return await chrome.tabs.create({ url: requestedUrl, active: true });
}

async function waitForTabLoaded(tabId) {
  const current = await chrome.tabs.get(tabId);
  if (current.status === "complete") return;
  await new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
}

async function readTabStorage(tabId) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      localStorage: Array.from({ length: window.localStorage.length }, (_, index) => {
        const name = window.localStorage.key(index);
        return name === null ? null : { name, value: window.localStorage.getItem(name) ?? "" };
      }).filter(Boolean),
      sessionStorage: Array.from({ length: window.sessionStorage.length }, (_, index) => {
        const name = window.sessionStorage.key(index);
        return name === null ? null : { name, value: window.sessionStorage.getItem(name) ?? "" };
      }).filter(Boolean)
    })
  });
  return result && result.result ? result.result : { localStorage: [], sessionStorage: [] };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("OpenRuntime connector request failed: " + response.status);
  return await response.json();
}

async function postEvent(connectorUrl, token, status, message) {
  await postJson(connectorUrl + "/event?token=" + encodeURIComponent(token), { status, message });
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error("OpenRuntime connector post failed: " + response.status);
}

async function reportError(connectorUrl, token, error) {
  try {
    await postJson(connectorUrl + "/error?token=" + encodeURIComponent(token), {
      message: error instanceof Error ? error.message : String(error)
    });
  } catch {
    // The CLI may have exited already.
  }
}
`;

function assertValidToken(url: URL, state: AuthConnectorServerState): void {
  if (url.searchParams.get("token") !== state.token) {
    throw new Error("Invalid auth connector token.");
  }
}

function assertAuthConnectorPayload(value: unknown): AuthConnectorPayload {
  const payload = getRecord(value);
  if (payload === undefined || typeof payload.requestedUrl !== "string" || !Array.isArray(payload.cookies) || !Array.isArray(payload.origins)) {
    throw new Error("Invalid auth connector payload.");
  }
  return payload as unknown as AuthConnectorPayload;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > AUTH_CONNECTOR_MAX_BODY_BYTES) {
      throw new Error("Auth connector payload is too large.");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeRequestedHttpUrl(input: string): string {
  let url: URL;
  const trimmed = input.trim();
  const urlLike = hasUrlScheme(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    url = new URL(urlLike);
  } catch {
    throw new Error(`Invalid auth export URL "${input}".`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Auth export URL must use http or https.");
  }
  return url.href;
}

function hasUrlScheme(input: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(input);
}

function createOpenChromeCommand(url: string, platform: NodeJS.Platform): { command: string; args: string[] } {
  if (platform === "darwin") {
    return {
      command: "open",
      args: ["-a", "Google Chrome", url]
    };
  }
  if (platform === "win32") {
    return {
      command: "cmd",
      args: ["/c", "start", "", "chrome", url]
    };
  }
  return {
    command: "xdg-open",
    args: [url]
  };
}

async function listen(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
}

function trackServerSockets(server: ReturnType<typeof createServer>): Set<Socket> {
  const sockets = new Set<Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => {
      sockets.delete(socket);
    });
  });
  return sockets;
}

async function closeServer(server: ReturnType<typeof createServer>, sockets: Set<Socket>): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolvePromise, reject) => {
    const forceCloseTimer = setTimeout(() => {
      server.closeAllConnections();
      for (const socket of sockets) {
        socket.destroy();
      }
    }, 500);
    server.close((error) => {
      clearTimeout(forceCloseTimer);
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolvePromise();
    });
    server.closeIdleConnections();
  });
}

async function withTimeout<T>(promise: Promise<T>, timeout: number, createErrorForTimeout: () => Error): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(createErrorForTimeout());
        }, timeout);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "connection": "close"
  });
  response.end(html);
}

function sendPng(response: ServerResponse, png: Buffer): void {
  response.writeHead(200, {
    "content-type": "image/png",
    "cache-control": "public, max-age=3600",
    "connection": "close"
  });
  response.end(png);
}

function sendJson(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "connection": "close"
  });
  response.end(JSON.stringify(value));
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), {
    recursive: true,
    mode: 0o700
  });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
