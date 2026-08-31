import { createHash } from "node:crypto";

export const BROWSER_NETWORK_RULES_SCHEMA_VERSION = 1;
export const BROWSER_PROXY_DESCRIPTOR_SCHEMA_VERSION = 1;

export type BrowserNetworkAction =
  | { type: "rewrite"; targetPrefix: string }
  | { type: "fulfill"; url: string; timeoutMs?: number };

export interface BrowserNetworkRule {
  id: string;
  match: {
    url?: string;
    urlPrefix?: string;
    resourceTypes?: readonly string[];
  };
  action: BrowserNetworkAction;
}

export interface BrowserNetworkRules {
  schemaVersion: 1;
  rules: readonly BrowserNetworkRule[];
}

export interface BrowserProxyEndpoint {
  id: string;
  url: string;
}

export interface BrowserProxyRule {
  endpoint?: string;
  direct?: boolean;
  match?: {
    hosts?: readonly string[];
    hostSuffixes?: readonly string[];
    urlGlobs?: readonly string[];
  };
}

export interface BrowserProxyDescriptor {
  schemaVersion: 1;
  endpoints: readonly BrowserProxyEndpoint[];
  rules: readonly BrowserProxyRule[];
  fallback?: "DIRECT";
}

export interface BrowserProxyDescriptorInput {
  schemaVersion?: unknown;
  endpoints?: unknown;
  rules?: unknown;
  fallback?: unknown;
}

export interface NetworkRequest {
  url: string;
  resourceType?: string;
}

