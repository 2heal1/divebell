export const divebellContextScriptId = "__DIVEBELL_CONTEXT__";

export interface DivebellRenderContext {
  runtimeId: string;
  renderId: string;
  source: string;
}

export function createDivebellRenderContext(source: string): DivebellRenderContext {
  return {
    runtimeId: createId("runtime"),
    renderId: createId("render"),
    source
  };
}

export function injectDivebellRenderContext(
  html: string,
  context: DivebellRenderContext
): string {
  const script = createDivebellRenderContextScript(context);
  if (html.includes("</head>")) {
    return html.replace("</head>", `${script}</head>`);
  }

  return `${script}${html}`;
}

export function createDivebellRenderContextScript(context: DivebellRenderContext): string {
  return `<script id="${divebellContextScriptId}" type="application/json">${escapeJsonForHtml(context)}</script>`;
}

export function readDivebellRenderContext(): DivebellRenderContext | undefined {
  const element = globalThis.document?.getElementById(divebellContextScriptId);
  if (element?.textContent === undefined || element.textContent.length === 0) {
    return undefined;
  }

  try {
    const value = JSON.parse(element.textContent) as Partial<DivebellRenderContext>;
    if (
      typeof value.runtimeId !== "string" ||
      typeof value.renderId !== "string" ||
      typeof value.source !== "string"
    ) {
      return undefined;
    }

    return {
      runtimeId: value.runtimeId,
      renderId: value.renderId,
      source: value.source
    };
  } catch {
    return undefined;
  }
}

function createId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid !== undefined) {
    return `${prefix}-${uuid}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
