import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createError } from "../../utils/output.js";
import { bindBrowserRunOptions, type BrowserRunOptions, type BrowserRunResult, type BrowserRunner } from "./runner.js";
import { saveUrlScopedBrowserState } from "./state.js";

export type StateDiagnosisConfidence = "high" | "medium" | "low";

export type StateDiagnosisClassification =
  | "access_ok"
  | "auth_redirect"
  | "login_page"
  | "auth_iframe_or_form"
  | "auth_response"
  | "auth_related_not_found"
  | "not_auth_related"
  | "navigation_failed"
  | "inconclusive";

export interface StateDiagnosisCandidate {
  url: string;
  confidence: StateDiagnosisConfidence;
  evidence: string[];
  sourceStateAvailable?: boolean;
  sourceState?: {
    cookies: number;
    origins: number;
  };
  verified?: boolean;
}

export interface StateDiagnosisResult {
  status: "candidates_found" | "no_candidates";
  classification: StateDiagnosisClassification;
  initialFailure: {
    kind: "none" | "redirect" | "http_status" | "page" | "navigation" | "expectation" | "unknown";
    httpStatus?: number;
    finalOrigin?: string;
    navigationFailure?: NavigationFailureKind;
  };
  navigation: {
    succeeded: boolean;
    finalUrl?: string;
    finalHttpStatus?: number;
    topLevelRedirects: Array<{
      status: number;
      from: string;
      to: string;
    }>;
  };
  validation: {
    expectUrlMatched?: boolean;
    expectTextMatched?: boolean;
  };
  candidates: StateDiagnosisCandidate[];
  suggestedIncludeUrls: string[];
  verification?: {
    attempted: number;
    succeeded: boolean;
    minimalIncludeUrls: string[];
  };
}

export interface StateDiagnosisClassifier {
  isAuthUrl(url: URL): boolean;
  isIrrelevantUrl(url: URL): boolean;
}

export interface DiagnoseMissingStateSourcesOptions {
  url: string;
  statePath: string;
  sourceProfile?: string;
  expectUrl?: string;
  expectText?: string;
  timeoutMs?: number;
  classifier?: StateDiagnosisClassifier;
  maxCandidates?: number;
  maxVerificationAttempts?: number;
}

interface PageFacts {
  url?: string;
  authText: boolean;
  passwordField: boolean;
  forms: Array<{ action: string; hasPassword: boolean }>;
  iframes: string[];
  metaRefreshUrls: string[];
  expectTextMatched?: boolean;
}

interface HarEntry {
  requestUrl: string;
  resourceType?: string;
  status?: number;
  location?: string;
  hasWwwAuthenticate: boolean;
}

interface TopLevelRedirect {
  status: number;
  fromRaw: string;
  toRaw: string;
  from: string;
  to: string;
}

interface NavigationEvidence {
  navigationResult: BrowserRunResult;
  navigationFailure?: NavigationFailureKind;
  harEntries: HarEntry[];
  page: PageFacts;
  finalUrlRaw?: string;
  finalUrl?: string;
  finalHttpStatus?: number;
  redirects: TopLevelRedirect[];
}

type NavigationFailureKind =
  | "timeout"
  | "dns"
  | "connection"
  | "certificate"
  | "state_load"
  | "navigation";

interface CandidateAccumulator {
  url: string;
  confidence: StateDiagnosisConfidence;
  evidence: Set<string>;
}

interface AnalysisResult {
  accessSuccessful: boolean;
  classification: StateDiagnosisClassification;
  candidates: StateDiagnosisCandidate[];
  validation: StateDiagnosisResult["validation"];
}

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_CANDIDATES = 6;
const DEFAULT_MAX_VERIFICATION_ATTEMPTS = 8;
const CONFIDENCE_SCORE: Record<StateDiagnosisConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1
};

const DEFAULT_CLASSIFIER: StateDiagnosisClassifier = {
  isAuthUrl: (url) => {
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    return /(^|[.-])(auth|login|signin|sso|oauth|oidc|identity|accounts?)([.-]|$)/.test(host)
      || /\/(auth|login|log-in|signin|sign-in|sso|oauth|oidc|authorize|identity|session)(\/|$)/.test(path);
  },
  isIrrelevantUrl: (url) => {
    const value = `${url.hostname}${url.pathname}`.toLowerCase();
    return /(analytics|telemetry|monitoring|metrics|doubleclick|google-analytics|newrelic|datadog|sentry|advert|\/ads?\/|pixel|beacon)/.test(value);
  }
};

/**
 * Diagnoses a state-backed access failure in isolated browser sessions.
 * This function never updates the supplied state file or the caller's current
 * Divebell page context.
 */
