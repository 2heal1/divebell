import type {
  ModernRenderContext,
  ModernStreamSsrExtender
} from "./events.js";
import {
  createDivebellRenderContextScript,
  type DivebellRenderContext
} from "../runtime/render-context.js";

const streamSsrStateKey = "__DIVEBELL_MODERN_STREAM_SSR_STATE__";

interface DivebellStreamSsrState {
  renderContext: DivebellRenderContext;
  complete: () => void;
  completed: boolean;
}

export function attachDivebellStreamSsrState(
  context: ModernRenderContext,
  renderContext: DivebellRenderContext,
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
    } satisfies DivebellStreamSsrState
  });
}

export function createDivebellStreamSsrExtender(): ModernStreamSsrExtender {
  let streamState: DivebellStreamSsrState | undefined;

  return {
    init(params) {
      streamState = findDivebellStreamSsrState(params.rootElement);
    },
    getStyleTags() {
      if (streamState === undefined || streamState.completed) {
        return "";
      }

      streamState.completed = true;
      streamState.complete();
      return createDivebellRenderContextScript(streamState.renderContext);
    }
  };
}

function findDivebellStreamSsrState(value: unknown, seen = new Set<unknown>()): DivebellStreamSsrState | undefined {
  if (!isRecord(value) || seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  const direct = readDivebellStreamSsrState(value);
  if (direct !== undefined) {
    return direct;
  }

  const props = value.props;
  if (!isRecord(props)) {
    return undefined;
  }

  const propsValue = props.value;
  if (isRecord(propsValue)) {
    const fromPropsValue = readDivebellStreamSsrState(propsValue);
    if (fromPropsValue !== undefined) {
      return fromPropsValue;
    }
  }

  const children = props.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const childState = findDivebellStreamSsrState(child, seen);
      if (childState !== undefined) {
        return childState;
      }
    }
    return undefined;
  }

  return findDivebellStreamSsrState(children, seen);
}

function readDivebellStreamSsrState(value: Record<string, unknown>): DivebellStreamSsrState | undefined {
  const ssrContext = value.ssrContext;
  if (!isRecord(ssrContext)) {
    return undefined;
  }

  const candidate = ssrContext[streamSsrStateKey];
  return isDivebellStreamSsrState(candidate) ? candidate : undefined;
}

function isDivebellStreamSsrState(value: unknown): value is DivebellStreamSsrState {
  if (!isRecord(value)) {
    return false;
  }

  return isRenderContext(value.renderContext)
    && typeof value.complete === "function"
    && typeof value.completed === "boolean";
}

function isRenderContext(value: unknown): value is DivebellRenderContext {
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
