const bridge = process.env.OPENRUNTIME_BRIDGE ?? "http://localhost:17321";
const pageUrl = process.env.OPENRUNTIME_PAGE ?? "http://localhost:19081/";

const { runtimes } = await readJson(`${bridge}/runtimes`);
const runtime = runtimes.find((item) => item.status === "connected" && isSameOrigin(item.url, pageUrl));

if (runtime === undefined) {
  throw new Error(`No connected runtime for ${pageUrl}. Open the demo before running verify.`);
}

const snapshot = await readJson(`${bridge}/runtimes/${runtime.runtimeId}/snapshot`);
const routeTarget = snapshot.targets["modern:route"];
const routeData = routeTarget?.data;
const matches = Array.isArray(routeData?.matches) ? routeData.matches : [];
const componentErrorMatch = matches.find((match) => match.routeComponent === "error");

if (routeTarget?.status !== "error") {
  throw new Error(`Expected modern:route to be error, got ${String(routeTarget?.status)}.`);
}
if (routeData?.pathname !== "/component-error") {
  throw new Error(`Expected pathname /component-error, got ${String(routeData?.pathname)}.`);
}
if (componentErrorMatch === undefined) {
  throw new Error("Expected current route match to include routeComponent: error.");
}

console.log(
  JSON.stringify(
    {
      runtimeId: runtime.runtimeId,
      url: runtime.url,
      routeStatus: routeTarget.status,
      pathname: routeData.pathname,
      componentErrorRouteId: componentErrorMatch.routeId,
      routeComponent: componentErrorMatch.routeComponent,
      error: routeTarget.error?.message
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