export async function diagnoseMissingStateSources(
  browserRunner: BrowserRunner,
  options: DiagnoseMissingStateSourcesOptions
): Promise<StateDiagnosisResult> {
  const targetUrl = normalizeDiagnosisInputUrl(options.url);
  const statePath = requireValue(options.statePath, "--state", "STATE_DIAGNOSE_STATE_REQUIRED");
  const sourceProfile = optionalValue(options.sourceProfile, "--source-profile");
  const expectUrl = optionalValue(options.expectUrl, "--expect-url");
  const expectText = optionalValue(options.expectText, "--expect-text");
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const classifier = options.classifier ?? DEFAULT_CLASSIFIER;
  const artifactDirectory = await mkdtemp(join(tmpdir(), "divebell-state-diagnose-"));
  await chmod(artifactDirectory, 0o700);

  try {
    const initialEvidence = await captureNavigationEvidence(browserRunner, {
      artifactDirectory,
      label: "initial",
      statePath: resolve(statePath),
      targetUrl,
      timeoutMs,
      ...(expectText === undefined ? {} : { expectText })
    });
    const analysis = analyzeNavigationEvidence(initialEvidence, targetUrl, {
      classifier,
      ...(expectUrl === undefined ? {} : { expectUrl }),
      ...(expectText === undefined ? {} : { expectText }),
      maxCandidates: options.maxCandidates ?? DEFAULT_MAX_CANDIDATES
    });
    const navigation = createNavigationSummary(initialEvidence);
    if (analysis.accessSuccessful) {
      return {
        status: "no_candidates",
        classification: "access_ok",
        initialFailure: {
          kind: "none",
          ...(navigation.finalOrigin === undefined ? {} : { finalOrigin: navigation.finalOrigin })
        },
        navigation: navigation.summary,
        validation: analysis.validation,
        candidates: [],
        suggestedIncludeUrls: []
      };
    }

    let candidates = analysis.candidates;
    let verification: StateDiagnosisResult["verification"];
    if (sourceProfile !== undefined && candidates.length > 0) {
      const compared = await compareAndVerifySourceProfile(browserRunner, {
        artifactDirectory,
        candidates,
        sourceProfile,
        targetUrl,
        timeoutMs,
        ...(expectUrl === undefined ? {} : { expectUrl }),
        ...(expectText === undefined ? {} : { expectText }),
        classifier,
        maxVerificationAttempts: options.maxVerificationAttempts
          ?? DEFAULT_MAX_VERIFICATION_ATTEMPTS
      });
      candidates = compared.candidates;
      verification = compared.verification;
    }

    const suggestedIncludeUrls = verification?.succeeded === true
      ? verification.minimalIncludeUrls
      : verification === undefined
        ? candidates.map((candidate) => candidate.url)
        : candidates
          .filter((candidate) => candidate.sourceStateAvailable === true)
          .map((candidate) => candidate.url);
    return {
      status: candidates.length === 0 ? "no_candidates" : "candidates_found",
      classification: analysis.classification,
      initialFailure: createInitialFailure(
        initialEvidence,
        analysis.classification,
        expectUrl !== undefined || expectText !== undefined
      ),
      navigation: navigation.summary,
      validation: analysis.validation,
      candidates,
      suggestedIncludeUrls,
      ...(verification === undefined ? {} : { verification })
    };
  } finally {
    await rm(artifactDirectory, { recursive: true, force: true });
  }
}

