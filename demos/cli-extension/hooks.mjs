export async function open() {
  return {
    scripts: [
      "globalThis.__DIVEBELL_CLI_EXTENSION_DEMO__ = { loaded: true, version: 1 };"
    ]
  };
}

export async function detectStack({ divebell }) {
  const marker = await divebell.browser.getWindow(
    "__DIVEBELL_CLI_EXTENSION_DEMO__"
  );
  if (marker?.found !== true) return;

  return {
    id: "divebell-cli-extension-demo",
    name: "Divebell CLI Extension Demo",
    version: String(marker.value?.version ?? "unknown"),
    evidence: ["window.__DIVEBELL_CLI_EXTENSION_DEMO__"]
  };
}

export async function close() {
  // This demo creates no resources outside the page, so no additional cleanup is required.
}
