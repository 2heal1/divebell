import type { DivebellExtensionApi } from "@divebell/cli";
import type { VerifyTargetClass, VerifyVisibilityResult, VerifyCommandResult } from "./types.js";

interface RuntimeTargetDescriptor {
  id: string;
  type: string;
  source?: string;
}

interface RuntimeSnapshotTarget extends RuntimeTargetDescriptor {
  status: string;
}

interface RuntimeSnapshot {
  targets: Record<string, RuntimeSnapshotTarget>;
}

interface RuntimeDataCondition {
  path: string;
  equals: unknown;
}
export async function runVerifyCommand(
  divebell: DivebellExtensionApi,
  targetId: string,
  status: string,
  where: RuntimeDataCondition[] | undefined,
  timeout: number | undefined
): Promise<VerifyCommandResult> {
  const waitResult = await divebell.waitFor(
    targetId,
    status,
    {
      ...(where === undefined ? {} : { where }),
      ...(timeout === undefined ? {} : { timeout })
    }
  );
  const targetDefinitions = await fetchVerifyTargetDefinitions(divebell);
  const waitPayload = waitResult.result;
  const target = getVerifyTarget(targetId, waitPayload, targetDefinitions);
  const targetClass = classifyVerifyTarget(target);
  const businessTargetHints = getBusinessTargetHints(waitPayload, targetDefinitions, targetId);
  const hasBusinessTarget = businessTargetHints.length > 0 || targetClass === "business";
  const visibility = targetClass === "business" || hasBusinessTarget
    ? createSkippedVisibility("Business target evidence is available.")
    : await readVerifyVisibility(divebell);
  const evidence = createVerifyEvidence({
    targetId,
    targetClass,
    targetFound: target !== undefined,
    waitPayload,
    visibility,
    businessTargetHints
  });

  const condition: VerifyCommandResult["result"]["condition"] = {
    id: targetId,
    status
  };
  if (where !== undefined) {
    condition.where = where;
  }

  return {
    ...(waitResult.runtime === undefined ? {} : { runtime: waitResult.runtime }),
    result: {
      success: evidence.level === "business" && getWaitSuccess(waitPayload) === true,
      condition,
      evidence,
      wait: waitPayload,
      visibility
    }
  };
}

export function createVerifyCommandFailure(
  targetId: string,
  status: string,
  where: RuntimeDataCondition[] | undefined,
  reason: string
): VerifyCommandResult {
  const waitFailure = createWaitForFailure(targetId, status, where, reason).result;
  const condition: VerifyCommandResult["result"]["condition"] = {
    id: targetId,
    status
  };
  if (where !== undefined) {
    condition.where = where;
  }

  return {
    result: {
      success: false,
      condition,
      evidence: {
        level: "insufficient",
        scope: "none",
        targetClass: "unknown",
        businessVerified: false,
        message: "Divebell could not read enough runtime evidence to verify the requested result.",
        nextStep: "Open or connect the page runtime first, then rerun verify; if no business target exists, use one one-time page check or add a minimal business target."
      },
      wait: waitFailure,
      visibility: createSkippedVisibility("Runtime evidence was unavailable.")
    }
  };
}

async function fetchVerifyTargetDefinitions(
  divebell: DivebellExtensionApi
): Promise<RuntimeTargetDescriptor[]> {
  try {
    const result = await divebell.targets<RuntimeTargetDescriptor[]>();
    return Array.isArray(result.result) ? result.result : [];
  } catch {
    return [];
  }
}

function createWaitForFailure(
  targetId: string,
  status: string,
  where: RuntimeDataCondition[] | undefined,
  reason: string
): { result: unknown } {
  return {
    result: {
      success: false,
      condition: {
        id: targetId,
        status,
        ...(where === undefined ? {} : { where })
      },
      reason
    }
  };
}

