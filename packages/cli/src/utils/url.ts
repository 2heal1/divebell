import { OPEN_RUNTIME_SESSION_QUERY_PARAM } from "@openruntime/core";

export function withOpenRuntimeSession(input: string, sessionId: string | undefined): string {
  if (sessionId === undefined || sessionId.length === 0) return input;
  try {
    const url = new URL(input);
    url.searchParams.set(OPEN_RUNTIME_SESSION_QUERY_PARAM, sessionId);
    return url.toString();
  } catch {
    return input;
  }
}

export function getOpenRuntimeSessionId(input: string): string | undefined {
  try {
    const sessionId = new URL(input).searchParams.get(OPEN_RUNTIME_SESSION_QUERY_PARAM);
    return sessionId === null || sessionId.length === 0 ? undefined : sessionId;
  } catch {
    return undefined;
  }
}