export function validateBrowserNetworkRules(value: unknown): BrowserNetworkRules {
  const record = requireRecord(value, "Network rules must be a JSON object.");
  if (record.schemaVersion !== BROWSER_NETWORK_RULES_SCHEMA_VERSION) {
    throw new Error(`Network rules schemaVersion must be ${BROWSER_NETWORK_RULES_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(record.rules) || record.rules.length === 0) {
    throw new Error("Network rules must declare a non-empty rules array.");
  }
  if (record.rules.length > 100) throw new Error("Network rules may declare at most 100 rules.");
  const ids = new Set<string>();
  const rules = record.rules.map((candidate, index) => {
    const rule = requireRecord(candidate, `Network rule ${index + 1} must be an object.`);
    const id = requireIdentifier(rule.id, `Network rule ${index + 1} id`);
    if (ids.has(id)) throw new Error(`Network rule id "${id}" is declared more than once.`);
    ids.add(id);
    return {
      id,
      match: validateNetworkMatch(rule.match, id),
      action: validateNetworkAction(rule.action, id)
    };
  });
  return { schemaVersion: 1, rules };
}

export function validateBrowserProxyDescriptor(value: unknown): BrowserProxyDescriptor {
  const record = requireRecord(value, "Browser proxy descriptor must be an object.") as BrowserProxyDescriptorInput;
  if (record.schemaVersion !== BROWSER_PROXY_DESCRIPTOR_SCHEMA_VERSION) {
    throw new Error(`Browser proxy descriptor schemaVersion must be ${BROWSER_PROXY_DESCRIPTOR_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(record.endpoints) || record.endpoints.length === 0) {
    throw new Error("Browser proxy descriptor must declare a non-empty endpoints array.");
  }
  if (!Array.isArray(record.rules)) {
    throw new Error("Browser proxy descriptor rules must be an array.");
  }
  if (record.fallback !== undefined && record.fallback !== "DIRECT") {
    throw new Error('Browser proxy descriptor fallback must be "DIRECT" when supplied.');
  }
  const endpointIds = new Set<string>();
  const endpoints = record.endpoints.map((candidate, index) => {
    const endpoint = requireRecord(candidate, `Proxy endpoint ${index + 1} must be an object.`);
    const id = requireIdentifier(endpoint.id, `Proxy endpoint ${index + 1} id`);
    if (endpointIds.has(id)) throw new Error(`Proxy endpoint id "${id}" is declared more than once.`);
    endpointIds.add(id);
    return { id, url: validateProxyEndpoint(endpoint.url, `Proxy endpoint "${id}"`) };
  });
  const rules = record.rules.map((candidate, index) => {
    const rule = requireRecord(candidate, `Proxy rule ${index + 1} must be an object.`);
    const direct = rule.direct === true;
    const endpoint = typeof rule.endpoint === "string" ? rule.endpoint : undefined;
    if (direct === (endpoint !== undefined)) {
      throw new Error(`Proxy rule ${index + 1} must declare exactly one of direct: true or endpoint.`);
    }
    if (endpoint !== undefined && !endpointIds.has(endpoint)) {
      throw new Error(`Proxy rule ${index + 1} references unknown endpoint "${endpoint}".`);
    }
    return {
      ...(endpoint === undefined ? { direct: true } : { endpoint }),
      ...(rule.match === undefined ? {} : { match: validateProxyMatch(rule.match, index + 1) })
    };
  });
  return { schemaVersion: 1, endpoints, rules, ...(record.fallback === undefined ? {} : { fallback: "DIRECT" }) };
}

export function matchBrowserNetworkRule(
  rules: BrowserNetworkRules,
  request: NetworkRequest
): BrowserNetworkRule | undefined {
  if (!isHttpUrl(request.url)) return undefined;
  return rules.rules.find((rule) => {
    if (rule.match.url !== undefined && request.url !== rule.match.url) return false;
    if (rule.match.urlPrefix !== undefined && !request.url.startsWith(rule.match.urlPrefix)) return false;
    return rule.match.resourceTypes === undefined
      || (request.resourceType !== undefined && rule.match.resourceTypes.includes(request.resourceType));
  });
}

export function rewriteBrowserRequestUrl(rule: BrowserNetworkRule, sourceUrl: string): string {
  if (rule.action.type !== "rewrite") throw new Error(`Network rule "${rule.id}" is not a rewrite rule.`);
  const sourcePrefix = rule.match.urlPrefix;
  if (sourcePrefix === undefined || !sourceUrl.startsWith(sourcePrefix)) {
    throw new Error(`Network rule "${rule.id}" cannot rewrite URL outside its urlPrefix.`);
  }
  return `${rule.action.targetPrefix}${sourceUrl.slice(sourcePrefix.length)}`;
}

export function createBrowserNetworkFingerprint(value: {
  rules?: BrowserNetworkRules;
  proxy?: BrowserProxyDescriptor;
  fixedProxy?: string;
}): string | undefined {
  if (value.rules === undefined && value.proxy === undefined && value.fixedProxy === undefined) return undefined;
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

export function createPacScript(descriptor: BrowserProxyDescriptor): string {
  const endpointDirectives = Object.fromEntries(descriptor.endpoints.map((endpoint) => [
    endpoint.id,
    proxyDirective(endpoint.url)
  ]));
  const rules = descriptor.rules.map((rule) => ({
    directive: rule.direct === true ? "DIRECT" : endpointDirectives[rule.endpoint as string],
    match: rule.match ?? {}
  }));
  return [
    "// Generated by Divebell. Do not edit this ephemeral PAC response.",
    `const divebellProxyRules = ${JSON.stringify(rules)};`,
    "function FindProxyForURL(url, host) {",
    "  for (const rule of divebellProxyRules) {",
    "    const match = rule.match;",
    "    if (match.hosts && !match.hosts.includes(host)) continue;",
    "    if (match.hostSuffixes && !match.hostSuffixes.some((suffix) => host === suffix || host.endsWith('.' + suffix))) continue;",
    "    if (match.urlGlobs && !match.urlGlobs.some((glob) => shExpMatch(url, glob))) continue;",
    "    return rule.directive;",
    "  }",
    "  return 'DIRECT';",
    "}"
  ].join("\n");
}

function validateNetworkMatch(value: unknown, id: string): BrowserNetworkRule["match"] {
  const match = requireRecord(value, `Network rule "${id}" match must be an object.`);
  const url = match.url === undefined ? undefined : validateHttpUrl(match.url, `Network rule "${id}" match.url`);
  const urlPrefix = match.urlPrefix === undefined ? undefined : validateHttpUrlPrefix(match.urlPrefix, `Network rule "${id}" match.urlPrefix`);
  if ((url === undefined) === (urlPrefix === undefined)) {
    throw new Error(`Network rule "${id}" match must declare exactly one of url or urlPrefix.`);
  }
  const resourceTypes = match.resourceTypes === undefined
    ? undefined
    : validateStringArray(match.resourceTypes, `Network rule "${id}" match.resourceTypes`, 32);
  return { ...(url === undefined ? {} : { url }), ...(urlPrefix === undefined ? {} : { urlPrefix }), ...(resourceTypes === undefined ? {} : { resourceTypes }) };
}

function validateNetworkAction(value: unknown, id: string): BrowserNetworkAction {
  const action = requireRecord(value, `Network rule "${id}" action must be an object.`);
  if (action.type === "rewrite") {
    return { type: "rewrite", targetPrefix: validateHttpUrlPrefix(action.targetPrefix, `Network rule "${id}" action.targetPrefix`) };
  }
  if (action.type === "fulfill") {
    const timeoutMs = action.timeoutMs;
    if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)) {
      throw new Error(`Network rule "${id}" action.timeoutMs must be an integer from 1 to 60000.`);
    }
    return { type: "fulfill", url: validateHttpUrl(action.url, `Network rule "${id}" action.url`), ...(timeoutMs === undefined ? {} : { timeoutMs }) };
  }
  throw new Error(`Network rule "${id}" action.type must be rewrite or fulfill.`);
}

function validateProxyMatch(value: unknown, index: number): NonNullable<BrowserProxyRule["match"]> {
  const match = requireRecord(value, `Proxy rule ${index} match must be an object.`);
  const hosts = match.hosts === undefined ? undefined : validateHostArray(match.hosts, `Proxy rule ${index} match.hosts`);
  const hostSuffixes = match.hostSuffixes === undefined ? undefined : validateHostArray(match.hostSuffixes, `Proxy rule ${index} match.hostSuffixes`);
  const urlGlobs = match.urlGlobs === undefined ? undefined : validateGlobs(match.urlGlobs, `Proxy rule ${index} match.urlGlobs`);
  if (hosts === undefined && hostSuffixes === undefined && urlGlobs === undefined) {
    throw new Error(`Proxy rule ${index} match must declare hosts, hostSuffixes, or urlGlobs.`);
  }
  return { ...(hosts === undefined ? {} : { hosts }), ...(hostSuffixes === undefined ? {} : { hostSuffixes }), ...(urlGlobs === undefined ? {} : { urlGlobs }) };
}

function validateProxyEndpoint(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} url must be a string.`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${label} url must be a valid URL.`); }
  if (!["http:", "https:", "socks:", "socks4:", "socks5:"].includes(url.protocol)) {
    throw new Error(`${label} url must use http, https, socks, socks4, or socks5.`);
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "" && url.pathname !== "/")) {
    throw new Error(`${label} url must not contain credentials, a path, query, or fragment.`);
  }
  if (!url.hostname || !url.port || Number(url.port) < 1 || Number(url.port) > 65535) {
    throw new Error(`${label} url must include a port from 1 to 65535.`);
  }
  return url.toString().replace(/\/$/, "");
}

function proxyDirective(endpoint: string): string {
  const url = new URL(endpoint);
  const address = `${url.hostname}:${url.port}`;
  if (url.protocol === "socks4:") return `SOCKS4 ${address}`;
  if (url.protocol === "socks5:") return `SOCKS5 ${address}`;
  if (url.protocol === "socks:") return `SOCKS ${address}`;
  if (url.protocol === "https:") return `HTTPS ${address}`;
  return `PROXY ${address}`;
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

function validateHostArray(value: unknown, label: string): string[] {
  const values = validateStringArray(value, label, 100).map((host) => host.toLowerCase());
  if (values.some((host) => !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host))) {
    throw new Error(`${label} must contain DNS host names only.`);
  }
  return values;
}

function validateGlobs(value: unknown, label: string): string[] {
  const values = validateStringArray(value, label, 100);
  if (values.some((glob) => glob.length > 512 || /[\r\n]/.test(glob))) {
    throw new Error(`${label} entries must be at most 512 characters and contain no newlines.`);
  }
  return values;
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