export function sanitizeStateDiagnosisUrl(input: string, base?: string): string | undefined {
  let url: URL;
  try {
    url = base === undefined ? new URL(input) : new URL(input, base);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  url.pathname = (url.pathname || "/").replace(
    /;(?:jsessionid|sessionid|token|ticket|code)=[^/]*/gi,
    ""
  );
  return url.href;
}

async function captureNavigationEvidence(
  browserRunner: BrowserRunner,
  options: {
    artifactDirectory: string;
    label: string;
    statePath: string;
    targetUrl: URL;
    timeoutMs: number;
    expectText?: string;
  }
): Promise<NavigationEvidence> {
  const session = `divebell-state-diagnose-${randomUUID()}`;
  const harPath = join(options.artifactDirectory, `${options.label}.har`);
  const runOptions: BrowserRunOptions = {
    session,
    disableRestore: true,
    ignoreConfiguredProfile: true,
    defaultTimeoutMs: options.timeoutMs,
    headless: true
  };
  let navigationResult: BrowserRunResult = {
    exitCode: 1,
    stdout: "",
    stderr: "browser session did not start"
  };
  let navigationFailure: NavigationFailureKind | undefined;
  let harStarted = false;
  let page = emptyPageFacts();

  try {
    const launch = await browserRunner.run(
      ["--state", options.statePath, "open", "--json"],
      runOptions
    );
    if (launch.exitCode !== 0) {
      navigationResult = launch;
      navigationFailure = "state_load";
      return {
        navigationResult,
        navigationFailure,
        harEntries: [],
        page,
        redirects: []
      };
    }

    const start = await browserRunner.run(
      ["network", "har", "start", "--content", "none", "--json"],
      runOptions
    );
    if (start.exitCode !== 0) {
      throw createError({
        code: "STATE_DIAGNOSE_CAPTURE_FAILED",
        kind: "browser",
        message: "Could not start metadata-only navigation capture.",
        retryable: true
      });
    }
    harStarted = true;
    navigationResult = await runBrowserSafely(
      browserRunner,
      ["goto", options.targetUrl.href, "--json"],
      runOptions
    );
    if (navigationResult.exitCode !== 0) {
      navigationFailure = classifyNavigationFailure(navigationResult);
    }
    page = await readPageFacts(browserRunner, runOptions, options.expectText);
  } finally {
    if (harStarted) {
      await runBrowserSafely(
        browserRunner,
        ["network", "har", "stop", harPath, "--json"],
        runOptions
      );
    }
    await runBrowserSafely(browserRunner, ["close", "--json"], runOptions);
  }

  const harEntries = await readHarEntries(harPath);
  const finalUrlRaw = page.url ?? inferLastDocumentUrl(harEntries);
  const redirects = traceTopLevelRedirects(options.targetUrl.href, harEntries);
  const finalHttpStatus = findFinalDocumentStatus(finalUrlRaw, harEntries)
    ?? inferLastTopLevelStatus(redirects, harEntries);
  const finalUrl = finalUrlRaw === undefined
    ? undefined
    : sanitizeStateDiagnosisUrl(finalUrlRaw);
  return {
    navigationResult,
    ...(navigationFailure === undefined ? {} : { navigationFailure }),
    harEntries,
    page,
    ...(finalUrlRaw === undefined ? {} : { finalUrlRaw }),
    ...(finalUrl === undefined ? {} : { finalUrl }),
    ...(finalHttpStatus === undefined ? {} : { finalHttpStatus }),
    redirects
  };
}

async function compareAndVerifySourceProfile(
  browserRunner: BrowserRunner,
  options: {
    artifactDirectory: string;
    candidates: StateDiagnosisCandidate[];
    sourceProfile: string;
    targetUrl: URL;
    timeoutMs: number;
    expectUrl?: string;
    expectText?: string;
    classifier: StateDiagnosisClassifier;
    maxVerificationAttempts: number;
  }
): Promise<{
  candidates: StateDiagnosisCandidate[];
  verification: NonNullable<StateDiagnosisResult["verification"]>;
}> {
  const session = `divebell-state-source-${randomUUID()}`;
  const sourceRunOptions: BrowserRunOptions = {
    session,
    disableRestore: true,
    ignoreConfiguredState: true,
    defaultTimeoutMs: options.timeoutMs,
    headless: true
  };
  const sourceRunner = bindBrowserRunOptions(browserRunner, sourceRunOptions);
  const launch = await browserRunner.run(
    ["--profile", options.sourceProfile, "open", "--json"],
    sourceRunOptions
  );
  if (launch.exitCode !== 0) {
    await runBrowserSafely(browserRunner, ["close", "--json"], sourceRunOptions);
    throw createError({
      code: "STATE_DIAGNOSE_SOURCE_PROFILE_FAILED",
      kind: "browser",
      message: "Could not open the explicitly selected source Profile.",
      retryable: true
    });
  }

  try {
    const candidates: StateDiagnosisCandidate[] = [];
    for (const [index, candidate] of options.candidates.entries()) {
      const statePath = join(options.artifactDirectory, `source-candidate-${index}.json`);
      const saved = await saveUrlScopedBrowserState(sourceRunner, {
        url: candidate.url,
        outputPath: statePath,
        collectPrimaryOrigin: true
      });
      const sourceStateAvailable = saved.cookies > 0 || saved.origins > 0;
      candidates.push({
        ...candidate,
        sourceStateAvailable,
        sourceState: {
          cookies: saved.cookies,
          origins: saved.origins
        },
        verified: false
      });
    }

    const availableUrls = candidates
      .filter((candidate) => candidate.sourceStateAvailable === true)
      .map((candidate) => candidate.url)
      .slice(0, 4);
    const combinations = createBoundedCombinations(
      availableUrls,
      normalizeAttemptLimit(options.maxVerificationAttempts)
    );
    let attempted = 0;
    let minimalIncludeUrls: string[] = [];
    for (const includeUrls of combinations) {
      const statePath = join(options.artifactDirectory, `verification-${attempted}.json`);
      await saveUrlScopedBrowserState(sourceRunner, {
        url: options.targetUrl.href,
        includeUrls,
        outputPath: statePath,
        collectPrimaryOrigin: true
      });
      const replay = await captureNavigationEvidence(browserRunner, {
        artifactDirectory: options.artifactDirectory,
        label: `verification-${attempted}`,
        statePath,
        targetUrl: options.targetUrl,
        timeoutMs: options.timeoutMs,
        ...(options.expectText === undefined ? {} : { expectText: options.expectText })
      });
      attempted += 1;
      const analysis = analyzeNavigationEvidence(replay, options.targetUrl, {
        classifier: options.classifier,
        ...(options.expectUrl === undefined ? {} : { expectUrl: options.expectUrl }),
        ...(options.expectText === undefined ? {} : { expectText: options.expectText }),
        maxCandidates: DEFAULT_MAX_CANDIDATES
      });
      if (analysis.accessSuccessful) {
        minimalIncludeUrls = includeUrls;
        break;
      }
    }

    const verified = new Set(minimalIncludeUrls);
    return {
      candidates: candidates.map((candidate) => ({
        ...candidate,
        verified: verified.has(candidate.url)
      })),
      verification: {
        attempted,
        succeeded: minimalIncludeUrls.length > 0,
        minimalIncludeUrls
      }
    };
  } finally {
    await runBrowserSafely(browserRunner, ["close", "--json"], sourceRunOptions);
  }
}

function analyzeNavigationEvidence(
  evidence: NavigationEvidence,
  targetUrl: URL,
  options: {
    classifier: StateDiagnosisClassifier;
    expectUrl?: string;
    expectText?: string;
    maxCandidates: number;
  }
): AnalysisResult {
  const validation: StateDiagnosisResult["validation"] = {
    ...(options.expectUrl === undefined
      ? {}
      : { expectUrlMatched: matchesUrlGlob(evidence.finalUrlRaw, options.expectUrl) }),
    ...(options.expectText === undefined
      ? {}
      : { expectTextMatched: evidence.page.expectTextMatched === true })
  };
  const expected = [validation.expectUrlMatched, validation.expectTextMatched]
    .filter((value) => value !== undefined);
  const acceptableStatus = evidence.finalHttpStatus === undefined
    || evidence.finalHttpStatus < 400;
  const explicitExpectationSucceeded = expected.length > 0
    && expected.every((value) => value === true)
    && evidence.navigationResult.exitCode === 0
    && acceptableStatus;
  if (explicitExpectationSucceeded) {
    return {
      accessSuccessful: true,
      classification: "access_ok",
      candidates: [],
      validation
    };
  }

  const candidates = new Map<string, CandidateAccumulator>();
  const addCandidate = (
    rawUrl: string,
    confidence: StateDiagnosisConfidence,
    evidenceLabel: string,
    base?: string
  ): void => {
    const safeUrl = sanitizeStateDiagnosisUrl(rawUrl, base);
    if (safeUrl === undefined) return;
    let parsed: URL;
    try {
      parsed = new URL(safeUrl);
    } catch {
      return;
    }
    if (options.classifier.isIrrelevantUrl(parsed)) return;
    if (isStaticResource(parsed)) return;
    const safeTarget = sanitizeStateDiagnosisUrl(targetUrl.href);
    if (safeUrl === safeTarget) return;
    const current = candidates.get(safeUrl);
    if (current === undefined) {
      candidates.set(safeUrl, {
        url: safeUrl,
        confidence,
        evidence: new Set([evidenceLabel])
      });
      return;
    }
    if (CONFIDENCE_SCORE[confidence] > CONFIDENCE_SCORE[current.confidence]) {
      current.confidence = confidence;
    }
    current.evidence.add(evidenceLabel);
  };

  const pageAuth = evidence.page.authText || evidence.page.passwordField;
  const topLevelDocumentUrls = new Set([
    stripHash(targetUrl.href),
    ...(evidence.finalUrlRaw === undefined ? [] : [stripHash(evidence.finalUrlRaw)]),
    ...evidence.redirects.flatMap((redirect) => [
      stripHash(redirect.fromRaw),
      stripHash(redirect.toRaw)
    ])
  ]);
  for (const redirect of evidence.redirects) {
    const authRedirect = isAuthUrl(redirect.toRaw, options.classifier)
      || (pageAuth && sameSanitizedUrl(redirect.toRaw, evidence.finalUrlRaw));
    if (authRedirect) {
      addCandidate(redirect.toRaw, "high", "top-level redirect");
    }
  }

  const finalIsAuth = evidence.finalUrlRaw !== undefined
    && (pageAuth || isAuthUrl(evidence.finalUrlRaw, options.classifier));
  const final404 = evidence.finalHttpStatus === 404;
  if (finalIsAuth && evidence.finalUrlRaw !== undefined) {
    addCandidate(
      evidence.finalUrlRaw,
      final404 ? "medium" : "high",
      final404 ? "authentication-related 404" : "final page matched login signals"
    );
  }

  for (const form of evidence.page.forms) {
    if (form.hasPassword || pageAuth || isAuthUrl(form.action, options.classifier)) {
      addCandidate(
        form.action,
        final404 ? "medium" : "high",
        "login form action",
        evidence.finalUrlRaw
      );
    }
  }
  for (const iframe of evidence.page.iframes) {
    if (pageAuth || isAuthUrl(iframe, options.classifier)) {
      addCandidate(
        iframe,
        final404 ? "medium" : "high",
        "authentication iframe",
        evidence.finalUrlRaw
      );
    }
  }
  for (const metaUrl of evidence.page.metaRefreshUrls) {
    if (pageAuth || isAuthUrl(metaUrl, options.classifier)) {
      addCandidate(
        metaUrl,
        final404 ? "medium" : "high",
        "meta refresh to authentication page",
        evidence.finalUrlRaw
      );
    }
  }

  const redirectDestination = evidence.redirects.at(-1)?.toRaw ?? targetUrl.href;
  if (
    evidence.finalUrlRaw !== undefined
    && !sameRawNavigationUrl(redirectDestination, evidence.finalUrlRaw)
    && finalIsAuth
  ) {
    addCandidate(
      evidence.finalUrlRaw,
      final404 ? "medium" : "high",
      "client-side login navigation"
    );
  }

  for (const entry of evidence.harEntries) {
    const resourceType = entry.resourceType?.toLowerCase();
    if (
      resourceType === "document"
      && !topLevelDocumentUrls.has(stripHash(entry.requestUrl))
      && isAuthUrl(entry.requestUrl, options.classifier)
    ) {
      addCandidate(entry.requestUrl, final404 ? "medium" : "high", "authentication iframe");
    }
    if (entry.status === 401 || entry.status === 403) {
      if (resourceType === "xhr" || resourceType === "fetch") {
        const requestOrigin = safeOrigin(sanitizeStateDiagnosisUrl(entry.requestUrl));
        if (requestOrigin !== undefined && requestOrigin !== targetUrl.origin) {
          addCandidate(
            entry.requestUrl,
            "medium",
            `cross-origin XHR/fetch returned ${entry.status}`
          );
        } else if (isAuthUrl(entry.requestUrl, options.classifier)) {
          addCandidate(
            entry.requestUrl,
            "low",
            `same-origin authentication XHR/fetch returned ${entry.status}`
          );
        }
      } else if (resourceType === "document" || isAuthUrl(entry.requestUrl, options.classifier)) {
        addCandidate(
          entry.requestUrl,
          "medium",
          `authentication document returned ${entry.status}`
        );
      }
      if (entry.location !== undefined) {
        addCandidate(
          entry.location,
          "medium",
          "authentication response advertised an entry URL",
          entry.requestUrl
        );
      }
    }
    if (entry.status === 404 && (entry.hasWwwAuthenticate || isAuthUrl(entry.requestUrl, options.classifier))) {
      addCandidate(entry.requestUrl, "low", "authentication-related 404");
    }
  }

  const sortedCandidates = [...candidates.values()]
    .sort((left, right) => {
      const confidenceDifference = CONFIDENCE_SCORE[right.confidence]
        - CONFIDENCE_SCORE[left.confidence];
      return confidenceDifference === 0
        ? left.url.localeCompare(right.url)
        : confidenceDifference;
    })
    .slice(0, normalizeCandidateLimit(options.maxCandidates))
    .map((candidate) => ({
      url: candidate.url,
      confidence: candidate.confidence,
      evidence: [...candidate.evidence]
    }));

  const basicSuccess = expected.length === 0
    && evidence.navigationResult.exitCode === 0
    && acceptableStatus
    && sortedCandidates.length === 0
    && !pageAuth;
  const classification = classifyDiagnosis(evidence, sortedCandidates, pageAuth, basicSuccess);
  return {
    accessSuccessful: basicSuccess,
    classification,
    candidates: sortedCandidates,
    validation
  };
}

function classifyDiagnosis(
  evidence: NavigationEvidence,
  candidates: StateDiagnosisCandidate[],
  pageAuth: boolean,
  accessSuccessful: boolean
): StateDiagnosisClassification {
  if (accessSuccessful) return "access_ok";
  if (candidates.some((candidate) => candidate.evidence.includes("top-level redirect"))) {
    return "auth_redirect";
  }
  if (pageAuth || candidates.some((candidate) =>
    candidate.evidence.includes("final page matched login signals")
  )) {
    return evidence.finalHttpStatus === 404 ? "auth_related_not_found" : "login_page";
  }
  if (candidates.some((candidate) =>
    candidate.evidence.includes("authentication iframe")
    || candidate.evidence.includes("login form action")
  )) {
    return "auth_iframe_or_form";
  }
  if (candidates.some((candidate) => candidate.confidence === "medium")) {
    return "auth_response";
  }
  if (candidates.some((candidate) => candidate.confidence === "low")) {
    return "auth_related_not_found";
  }
  if (evidence.finalHttpStatus === 404) return "not_auth_related";
  if (evidence.navigationResult.exitCode !== 0) return "navigation_failed";
  return "inconclusive";
}

function createInitialFailure(
  evidence: NavigationEvidence,
  classification: StateDiagnosisClassification,
  hasExpectation: boolean
): StateDiagnosisResult["initialFailure"] {
  const finalOrigin = safeOrigin(evidence.finalUrl);
  if (classification === "auth_redirect") {
    return {
      kind: "redirect",
      ...(evidence.redirects[0]?.status === undefined
        ? {}
        : { httpStatus: evidence.redirects[0].status }),
      ...(finalOrigin === undefined ? {} : { finalOrigin })
    };
  }
  if (evidence.navigationResult.exitCode !== 0) {
    return {
      kind: "navigation",
      ...(evidence.finalHttpStatus === undefined ? {} : { httpStatus: evidence.finalHttpStatus }),
      ...(finalOrigin === undefined ? {} : { finalOrigin }),
      navigationFailure: evidence.navigationFailure ?? "navigation"
    };
  }
  if (evidence.finalHttpStatus !== undefined && evidence.finalHttpStatus >= 400) {
    return {
      kind: "http_status",
      httpStatus: evidence.finalHttpStatus,
      ...(finalOrigin === undefined ? {} : { finalOrigin })
    };
  }
  const authResponseStatus = classification === "auth_response"
    ? evidence.harEntries.find((entry) => entry.status === 401 || entry.status === 403)?.status
    : undefined;
  if (authResponseStatus !== undefined) {
    return {
      kind: "http_status",
      httpStatus: authResponseStatus,
      ...(finalOrigin === undefined ? {} : { finalOrigin })
    };
  }
  if (classification === "login_page" || classification === "auth_iframe_or_form") {
    return {
      kind: "page",
      ...(finalOrigin === undefined ? {} : { finalOrigin })
    };
  }
  return {
    kind: hasExpectation ? "expectation" : "unknown",
    ...(finalOrigin === undefined ? {} : { finalOrigin })
  };
}

function createNavigationSummary(evidence: NavigationEvidence): {
  finalOrigin?: string;
  summary: StateDiagnosisResult["navigation"];
} {
  const finalOrigin = safeOrigin(evidence.finalUrl);
  return {
    ...(finalOrigin === undefined ? {} : { finalOrigin }),
    summary: {
      succeeded: evidence.navigationResult.exitCode === 0,
      ...(evidence.finalUrl === undefined ? {} : { finalUrl: evidence.finalUrl }),
      ...(evidence.finalHttpStatus === undefined
        ? {}
        : { finalHttpStatus: evidence.finalHttpStatus }),
      topLevelRedirects: evidence.redirects.map((redirect) => ({
        status: redirect.status,
        from: redirect.from,
        to: redirect.to
      }))
    }
  };
}

async function readPageFacts(
  browserRunner: BrowserRunner,
  runOptions: BrowserRunOptions,
  expectText?: string
): Promise<PageFacts> {
  const result = await runBrowserSafely(
    browserRunner,
    ["eval", createPageFactsScript(expectText), "--json"],
    runOptions
  );
  if (result.exitCode === 0) {
    const parsed = parseJsonObject(result.stdout);
    if (parsed !== undefined) return normalizePageFacts(parsed);
  }

  const urlResult = await runBrowserSafely(
    browserRunner,
    ["get", "url", "--json"],
    runOptions
  );
  const parsedUrl = parseBrowserUrl(urlResult.stdout);
  return {
    ...emptyPageFacts(),
    ...(parsedUrl === undefined ? {} : { url: parsedUrl })
  };
}

function createPageFactsScript(expectText?: string): string {
  return [
    "(() => {",
    "  const authPattern = /(sign\\s*in|log\\s*in|login|authentication required|unauthorized|forbidden|access denied|permission denied|session expired)/i;",
    "  const bodyText = String(document.body?.innerText ?? '').slice(0, 50000);",
    "  const title = String(document.title ?? '').slice(0, 2000);",
    "  const forms = Array.from(document.forms).slice(0, 20).map((form) => ({",
    "    action: form.action || location.href,",
    "    hasPassword: Boolean(form.querySelector('input[type=password]'))",
    "  }));",
    "  const iframes = Array.from(document.querySelectorAll('iframe[src]')).slice(0, 20)",
    "    .map((frame) => frame.src).filter(Boolean);",
    "  const metaRefreshUrls = Array.from(document.querySelectorAll('meta[http-equiv]')).slice(0, 20)",
    "    .filter((meta) => String(meta.httpEquiv).toLowerCase() === 'refresh')",
    "    .map((meta) => String(meta.content ?? '').match(/url\\s*=\\s*['\"]?([^'\";]+)/i)?.[1]?.trim())",
    "    .filter(Boolean);",
    "  return {",
    "    url: location.href,",
    "    authText: authPattern.test(`${title} ${bodyText}`),",
    "    passwordField: Boolean(document.querySelector('input[type=password]')),",
    "    forms,",
    "    iframes,",
    "    metaRefreshUrls,",
    ...(expectText === undefined
      ? []
      : [`    expectTextMatched: bodyText.includes(${JSON.stringify(expectText)}),`]),
    "  };",
    "})()"
  ].join("\n");
}

async function readHarEntries(path: string): Promise<HarEntry[]> {
  let input: string;
  try {
    await chmod(path, 0o600);
    input = await readFile(path, "utf8");
  } catch {
    return [];
  }
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return [];
  }
  if (!isRecord(value) || !isRecord(value.log) || !Array.isArray(value.log.entries)) {
    return [];
  }
  return value.log.entries.flatMap((entry): HarEntry[] => {
    if (!isRecord(entry) || !isRecord(entry.request) || typeof entry.request.url !== "string") {
      return [];
    }
    const response = isRecord(entry.response) ? entry.response : undefined;
    const headers = response === undefined ? [] : normalizeHarHeaders(response.headers);
    const locationHeader = headers.find((header) => header.name.toLowerCase() === "location")?.value;
    const redirectUrl = response !== undefined && typeof response.redirectURL === "string"
      ? response.redirectURL
      : undefined;
    const location = locationHeader ?? (redirectUrl || undefined);
    const resourceType = firstString(
      entry._resourceType,
      entry.resourceType,
      entry.type,
      isRecord(entry.request) ? entry.request._resourceType : undefined
    );
    return [{
      requestUrl: entry.request.url,
      ...(resourceType === undefined ? {} : { resourceType }),
      ...(response === undefined || typeof response.status !== "number"
        ? {}
        : { status: response.status }),
      ...(location === undefined ? {} : { location }),
      hasWwwAuthenticate: headers.some((header) =>
        header.name.toLowerCase() === "www-authenticate"
      )
    }];
  });
}

