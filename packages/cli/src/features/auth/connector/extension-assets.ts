import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const AUTH_CONNECTOR_EXTENSION_VERSION = "0.1.0";
const AUTH_CONNECTOR_QUERY_PARAM = "openruntimeAuthConnector";
export const AUTH_CONNECTOR_ICON_SIZES = [16, 32, 48, 128] as const;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_CRC_TABLE = createPngCrcTable();
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
