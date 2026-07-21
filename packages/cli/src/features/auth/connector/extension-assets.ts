import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AUTH_CONNECTOR_EXTENSION_VERSION = "0.1.0";
const AUTH_CONNECTOR_QUERY_PARAM = "openruntimeAuthConnector";
export const AUTH_CONNECTOR_ICON_SIZES = [16, 32, 48, 128] as const;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export function createAuthConnectorManifest(): Record<string, unknown> {
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

export function getAuthConnectorPageIconSize(pathname: string): typeof AUTH_CONNECTOR_ICON_SIZES[number] | undefined {
  if (pathname === "/favicon.ico") return 32;
  const match = /^\/icon-(\d+)\.png$/.exec(pathname);
  if (match === null) return undefined;
  const size = Number(match[1]);
  return isAuthConnectorIconSize(size) ? size : undefined;
}

function isAuthConnectorIconSize(size: number): size is typeof AUTH_CONNECTOR_ICON_SIZES[number] {
  return AUTH_CONNECTOR_ICON_SIZES.includes(size as typeof AUTH_CONNECTOR_ICON_SIZES[number]);
}

export async function readAuthConnectorIconPng(path: string): Promise<Buffer> {
  const icon = await readFile(resolve(path));
  if (!isPng(icon)) {
    throw new Error(`Auth connector extension icon must be a PNG file: ${path}.`);
  }
  return icon;
}

export async function readAuthConnectorDefaultIconPng(size: typeof AUTH_CONNECTOR_ICON_SIZES[number]): Promise<Buffer> {
  const iconFileName = `icon-${size}.png`;
  const iconPath = getAuthConnectorDefaultIconPath(iconFileName);
  return readAuthConnectorIconPng(iconPath);
}

function getAuthConnectorDefaultIconPath(iconFileName: string): string {
  try {
    const iconUrl = new URL(`../../../../assets/auth-connector/${iconFileName}`, import.meta.url);
    if (iconUrl.protocol === "file:") return fileURLToPath(iconUrl);
  } catch {
    // Test runners may replace import.meta.url with a non-file URL.
  }
  return resolve(process.cwd(), "assets", "auth-connector", iconFileName);
}

function isPng(buffer: Buffer): boolean {
  return buffer.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, index) => buffer[index] === byte);
}

export const AUTH_CONNECTOR_SETUP_CONTENT_SCRIPT = `"use strict";

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

export const AUTH_CONNECTOR_SERVICE_WORKER_SCRIPT = `"use strict";

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