function traceTopLevelRedirects(startUrl: string, entries: HarEntry[]): TopLevelRedirect[] {
  const redirects: TopLevelRedirect[] = [];
  const visited = new Set<string>();
  let current = stripHash(startUrl);
  for (let index = 0; index < 20; index += 1) {
    if (visited.has(current)) break;
    visited.add(current);
    const entry = entries.find((candidate) =>
      stripHash(candidate.requestUrl) === current
      && candidate.status !== undefined
      && isRedirectStatus(candidate.status)
      && candidate.location !== undefined
    );
    if (entry?.status === undefined || entry.location === undefined) break;
    let next: string;
    try {
      next = new URL(entry.location, entry.requestUrl).href;
    } catch {
      break;
    }
    const from = sanitizeStateDiagnosisUrl(entry.requestUrl);
    const to = sanitizeStateDiagnosisUrl(next);
    if (from === undefined || to === undefined) break;
    redirects.push({
      status: entry.status,
      fromRaw: entry.requestUrl,
      toRaw: next,
      from,
      to
    });
    current = stripHash(next);
  }
  return redirects;
}

function findFinalDocumentStatus(finalUrl: string | undefined, entries: HarEntry[]): number | undefined {
  if (finalUrl === undefined) return undefined;
  return [...entries].reverse().find((entry) =>
    (entry.resourceType === undefined || entry.resourceType.toLowerCase() === "document")
    && stripHash(entry.requestUrl) === stripHash(finalUrl)
  )?.status;
}

