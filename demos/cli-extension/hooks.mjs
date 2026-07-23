export async function open() {
  return {
    scripts: [
      "globalThis.__OPENRUNTIME_CLI_EXTENSION_DEMO__ = { loaded: true, version: 1 };"
    ]
  };
}

export async function detectStack({ openruntime }) {
  const marker = await openruntime.browser.getWindow(
    "__OPENRUNTIME_CLI_EXTENSION_DEMO__"
  );
  if (marker?.found !== true) return;

  return {
    id: "openruntime-cli-extension-demo",
    name: "OpenRuntime CLI Extension Demo",
    version: String(marker.value?.version ?? "unknown"),
    evidence: ["window.__OPENRUNTIME_CLI_EXTENSION_DEMO__"]
  };
}

export async function close() {
  // 这个 demo 没有创建页面外资源，因此不需要额外清理。
}
