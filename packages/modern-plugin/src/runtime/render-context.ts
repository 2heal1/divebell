export const openRuntimeContextScriptId = "__OPEN_RUNTIME_CONTEXT__";

export interface OpenRuntimeRenderContext {
  runtimeId: string;
  renderId: string;
  source: string;
}

export function createOpenRuntimeRenderContext(source: string): OpenRuntimeRenderContext {
  return {
    runtimeId: createId("runtime"),
    renderId: createId("render"),
    source
  };
}

export function injectOpenRuntimeRenderContext(
  html: string,
  context: OpenRuntimeRenderContext
): string {
  const script = createOpenRuntimeRenderContextScript(context);
  if (html.includes("</head>")) {
    return html.replace("</head>", `${script}</head>`);
  }

  return `${script}${html}`;
}

export function createOpenRuntimeRenderContextScript(context: OpenRuntimeRenderContext): string {
  return `<script id="${openRuntimeContextScriptId}" type="application/json">${escapeJsonForHtml(context)}</script>`;
}

export function readOpenRuntimeRenderContext(): OpenRuntimeRenderContext | undefined {
  const element = globalThis.document?.getElementById(openRuntimeContextScriptId);
  if (element?.textContent === undefined || element.textContent.length === 0) {
    return undefined;
  }

  try {
    const value = JSON.parse(element.textContent) as Partial<OpenRuntimeRenderContext>;
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