function inferLastTopLevelStatus(
  redirects: TopLevelRedirect[],
  entries: HarEntry[]
): number | undefined {
  const target = redirects.at(-1)?.toRaw;
  if (target === undefined) return undefined;
  return [...entries].reverse().find((entry) =>
    entry.resourceType?.toLowerCase() === "document"
    && stripHash(entry.requestUrl) === stripHash(target)
  )?.status ?? redirects.at(-1)?.status;
}

function inferLastDocumentUrl(entries: HarEntry[]): string | undefined {
  return [...entries].reverse().find((entry) =>
    entry.resourceType?.toLowerCase() === "document"
  )?.requestUrl;
}

function normalizeHarHeaders(value: unknown): Array<{ name: string; value: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((header) =>
    isRecord(header) && typeof header.name === "string" && typeof header.value === "string"
      ? [{ name: header.name, value: header.value }]
      : []
  );
}

function normalizePageFacts(value: Record<string, unknown>): PageFacts {
  return {
    ...(typeof value.url === "string" ? { url: value.url } : {}),
    authText: value.authText === true,
    passwordField: value.passwordField === true,
    forms: Array.isArray(value.forms)
      ? value.forms.flatMap((form) =>
        isRecord(form) && typeof form.action === "string"
          ? [{ action: form.action, hasPassword: form.hasPassword === true }]
          : []
      ).slice(0, 20)
      : [],
    iframes: Array.isArray(value.iframes)
      ? value.iframes.filter((item): item is string => typeof item === "string").slice(0, 20)
      : [],
    metaRefreshUrls: Array.isArray(value.metaRefreshUrls)
      ? value.metaRefreshUrls.filter((item): item is string => typeof item === "string").slice(0, 20)
      : [],
    ...(typeof value.expectTextMatched === "boolean"
      ? { expectTextMatched: value.expectTextMatched }
      : {})
  };
}