function createVerifyEvidence(options: {
  targetId: string;
  targetClass: VerifyTargetClass;
  targetFound: boolean;
  waitPayload: unknown;
  visibility: VerifyVisibilityResult;
  businessTargetHints: string[];
}): VerifyCommandResult["result"]["evidence"] {
  const waitSuccess = getWaitSuccess(options.waitPayload);
  if (options.targetClass === "business") {
    if (waitSuccess === true) {
      return {
        level: "business",
        scope: "business-result",
        targetClass: "business",
        businessVerified: true,
        message: "The requested business target reached the expected status."
      };
    }

    return {
      level: "business",
      scope: "business-result",
      targetClass: "business",
      businessVerified: false,
      message: "The requested business target did not reach the expected status.",
      nextStep: "Use the target error, current status, or related events to fix the business failure."
    };
  }

  if (options.targetFound && options.targetClass !== "unknown") {
    const nextStep = options.businessTargetHints.length > 0
      ? `Use a business target for final verification, for example "${options.businessTargetHints[0]}".`
      : getVisibilityNextStep(options.visibility);
    return {
      level: "runtime",
      scope: "runtime-layer",
      targetClass: options.targetClass,
      businessVerified: false,
      message: waitSuccess === true
        ? "The requested runtime-layer target reached the expected status, but this does not prove the business result."
        : "The requested runtime-layer target did not reach the expected status.",
      nextStep,
      ...(options.businessTargetHints.length === 0 ? {} : { businessTargetHints: options.businessTargetHints })
    };
  }

  return {
    level: "insufficient",
    scope: "none",
    targetClass: "unknown",
    businessVerified: false,
    message: "The requested target was not available as Divebell evidence.",
    nextStep: getVisibilityNextStep(options.visibility)
  };
}

function getVisibilityNextStep(visibility: VerifyVisibilityResult): string {
  if (visibility.status === "blank") {
    return "Treat the page as not verified; investigate the blank page or add a minimal business target before claiming success.";
  }
  if (visibility.status === "visible") {
    return "For repeated verification, add a minimal business target; for a one-time check, label this as browser visibility evidence, not Divebell business evidence.";
  }
  if (visibility.status === "unavailable") {
    return "Use one one-time page check or add a minimal business target; do not claim business success from runtime-layer evidence alone.";
  }
  return "Add a minimal business target or perform one explicit page check before claiming business success.";
}

function getVerifyTarget(
  targetId: string,
  waitPayload: unknown,
  targetDefinitions: RuntimeTargetDescriptor[]
): RuntimeSnapshotTarget | RuntimeTargetDescriptor | undefined {
  const waitTarget = getRecordField(waitPayload, "target");
  if (isRuntimeSnapshotTargetLike(waitTarget)) {
    return waitTarget;
  }

  const snapshot = getRuntimeSnapshot(waitPayload);
  const snapshotTarget = snapshot?.targets[targetId];
  if (snapshotTarget !== undefined) {
    return snapshotTarget;
  }

  return targetDefinitions.find((target) => target.id === targetId);
}

function getBusinessTargetHints(
  waitPayload: unknown,
  targetDefinitions: RuntimeTargetDescriptor[],
  requestedTargetId: string
): string[] {
  const candidates = new Map<string, RuntimeSnapshotTarget | RuntimeTargetDescriptor>();
  for (const target of targetDefinitions) {
    candidates.set(target.id, target);
  }

  const snapshot = getRuntimeSnapshot(waitPayload);
  if (snapshot !== undefined) {
    for (const target of Object.values(snapshot.targets)) {
      candidates.set(target.id, target);
    }
  }

  return [...candidates.values()]
    .filter((target) => target.id !== requestedTargetId && classifyVerifyTarget(target) === "business")
    .map((target) => target.id)
    .slice(0, 5);
}

function classifyVerifyTarget(target: RuntimeSnapshotTarget | RuntimeTargetDescriptor | undefined): VerifyTargetClass {
  if (target === undefined) return "unknown";

  const id = target.id.toLowerCase();
  const type = target.type.toLowerCase();
  const source = target.source?.toLowerCase() ?? "";

  if (id.startsWith("modern:garfish") || type.includes("garfish") || source.includes("garfish")) {
    return "garfish";
  }
  if (id.startsWith("mf:") || type.startsWith("mf.") || source.includes("module-federation") || source === "mf") {
    return "module-federation";
  }
  if (id.startsWith("modern:") || type.startsWith("modern.") || source.includes("modern")) {
    return "modern";
  }
  if (id.startsWith("divebell:") || type.startsWith("divebell.") || source === "divebell") {
    return "divebell";
  }

  return "business";
}

