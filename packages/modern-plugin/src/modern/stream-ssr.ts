import type {
  ModernRenderContext,
  ModernStreamSsrExtender
} from "./events.js";
import {
  createOpenRuntimeRenderContextScript,
  type OpenRuntimeRenderContext
} from "../runtime/render-context.js";

const streamSsrStateKey = "__OPEN_RUNTIME_MODERN_STREAM_SSR_STATE__";

interface OpenRuntimeStreamSsrState {
  renderContext: OpenRuntimeRenderContext;
  complete: () => void;
  completed: boolean;
}

export function attachOpenRuntimeStreamSsrState(
  context: ModernRenderContext,
  renderContext: OpenRuntimeRenderContext,
  complete: () => void
): void {
  if (context.ssrContext === undefined) {
    return;
  }

  Object.assign(context.ssrContext, {
    [streamSsrStateKey]: {
      renderContext,
      complete,
      completed: false
    } satisfies OpenRuntimeStreamSsrState
  });
}

export function createOpenRuntimeStreamSsrExtender(): ModernStreamSsrExtender {
  let streamState: OpenRuntimeStreamSsrState | undefined;

  return {
    init(params) {
      streamState = findOpenRuntimeStreamSsrState(params.rootElement);
    },
    getStyleTags() {
      if (streamState === undefined || streamState.completed) {
        return "";
      }

      streamState.completed = true;
      streamState.complete();
      return createOpenRuntimeRenderContextScript(streamState.renderContext);
    }
  };
}

function findOpenRuntimeStreamSsrState(value: unknown, seen = new Set<unknown>()): OpenRuntimeStreamSsrState | undefined {
  if (!isRecord(value) || seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  const direct = readOpenRuntimeStreamSsrState(value);
  if (direct !== undefined) {
    return direct;
  }

  const props = value.props;
  if (!isRecord(props)) {
    return undefined;
  }

  const propsValue = props.value;
  if (isRecord(propsValue)) {
    const fromPropsValue = readOpenRuntimeStreamSsrState(propsValue);
    if (fromPropsValue !== undefined) {
      return fromPropsValue;
    }
  }

  const children = props.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const childState = findOpenRuntimeStreamSsrState(child, seen);
      if (childState !== undefined) {
        return childState;
      }
    }
    return undefined;
  }

  return findOpenRuntimeStreamSsrState(children, seen);
}

function readOpenRuntimeStreamSsrState(value: Record<string, unknown>): OpenRuntimeStreamSsrState | undefined {
  const ssrContext = value.ssrContext;
  if (!isRecord(ssrContext)) {
    return undefined;
  }

  const candidate = ssrContext[streamSsrStateKey];
  return isOpenRuntimeStreamSsrState(candidate) ? candidate : undefined;
}

function isOpenRuntimeStreamSsrState(value: unknown): value is OpenRuntimeStreamSsrState {
  if (!isRecord(value)) {
    return false;
  }

  return isRenderContext(value.renderContext)
    && typeof value.complete === "function"
    && typeof value.completed === "boolean";
}

function isRenderContext(value: unknown): value is OpenRuntimeRenderContext {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.runtimeId === "string"
    && typeof value.renderId === "string"
    && typeof value.source === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
