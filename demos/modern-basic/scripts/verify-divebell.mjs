const bridge = process.env.DIVEBELL_BRIDGE ?? "http://localhost:17321";
const pageUrl = process.env.DIVEBELL_PAGE ?? "http://localhost:19081/";

const { runtimes } = await readJson(`${bridge}/runtimes`);
const runtime = runtimes.find((item) => item.url === pageUrl && item.status === "connected")
  ?? runtimes.find((item) => item.status === "connected" && isSameOrigin(item.url, pageUrl));

if (runtime === undefined) {
  throw new Error(`No connected runtime for ${pageUrl}. Open the demo home page before running verify.`);
}

const targets = await readJson(`${bridge}/runtimes/${runtime.runtimeId}/targets`);
const actions = await readJson(`${bridge}/runtimes/${runtime.runtimeId}/actions`);
const snapshot = await readJson(`${bridge}/runtimes/${runtime.runtimeId}/snapshot`);

const requiredTargetIds = [
  "modern:app",
  "modern:route"
];

for (const targetId of requiredTargetIds) {
  if (!targets.some((target) => target.id === targetId)) {
    throw new Error(`Missing target ${targetId}.`);
  }
  if (snapshot.targets[targetId] === undefined) {
    throw new Error(`Missing snapshot target ${targetId}.`);
  }
}

const businessTargetId = "business:ready:modern-demo";
const businessTarget = targets.find((target) => target.id === businessTargetId);
if (businessTarget !== undefined && snapshot.targets[businessTargetId] === undefined) {
  throw new Error(`Missing snapshot target ${businessTargetId}.`);
}

const routeTarget = targets.find((target) => target.id === "modern:route");
const routeSnapshot = snapshot.targets["modern:route"];
const routeManifest = routeTarget?.data?.routes;
const routeMatches = routeSnapshot?.data?.matches;
const clickOrdersAction = actions.find((action) => action.name === "demo.click-orders");

if (!Array.isArray(routeManifest) || routeManifest.length === 0) {
  throw new Error("Modern.js route manifest was not registered.");
}
if (!Array.isArray(routeMatches) || routeMatches.length === 0) {
  throw new Error("Modern.js current route matches were not captured.");
}
if (clickOrdersAction === undefined || clickOrdersAction.enabled !== true) {
  throw new Error("Divebell click action was not registered or enabled.");
}

console.log(
  JSON.stringify(
    {
      runtimeId: runtime.runtimeId,
      url: runtime.url,
      routes: routeManifest.length,
      matches: routeMatches.map((match) => match.pathname ?? match.routeId),
      appStatus: snapshot.targets["modern:app"]?.status,
      routeStatus: routeSnapshot?.status,
      pathname: routeSnapshot?.data?.pathname,
      action: clickOrdersAction.name,
      businessStatus: snapshot.targets[businessTargetId]?.status
    },
    null,
    2
  )
);

async function readJson(url) {
  const response = await fetch(url);
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
