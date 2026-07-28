import type {
  BridgeRuntimeCommandName,
  BridgeRuntimeQuery,
  GetActionsQuery,
  GetEventsQuery,
  GetSnapshotQuery,
  GetTargetsQuery,
  RuntimeActionRisk,
  RuntimeStatus
} from "@divebell/core";

export function getCommandFromResource(resource: string): BridgeRuntimeCommandName | undefined {
  if (resource === "targets") return "getTargets";
  if (resource === "snapshot") return "getSnapshot";
  if (resource === "events") return "getEvents";
  if (resource === "actions") return "getActions";
  return undefined;
}

export function parseRuntimeQuery(
  method: BridgeRuntimeCommandName,
  searchParams: URLSearchParams
): BridgeRuntimeQuery | undefined {
  if (method === "getTargets") return parseTargetsQuery(searchParams);
  if (method === "getSnapshot") return parseSnapshotQuery(searchParams);
  if (method === "getEvents") return parseEventsQuery(searchParams);
  return parseActionsQuery(searchParams);
}

function parseTargetsQuery(searchParams: URLSearchParams): GetTargetsQuery | undefined {
  const query: GetTargetsQuery = {};
  setIfDefined(query, "id", getStringValues(searchParams, "id"));
  setIfDefined(query, "type", getStringValues(searchParams, "type"));
  setIfDefined(query, "source", getStringValues(searchParams, "source"));
  setIfDefined(query, "status", getStringValues(searchParams, "status") as RuntimeStatus | RuntimeStatus[] | undefined);
  setIfDefined(query, "query", getStringValue(searchParams, "query"));
  return maybeQuery(query);
}

function parseSnapshotQuery(searchParams: URLSearchParams): GetSnapshotQuery | undefined {
  const query: GetSnapshotQuery = {};
  setIfDefined(query, "id", getStringValues(searchParams, "id"));
  setIfDefined(query, "type", getStringValues(searchParams, "type"));
  setIfDefined(query, "source", getStringValues(searchParams, "source"));
  setIfDefined(query, "status", getStringValues(searchParams, "status") as RuntimeStatus | RuntimeStatus[] | undefined);
  setIfDefined(query, "query", getStringValue(searchParams, "query"));
  return maybeQuery(query);
}

function parseEventsQuery(searchParams: URLSearchParams): GetEventsQuery | undefined {
  const query: GetEventsQuery = {};
  setIfDefined(query, "since", getNumberValue(searchParams, "since"));
  setIfDefined(query, "targetId", getStringValues(searchParams, "targetId") ?? getStringValues(searchParams, "target-id"));
  setIfDefined(query, "actionName", getStringValues(searchParams, "actionName") ?? getStringValues(searchParams, "action"));
  setIfDefined(query, "type", getStringValues(searchParams, "type"));
  setIfDefined(query, "source", getStringValues(searchParams, "source"));
  setIfDefined(query, "status", getStringValues(searchParams, "status") as RuntimeStatus | RuntimeStatus[] | undefined);
  setIfDefined(query, "limit", getNumberValue(searchParams, "limit"));
  setIfDefined(query, "query", getStringValue(searchParams, "query"));
  return maybeQuery(query);
}

function parseActionsQuery(searchParams: URLSearchParams): GetActionsQuery | undefined {
  const query: GetActionsQuery = {};
  setIfDefined(query, "name", getStringValues(searchParams, "name"));
  setIfDefined(query, "source", getStringValues(searchParams, "source"));
  setIfDefined(query, "risk", getStringValues(searchParams, "risk") as RuntimeActionRisk | RuntimeActionRisk[] | undefined);
  setIfDefined(query, "enabled", getBooleanValue(searchParams, "enabled"));
  setIfDefined(query, "query", getStringValue(searchParams, "query"));
  return maybeQuery(query);
}

function getStringValue(searchParams: URLSearchParams, name: string): string | undefined {
  return searchParams.get(name) ?? undefined;
}

function getStringValues(searchParams: URLSearchParams, name: string): string | string[] | undefined {
  const values = searchParams.getAll(name);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : values;
}

function getNumberValue(searchParams: URLSearchParams, name: string): number | undefined {
  const value = searchParams.get(name);
  if (value === null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function getBooleanValue(searchParams: URLSearchParams, name: string): boolean | undefined {
  const value = searchParams.get(name);
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function maybeQuery<T extends object>(query: T): T | undefined {
  return Object.keys(query).length === 0 ? undefined : query;
}

function setIfDefined<T extends object, K extends keyof T>(
  query: T,
  key: K,
  value: T[K] | undefined
): void {
  if (value !== undefined) {
    query[key] = value;
  }
}
