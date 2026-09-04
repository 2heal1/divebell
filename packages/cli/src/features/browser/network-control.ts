import { createHash } from "node:crypto";

export const BROWSER_REQUEST_RULES_SCHEMA_VERSION = 1;

export type BrowserRequestAction =
  | { type: "rewrite"; targetPrefix: string }
  | { type: "fulfill"; url: string; timeoutMs?: number };

export interface BrowserRequestRule {
  id: string;
  match: {
    url?: string;
    urlPrefix?: string;
    resourceTypes?: readonly string[];
  };
  action: BrowserRequestAction;
}

export interface BrowserRequestRules {
  schemaVersion: 1;
  rules: readonly BrowserRequestRule[];
}

export interface NetworkRequest {
  url: string;
  resourceType?: string;
}

export function validateBrowserRequestRules(value: unknown): BrowserRequestRules {
  const record = requireRecord(value, "Request rules must be a JSON object.");
  if (record.schemaVersion !== BROWSER_REQUEST_RULES_SCHEMA_VERSION) {
    throw new Error(`Request rules schemaVersion must be ${BROWSER_REQUEST_RULES_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(record.rules) || record.rules.length === 0) {
    throw new Error("Request rules must declare a non-empty rules array.");
  }
  if (record.rules.length > 100) throw new Error("Request rules may declare at most 100 rules.");
  const ids = new Set<string>();
  const rules = record.rules.map((candidate, index) => {
    const rule = requireRecord(candidate, `Request rule ${index + 1} must be an object.`);
    const id = requireIdentifier(rule.id, `Request rule ${index + 1} id`);
    if (ids.has(id)) throw new Error(`Request rule id "${id}" is declared more than once.`);
    ids.add(id);
    return {
      id,
      match: validateNetworkMatch(rule.match, id),
      action: validateNetworkAction(rule.action, id)
    };
  });
  return { schemaVersion: 1, rules };
}

export function matchBrowserRequestRule(
  rules: BrowserRequestRules,
  request: NetworkRequest
): BrowserRequestRule | undefined {
  if (!isHttpUrl(request.url)) return undefined;
  return rules.rules.find((rule) => {
    if (rule.match.url !== undefined && request.url !== rule.match.url) return false;
    if (rule.match.urlPrefix !== undefined && !request.url.startsWith(rule.match.urlPrefix)) return false;
    return rule.match.resourceTypes === undefined
      || (request.resourceType !== undefined && rule.match.resourceTypes.includes(request.resourceType));
  });
}

export function rewriteBrowserRequestUrl(rule: BrowserRequestRule, sourceUrl: string): string {
  if (rule.action.type !== "rewrite") throw new Error(`Request rule "${rule.id}" is not a rewrite rule.`);
  const sourcePrefix = rule.match.urlPrefix;
  if (sourcePrefix === undefined || !sourceUrl.startsWith(sourcePrefix)) {
    throw new Error(`Request rule "${rule.id}" cannot rewrite URL outside its urlPrefix.`);
  }
  return `${rule.action.targetPrefix}${sourceUrl.slice(sourcePrefix.length)}`;
}

export function createBrowserNetworkFingerprint(value: {
  rules?: BrowserRequestRules;
  fixedProxy?: string;
  proxyPacUrl?: string;
}): string | undefined {
  if (value.rules === undefined && value.fixedProxy === undefined && value.proxyPacUrl === undefined) return undefined;
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

export function validateBrowserProxyPacUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Browser proxy PAC URL must be a non-empty HTTP(S) URL.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Browser proxy PAC URL must be a valid HTTP(S) URL.");
  }
  if (!isHttpUrl(url.toString()) || url.username || url.password || url.hash) {
    throw new Error("Browser proxy PAC URL must be an HTTP(S) URL without credentials or a fragment.");
  }
  return url.toString();
}

function validateNetworkMatch(value: unknown, id: string): BrowserRequestRule["match"] {
  const match = requireRecord(value, `Request rule "${id}" match must be an object.`);
  const url = match.url === undefined ? undefined : validateHttpUrl(match.url, `Request rule "${id}" match.url`);
  const urlPrefix = match.urlPrefix === undefined ? undefined : validateHttpUrlPrefix(match.urlPrefix, `Request rule "${id}" match.urlPrefix`);
  if ((url === undefined) === (urlPrefix === undefined)) {
    throw new Error(`Request rule "${id}" match must declare exactly one of url or urlPrefix.`);
  }
  const resourceTypes = match.resourceTypes === undefined
    ? undefined
    : validateStringArray(match.resourceTypes, `Request rule "${id}" match.resourceTypes`, 32);
  return { ...(url === undefined ? {} : { url }), ...(urlPrefix === undefined ? {} : { urlPrefix }), ...(resourceTypes === undefined ? {} : { resourceTypes }) };
}

function validateNetworkAction(value: unknown, id: string): BrowserRequestAction {
  const action = requireRecord(value, `Request rule "${id}" action must be an object.`);
  if (action.type === "rewrite") {
    return { type: "rewrite", targetPrefix: validateHttpUrlPrefix(action.targetPrefix, `Request rule "${id}" action.targetPrefix`) };
  }
  if (action.type === "fulfill") {
    const timeoutMs = action.timeoutMs;
    if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)) {
      throw new Error(`Request rule "${id}" action.timeoutMs must be an integer from 1 to 60000.`);
    }
    return { type: "fulfill", url: validateHttpUrl(action.url, `Request rule "${id}" action.url`), ...(timeoutMs === undefined ? {} : { timeoutMs }) };
  }
  throw new Error(`Request rule "${id}" action.type must be rewrite or fulfill.`);
}

function validateHttpUrl(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty HTTP(S) URL.`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${label} must be a valid HTTP(S) URL.`); }
  if (!isHttpUrl(url.toString()) || url.username || url.password || url.hash) {
    throw new Error(`${label} must be an HTTP(S) URL without credentials or a fragment.`);
  }
  return url.toString();
}

function validateHttpUrlPrefix(value: unknown, label: string): string {
  const url = validateHttpUrl(value, label);
  if (new URL(url).search) throw new Error(`${label} must not contain a query string.`);
  return url;
}

function validateStringArray(value: unknown, label: string, maximum: number): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${label} must be a non-empty string array with at most ${maximum} entries.`);
  }
  return [...value];
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value)) {
    throw new Error(`${label} must match /^[a-z][a-z0-9-]{0,63}$/.`);
  }
  return value;
}

function requireRecord(value: unknown, message: string): Record<string, any> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, any>;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