async function readVerifyVisibility(divebell: DivebellExtensionApi): Promise<VerifyVisibilityResult> {
  try {
    const parsed = await divebell.browser.eval(createPageVisibilityScript());
    if (!isRecord(parsed)) {
      return {
        checked: true,
        status: "unknown",
        blank: null,
        reason: "Browser visibility check did not return an object."
      };
    }

    const blank = typeof parsed.blank === "boolean" ? parsed.blank : null;
    return {
      checked: true,
      status: blank === true ? "blank" : blank === false ? "visible" : "unknown",
      blank,
      details: {
        ...optionalString("url", getStringValue(parsed.url)),
        ...optionalString("title", getStringValue(parsed.title)),
        ...optionalNumber("textLength", getNumberValue(parsed.textLength)),
        ...optionalNumber("visibleElementCount", getNumberValue(parsed.visibleElementCount)),
        ...optionalNumber("bodyChildElementCount", getNumberValue(parsed.bodyChildElementCount)),
        ...optionalNumber("rootChildElementCount", getNumberValue(parsed.rootChildElementCount))
      }
    };
  } catch (error) {
    return {
      checked: true,
      status: "unavailable",
      blank: null,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function optionalString<Name extends string>(name: Name, value: string | undefined): Record<Name, string> | Record<string, never> {
  return value === undefined ? {} : { [name]: value } as Record<Name, string>;
}

function optionalNumber<Name extends string>(name: Name, value: number | undefined): Record<Name, number> | Record<string, never> {
  return value === undefined ? {} : { [name]: value } as Record<Name, number>;
}

function createSkippedVisibility(reason: string): VerifyVisibilityResult {
  return {
    checked: false,
    status: "unknown",
    blank: null,
    reason
  };
}

function createPageVisibilityScript(): string {
  return [
    "(() => {",
    "  const body = document.body;",
    "  if (!body) return { blank: true, url: location.href, title: document.title, textLength: 0, visibleElementCount: 0, bodyChildElementCount: 0, rootChildElementCount: 0 };",
    "  const isVisible = (element) => {",
    "    const style = window.getComputedStyle(element);",
    "    const rect = element.getBoundingClientRect();",
    "    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;",
    "  };",
    "  const visibleElementCount = Array.from(body.querySelectorAll('*')).filter(isVisible).length;",
    "  const textLength = (body.innerText || '').replace(/\\s+/g, ' ').trim().length;",
    "  const root = document.querySelector('#root, #app, [data-divebell-root], main, [role=\"main\"]');",
    "  const bodyChildElementCount = body.children.length;",
    "  const rootChildElementCount = root ? root.children.length : 0;",
    "  const blank = textLength === 0 && visibleElementCount <= 1 && bodyChildElementCount <= 1 && rootChildElementCount === 0;",
    "  return { blank, url: location.href, title: document.title, textLength, visibleElementCount, bodyChildElementCount, rootChildElementCount };",
    "})()"
  ].join("\n");
}

function getWaitSuccess(waitPayload: unknown): boolean | undefined {
  if (!isRecord(waitPayload)) return undefined;
  return typeof waitPayload.success === "boolean" ? waitPayload.success : undefined;
}

function getRuntimeSnapshot(waitPayload: unknown): RuntimeSnapshot | undefined {
  const snapshot = getRecordField(waitPayload, "snapshot");
  if (!isRecord(snapshot) || !isRecord(snapshot.targets)) return undefined;
  return snapshot as unknown as RuntimeSnapshot;
}

function getRecordField(value: unknown, field: string): unknown {
  return isRecord(value) ? value[field] : undefined;
}

function isRuntimeSnapshotTargetLike(value: unknown): value is RuntimeSnapshotTarget {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.status === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getStringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getNumberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
