import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { AddressInfo, Socket } from "node:net";
import { AUTH_CONNECTOR_ICON_SIZES, AUTH_CONNECTOR_SERVICE_WORKER_SCRIPT, AUTH_CONNECTOR_SETUP_CONTENT_SCRIPT, createAuthConnectorManifest, getAuthConnectorPageIconSize, readAuthConnectorDefaultIconPng, readAuthConnectorIconPng } from "./extension-assets.js";
import { exportAuthStateProfile, type ProfileExportResult } from "../profile.js";
import type { AuthConnectorExportOptions, AuthConnectorExtensionOptions, AuthConnectorCookie, AuthConnectorStorageEntry, AuthConnectorPayload, AuthConnectorStorageState } from "./types.js";
export type * from "./types.js";
import type { AuthConnectorServerState } from "./types.js";

const AUTH_CONNECTOR_TIMEOUT_MS = 120_000;
const AUTH_CONNECTOR_MAX_BODY_BYTES = 20 * 1024 * 1024;
const AUTH_CONNECTOR_QUERY_PARAM = "openruntimeAuthConnector";

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