function emptyPageFacts(): PageFacts {
  return {
    authText: false,
    passwordField: false,
    forms: [],
    iframes: [],
    metaRefreshUrls: []
  };
}

async function runBrowserSafely(
  browserRunner: BrowserRunner,
  args: string[],
  options: BrowserRunOptions
): Promise<BrowserRunResult> {
  try {
    return await browserRunner.run(args, options);
  } catch {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "browser command failed"
    };
  }
}

function classifyNavigationFailure(result: BrowserRunResult): NavigationFailureKind {
  const message = `${result.stderr}\n${result.stdout}`.toLowerCase();
  if (/timeout|timed out/.test(message)) return "timeout";
  if (/name_not_resolved|dns|enotfound/.test(message)) return "dns";
  if (/certificate|cert_|ssl/.test(message)) return "certificate";
  if (/connection|refused|reset|aborted|disconnected/.test(message)) return "connection";
  return "navigation";
}

function createBoundedCombinations(urls: string[], maxAttempts: number): string[][] {
  const result: string[][] = [];
  const visit = (start: number, size: number, current: string[]): void => {
    if (result.length >= maxAttempts) return;
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let index = start; index < urls.length && result.length < maxAttempts; index += 1) {
      const url = urls[index];
      if (url === undefined) continue;
      current.push(url);
      visit(index + 1, size, current);
      current.pop();
    }
  };
  for (let size = 1; size <= urls.length && result.length < maxAttempts; size += 1) {
    visit(0, size, []);
  }
  return result;
}

