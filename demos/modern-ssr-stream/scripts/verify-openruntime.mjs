const bridge = process.env.OPENRUNTIME_BRIDGE ?? "http://localhost:17321";
const pageUrl = process.env.OPENRUNTIME_PAGE ?? "http://localhost:19083/";

const runtime = await waitForRuntime(pageUrl);
const snapshot = await waitForSnapshot(runtime.runtimeId);
const targets = await readJson(`${bridge}/runtimes/${runtime.runtimeId}/targets`);
const serverWait = await waitForServerSsr(runtime.runtimeId);

for (const targetId of ["modern:app", "modern:route", "modern:ssr", "modern:hydration"]) {
  if (!targets.some((target) => target.id === targetId)) {
    throw new Error(`Missing target ${targetId}.`);
  }
  if (snapshot.targets[targetId] === undefined) {
    throw new Error(`Missing snapshot target ${targetId}.`);
  }
}

const ssrTarget = snapshot.targets["modern:ssr"];
const hydrationTarget = snapshot.targets["modern:hydration"];
const routeTarget = snapshot.targets["modern:route"];

if (ssrTarget.status !== "server-rendered") {
  throw new Error(`Expected modern:ssr to be server-rendered, got ${ssrTarget.status}.`);
}
if (ssrTarget.data?.environment !== "server") {
  throw new Error(`Expected modern:ssr to come from server, got ${ssrTarget.data?.environment}.`);
}
if (typeof ssrTarget.data?.runtimeId !== "string" || ssrTarget.data.runtimeId !== runtime.runtimeId) {
  throw new Error(`Expected server runtimeId to match browser runtimeId ${runtime.runtimeId}.`);
}
if (typeof ssrTarget.data?.renderId !== "string" || ssrTarget.data.renderId !== runtime.renderId) {
  throw new Error(`Expected server renderId to match browser renderId ${runtime.renderId}.`);
}
if (serverWait.target?.data?.renderId !== runtime.renderId) {
  throw new Error("Expected wait-for modern:ssr to resolve from the linked server render.");
}
if (hydrationTarget.status !== "success") {
  throw new Error(`Expected modern:hydration to be success, got ${hydrationTarget.status}.`);
}
if (hydrationTarget.data?.renderMode !== "stream") {
  throw new Error(`Expected stream hydration renderMode, got ${hydrationTarget.data?.renderMode}.`);
}
if (routeTarget.status !== "ready") {
  throw new Error(`Expected modern:route to be ready, got ${routeTarget.status}.`);
}
if (routeTarget.data?.pathname !== "/") {
  throw new Error(`Expected pathname /, got ${routeTarget.data?.pathname}.`);
}
const rootMatch = routeTarget.data?.matches?.find((match) => match.routeId === "/");
if (rootMatch?.loader !== "success") {
  throw new Error(`Expected root route loader to be success, got ${rootMatch?.loader}.`);
}
if (rootMatch !== undefined && ("hasLoader" in rootMatch || "hasRouteComponent" in rootMatch)) {
  throw new Error("Expected route snapshot matches to expose state fields, not manifest fields.");
}

console.log(
  JSON.stringify(
    {
      runtimeId: runtime.runtimeId,
      renderId: runtime.renderId,
      url: runtime.url,
      ssrStatus: ssrTarget.status,
      serverWaitStatus: serverWait.target?.status,
      hydrationStatus: hydrationTarget.status,
      routeStatus: routeTarget.status,
      ssrEnvironment: ssrTarget.data?.environment,
      pathname: routeTarget.data?.pathname,
      renderMode: hydrationTarget.data?.renderMode,
      renderLevel: hydrationTarget.data?.renderLevel
    },
    null,
    2
  )
);

async function waitForServerSsr(runtimeId) {
  return postJson(`${bridge}/runtimes/${runtimeId}/wait-for`, {
    targetId: "modern:ssr",
    status: "server-rendered",
    where: [
      {
        path: "environment",
        equals: "server"
      }
    ],
    timeout: 5000
  });
}

async function waitForRuntime(url) {
  const deadline = Date.now() + 10_000;
  let lastRuntimes = [];

  while (Date.now() < deadline) {
    const { runtimes } = await readJson(`${bridge}/runtimes`);
    lastRuntimes = runtimes;
    const runtime = runtimes.find((item) => item.url === url && item.status === "connected")
      ?? runtimes.find((item) => item.status === "connected" && isSameOrigin(item.url, url));

    if (runtime !== undefined) {
      return runtime;
    }

    await sleep(250);
  }

  throw new Error(`No connected runtime for ${url}. Last runtimes: ${JSON.stringify(lastRuntimes)}`);
}

async function waitForSnapshot(runtimeId) {
  const deadline = Date.now() + 10_000;
  let lastSnapshot;

  while (Date.now() < deadline) {
    const snapshot = await readJson(`${bridge}/runtimes/${runtimeId}/snapshot`);
    lastSnapshot = snapshot;

    if (
      snapshot.targets["modern:ssr"]?.status === "server-rendered"
      && snapshot.targets["modern:hydration"]?.status === "success"
      && snapshot.targets["modern:route"]?.status === "ready"
    ) {
      return snapshot;
    }

    await sleep(250);
  }

  throw new Error(`SSR and hydration targets did not become ready. Last snapshot: ${JSON.stringify(lastSnapshot)}`);
}

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.json();
}

function isSameOrigin(value, expected) {
  try {
    return new URL(value).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
