import type { DivebellExtensionApi } from "@divebell/cli";

const MF_STACK_DETECTION_SCRIPT = `(() => {
  try {
    const candidates = [
      ["globalThis.__FEDERATION__.__INSTANCES__", globalThis.__FEDERATION__],
      ["globalThis.__VMOK__.__INSTANCES__", globalThis.__VMOK__]
    ];
    for (const [evidence, federation] of candidates) {
      if (
        federation &&
        Array.isArray(federation.__INSTANCES__) &&
        federation.__INSTANCES__.length > 0
      ) {
        return evidence;
      }
    }
  } catch {}
  return null;
})()`;

export async function detectMfStack(
  divebell: DivebellExtensionApi,
  command: string
): Promise<{
  id: string;
  name: string;
  evidence: string[];
  command: string;
} | undefined> {
  const evidence = await divebell.browser.eval<string | null>(
    MF_STACK_DETECTION_SCRIPT
  );
  if (evidence === null) return undefined;
  return {
    id: "module-federation",
    name: "Module Federation",
    evidence: [evidence],
    command
  };
}