function matchesUrlGlob(url: string | undefined, glob: string): boolean {
  if (url === undefined) return false;
  const expression = glob
    .split(/(\*\*|\*|\?)/)
    .map((part) => {
      if (part === "**" || part === "*") return ".*";
      if (part === "?") return ".";
      return part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    })
    .join("");
  try {
    return new RegExp(`^${expression}$`).test(url);
  } catch {
    return false;
  }
}

function parseJsonObject(input: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(input.trim());
    if (isRecord(value)) return value;
  } catch {
    return undefined;
  }
  return undefined;
}

function parseBrowserUrl(input: string): string | undefined {
  const value = parseJsonObject(input);
  if (value !== undefined && typeof value.url === "string") return value.url;
  try {
    const parsed = JSON.parse(input.trim());
    return typeof parsed === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function normalizeDiagnosisInputUrl(input: string): URL {
  const value = requireValue(input, "URL", "STATE_DIAGNOSE_URL_REQUIRED");
  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)
    ? value
    : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw invalidDiagnosisUrl();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw invalidDiagnosisUrl();
  }
  return url;
}

function invalidDiagnosisUrl(): Error {
  return createError({
    code: "STATE_DIAGNOSE_URL_INVALID",
    kind: "validation",
    message: "Invalid state diagnosis URL.",
    hint: "Pass the same http or https URL that failed with `divebell open`."
  });
}

