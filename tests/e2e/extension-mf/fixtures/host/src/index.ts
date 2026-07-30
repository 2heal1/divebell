declare module "provider/Widget" {
  export function render(): string;
}

void import("provider/Widget").then(({ render }) => {
  const rendered = render();
  const root = document.getElementById("remote-root");
  if (root === null) {
    throw new Error("The MF host is missing #remote-root.");
  }
  root.textContent = rendered;
  globalThis.__DIVEBELL_MF_E2E_RENDERED__ = rendered;
}).catch((error: unknown) => {
  globalThis.__DIVEBELL_MF_E2E_ERROR__ =
    error instanceof Error ? error.message : String(error);
});

declare global {
  var __DIVEBELL_MF_E2E_ERROR__: string | undefined;
  var __DIVEBELL_MF_E2E_RENDERED__: string | undefined;
}
