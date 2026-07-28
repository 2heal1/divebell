import { DIVEBELL_SESSION_QUERY_PARAM } from "@divebell/core";

export function withDivebellSession(input: string, sessionId: string | undefined): string {
  if (sessionId === undefined || sessionId.length === 0) return input;
  try {
    const url = new URL(input);
    url.searchParams.set(DIVEBELL_SESSION_QUERY_PARAM, sessionId);
    return url.toString();
  } catch {
    return input;
  }
}

export function getDivebellSessionId(input: string): string | undefined {
  try {
    const sessionId = new URL(input).searchParams.get(DIVEBELL_SESSION_QUERY_PARAM);
    return sessionId === null || sessionId.length === 0 ? undefined : sessionId;
  } catch {
    return undefined;
  }
}
