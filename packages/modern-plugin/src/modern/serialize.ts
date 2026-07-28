import type { RuntimeError } from "@divebell/core";
import type {
  ModernNavigationState,
  ModernRouterLocation,
  ModernRouterState
} from "./events.js";

export function toRuntimeError(error: unknown, code?: string): RuntimeError {
  if (error instanceof Error) {
    const runtimeError: RuntimeError = {
      message: error.message,
      ...(code === undefined ? {} : { code }),
      ...(error.stack === undefined ? {} : { stack: error.stack })
    };

    return runtimeError;
  }

  return {
    message: typeof error === "string" ? error : "Unknown Modern.js runtime error.",
    ...(code === undefined ? {} : { code }),
    data: toJsonSafeValue(error)
  };
}

export function getRouterStateData(state: ModernRouterState | undefined): Record<string, unknown> {
  if (state === undefined) {
    return {};
  }

  return {
    location: getLocationData(state.location),
    navigation: getNavigationData(state.navigation),
    matches: state.matches?.map((match) => ({
      routeId: match.route?.id ?? match.id,
      pathname: match.pathname
    })),
    errorRouteIds: state.errors === null || state.errors === undefined ? [] : Object.keys(state.errors)
  };
}

export function getLocationData(location: ModernRouterLocation | undefined): Record<string, unknown> | undefined {
  if (location === undefined) {
    return undefined;
  }

  return {
    ...(location.pathname === undefined ? {} : { pathname: location.pathname }),
    ...(location.search === undefined ? {} : { search: location.search }),
    ...(location.hash === undefined ? {} : { hash: location.hash }),
    ...(location.key === undefined ? {} : { key: location.key })
  };
}

export function getNavigationData(
  navigation: ModernNavigationState | undefined
): Record<string, unknown> | undefined {
  if (navigation === undefined) {
    return undefined;
  }

  return {
    ...(navigation.state === undefined ? {} : { state: navigation.state }),
    ...(navigation.location === undefined ? {} : { location: getLocationData(navigation.location) })
  };
}

export function getPlainResponseData(response: unknown): Record<string, unknown> {
  if (response === null || typeof response !== "object") {
    return {
      response: toJsonSafeValue(response)
    };
  }

  const maybeResponse = response as {
    status?: unknown;
    statusText?: unknown;
    url?: unknown;
    headers?: unknown;
  };

  return {
    ...(typeof maybeResponse.status === "number" ? { status: maybeResponse.status } : {}),
    ...(typeof maybeResponse.statusText === "string" ? { statusText: maybeResponse.statusText } : {}),
    ...(typeof maybeResponse.url === "string" ? { url: maybeResponse.url } : {})
  };
}

export function toJsonSafeValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    };
  }
  if (Array.isArray(value)) {
    return value.map(toJsonSafeValue);
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item !== "function") {
      output[key] = toJsonSafeValue(item);
    }
  }

  return output;
}
