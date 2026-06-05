#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

const DEFAULT_CHROME =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEFAULT_USER_DATA_DIR = join(
  homedir(),
  '.chrome-debug-profiles',
  'mf-obs',
);

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function print(payload, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  if (payload.ok) {
    process.stdout.write(`${payload.message}\n`);
    return;
  }
  process.stderr.write(`${payload.message}\n`);
}

function checkDebugPort(port) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port,
        path: '/json/version',
        timeout: 1000,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            body,
          });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    req.on('error', (error) => {
      resolve({ ok: false, error: error.message });
    });
  });
}

function httpJson(method, port, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path: requestPath,
        timeout: 3000,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(body);
            }
            return;
          }
          reject(
            new Error(
              `${method} ${requestPath} failed with ${res.statusCode}: ${body}`,
            ),
          );
        });
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error(`${method} ${requestPath} timed out`));
    });
    req.on('error', reject);
    req.end();
  });
}

async function openPage(port, targetUrl) {
  if (!targetUrl || targetUrl === 'about:blank') return undefined;
  const encoded = encodeURIComponent(targetUrl);
  try {
    return await httpJson('PUT', port, `/json/new?${encoded}`);
  } catch {
    return httpJson('GET', port, `/json/new?${encoded}`);
  }
}

async function findPage(port, targetUrl) {
  if (!targetUrl || targetUrl === 'about:blank') return undefined;
  const pages = await httpJson('GET', port, '/json/list');
  if (!Array.isArray(pages)) return undefined;
  return pages.find((page) => page.type === 'page' && page.url === targetUrl);
}

async function waitForDebugPort(port, timeoutMs) {
  const startedAt = Date.now();
  let lastResult;
  while (Date.now() - startedAt < timeoutMs) {
    lastResult = await checkDebugPort(port);
    if (lastResult.ok) return lastResult;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return lastResult || { ok: false, error: 'timeout' };
}

const port = Number(readArg('port', process.env.CHROME_DEBUG_PORT || '9222'));
const url = readArg('url', 'about:blank');
const chrome = readArg('chrome', process.env.CHROME_BIN || DEFAULT_CHROME);
const timeoutMs = Number(readArg('timeout-ms', '15000'));
const userDataDir =
  readArg('user-data-dir') ||
  process.env.MF_CHROME_DEBUG_USER_DATA_DIR ||
  DEFAULT_USER_DATA_DIR;
const json = hasFlag('json');
const dryRun = hasFlag('dry-run');
const restartDebugProfile =
  hasFlag('restart') || hasFlag('restart-debug-profile');

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  print(
    {
      ok: false,
      message: `Invalid Chrome debug port: ${String(port)}`,
    },
    json,
  );
  process.exit(1);
}

try {
  await access(chrome);
} catch {
  print(
    {
      ok: false,
      status: 'chrome-not-found',
      chrome,
      message: `Chrome executable not found: ${chrome}`,
    },
    json,
  );
  process.exit(1);
}

const args = [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  '--new-window',
  '--no-first-run',
  '--no-default-browser-check',
  url,
];

if (dryRun) {
  print(
    {
      ok: true,
      status: 'dry-run',
      chrome,
      args,
      userDataDir,
      restartDebugProfile,
      message:
        restartDebugProfile
          ? 'Dry run only. This would restart the fixed Chrome debug profile with remote debugging enabled.'
          : 'Dry run only. This would launch the fixed Chrome debug profile with remote debugging enabled.',
    },
    json,
  );
  process.exit(0);
}

const existing = await checkDebugPort(port);
if (existing.ok) {
  let page;
  try {
    page = await openPage(port, url);
  } catch (error) {
    print(
      {
        ok: false,
        status: 'open-page-failed',
        port,
        url,
        message: `Chrome debug port is available, but opening the target page failed: ${error.message}`,
      },
      json,
    );
    process.exit(1);
  }
  print(
    {
      ok: true,
      status: 'already-running',
      port,
      userDataDir,
      pageId: page?.id,
      pageUrl: page?.url,
      url: `http://127.0.0.1:${port}/json/version`,
      message: `Chrome debug port already available on ${port}.`,
    },
    json,
  );
  process.exit(0);
}

await mkdir(userDataDir, { recursive: true });

try {
  const child = spawn(chrome, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
} catch (error) {
  print(
    {
      ok: false,
      status: 'launch-failed',
      chrome,
      args,
      message: `Failed to launch Chrome: ${error.message}`,
    },
    json,
  );
  process.exit(1);
}

const ready = await waitForDebugPort(port, timeoutMs);
if (ready.ok) {
  let page;
  try {
    page = await findPage(port, url);
  } catch {
    page = undefined;
  }
  print(
    {
      ok: true,
      status: 'started',
      port,
      chrome,
      userDataDir,
      pageId: page?.id,
      pageUrl: page?.url,
      url: `http://127.0.0.1:${port}/json/version`,
      message: `Chrome debug port ready on ${port}.`,
    },
    json,
  );
  process.exit(0);
}

print(
  {
    ok: false,
    status: 'debug-port-unavailable',
    port,
    chrome,
    args,
    userDataDir,
    lastError: ready.error,
    restartDebugProfile,
    message:
      restartDebugProfile
        ? 'Chrome debug port did not become available after restarting the fixed debug profile. Ask the user to close that debug Chrome window manually or choose another debug port before continuing.'
        : 'Chrome debug port did not become available after launching the fixed debug profile. The profile may already be open without remote debugging, or the port may be blocked. Ask the user to close that debug Chrome window or choose another debug port before continuing.',
  },
  json,
);
process.exit(2);