function requireValue(input: string | undefined, option: string, code: string): string {
  const value = input?.trim();
  if (value !== undefined && value.length > 0 && value !== "true") return value;
  throw createError({
    code,
    kind: "validation",
    message: `state diagnose requires ${option}.`,
    hint: "First run `divebell open <url> --state <path>`; diagnose only after authentication or permission verification fails."
  });
}

function optionalValue(input: string | undefined, option: string): string | undefined {
  const value = input?.trim();
  if (value === undefined || value.length === 0 || value === "true") {
    if (input === undefined) return undefined;
    throw createError({
      code: "STATE_DIAGNOSE_OPTION_VALUE_REQUIRED",
      kind: "validation",
      message: `${option} requires a value.`
    });
  }
  return value;
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000) {
    throw createError({
      code: "STATE_DIAGNOSE_TIMEOUT_INVALID",
      kind: "validation",
      message: "--timeout must be an integer between 1 and 120000 milliseconds."
    });
  }
  return timeoutMs;
}

function normalizeCandidateLimit(limit: number): number {
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 20) : DEFAULT_MAX_CANDIDATES;
}

function normalizeAttemptLimit(limit: number): number {
  return Number.isInteger(limit) && limit > 0
    ? Math.min(limit, 32)
    : DEFAULT_MAX_VERIFICATION_ATTEMPTS;
}

function isAuthUrl(input: string, classifier: StateDiagnosisClassifier): boolean {
  try {
    return classifier.isAuthUrl(new URL(input));
  } catch {
    return false;
  }
}

function isStaticResource(url: URL): boolean {
  return /\.(?:css|js|mjs|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|mp4|webm|mp3|wav)(?:$|\/)/i
    .test(url.pathname);
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function sameSanitizedUrl(left: string, right: string | undefined): boolean {
  return right !== undefined
    && sanitizeStateDiagnosisUrl(left) === sanitizeStateDiagnosisUrl(right);
}

function sameRawNavigationUrl(left: string, right: string): boolean {
  return stripHash(left) === stripHash(right);
}

function stripHash(input: string): string {
  try {
    const url = new URL(input);
    url.hash = "";
    return url.href;
  } catch {
    return input.split("#", 1)[0] ?? input;
  }
}

function safeOrigin(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  try {
    return new URL(input).origin;
  } catch {
    return undefined;
  }
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
