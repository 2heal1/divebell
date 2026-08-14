import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { createError } from "../../utils/output.js";
import { bindBrowserRunOptions, type BrowserRunOptions, type BrowserRunResult, type BrowserRunner } from "./runner.js";
import {
  saveUrlScopedBrowserState,
  type UrlScopedStateSaveResult
} from "./state.js";

export type StateInferenceConfidence = "high" | "medium" | "low";

export type StateInferenceClassification =
  | "access_ok"
  | "auth_redirect"
  | "login_page"
  | "auth_iframe_or_form"
  | "auth_response"
  | "auth_related_not_found"
  | "not_auth_related"
  | "navigation_failed"
  | "inconclusive";

export interface StateInferenceCandidate {
  url: string;
  confidence: StateInferenceConfidence;
  evidence: string[];
  sourceStateAvailable?: boolean;
  sourceState?: {
    cookies: number;
    origins: number;
  };
  verified?: boolean;
}

interface StateInferenceEvidence {
  classification: StateInferenceClassification;
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
  candidates: StateInferenceCandidate[];
  verification: {
    attempted: number;
    minimalIncludeUrls: string[];
  };
}

export interface StateInferenceResult extends UrlScopedStateSaveResult {
  inference: StateInferenceEvidence;
}

export interface StateInferenceClassifier {
  isAuthUrl(url: URL): boolean;
  isIrrelevantUrl(url: URL): boolean;
}

export interface InferBrowserStateOptions {
  url: string;
  statePath: string;
  sourceProfile: string;
  outputPath?: string;
  expectUrl?: string;
  expectText?: string;
  timeoutMs?: number;
  classifier?: StateInferenceClassifier;
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
  confidence: StateInferenceConfidence;
  evidence: Set<string>;
}

interface AnalysisResult {
  accessSuccessful: boolean;
  classification: StateInferenceClassification;
  candidates: StateInferenceCandidate[];
  validation: StateInferenceEvidence["validation"];
}

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_CANDIDATES = 6;
const DEFAULT_MAX_VERIFICATION_ATTEMPTS = 8;
const CONFIDENCE_SCORE: Record<StateInferenceConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1
};

const DEFAULT_CLASSIFIER: StateInferenceClassifier = {
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
 * Uses an explicitly selected, working source Profile to infer the smallest
 * URL-scoped state that can replace a failing state file. The supplied state
 * is never modified, and all browser work happens in isolated sessions.
 */
export async function inferBrowserState(
  browserRunner: BrowserRunner,
  options: InferBrowserStateOptions
): Promise<StateInferenceResult> {
  const targetUrl = normalizeInferenceInputUrl(options.url);
  const statePath = resolve(requireValue(
    options.statePath,
    "--state",
    "STATE_INFER_STATE_REQUIRED"
  ));
  const sourceProfile = requireValue(
    options.sourceProfile,
    "--source-profile",
    "STATE_INFER_SOURCE_PROFILE_REQUIRED"
  );
  const outputPath = await resolveInferenceOutputPath(statePath, options.outputPath);
  const expectUrl = optionalValue(options.expectUrl, "--expect-url");
  const expectText = optionalValue(options.expectText, "--expect-text");
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const classifier = options.classifier ?? DEFAULT_CLASSIFIER;
  const artifactDirectory = await mkdtemp(join(tmpdir(), "divebell-state-infer-"));
  await chmod(artifactDirectory, 0o700);

  try {
    const initialEvidence = await captureNavigationEvidence(browserRunner, {
      artifactDirectory,
      label: "initial",
      statePath,
      targetUrl,
      timeoutMs,
      ...(expectText === undefined ? {} : { expectText })
    });
    if (initialEvidence.navigationFailure === "state_load") {
      throw createError({
        code: "STATE_INFER_STATE_LOAD_FAILED",
        kind: "browser",
        message: "Could not load the supplied state file.",
        hint: "Copy the exact deficient state JSON to the provider machine and pass its readable path with --state.",
        details: { path: statePath }
      });
    }
    const analysis = analyzeNavigationEvidence(initialEvidence, targetUrl, {
      classifier,
      ...(expectUrl === undefined ? {} : { expectUrl }),
      ...(expectText === undefined ? {} : { expectText }),
      maxCandidates: options.maxCandidates ?? DEFAULT_MAX_CANDIDATES
    });
    if (analysis.accessSuccessful) {
      throw createError({
        code: "STATE_INFER_INPUT_STATE_VALID",
        kind: "validation",
        message: "The supplied state already satisfies the requested access check.",
        hint: "Keep using the existing state file; no inferred replacement was created.",
        details: { path: statePath }
      });
    }

    if (analysis.candidates.length === 0) {
      throw createError({
        code: "STATE_INFER_NO_AUTH_SOURCES",
        kind: "browser",
        message: "Could not infer an authentication state source from the failed navigation.",
        hint: "Confirm that the failure is authentication-related and provide --expect-url or --expect-text when success is otherwise ambiguous.",
        details: {
          classification: analysis.classification,
          initialFailure: createInitialFailure(
            initialEvidence,
            analysis.classification,
            expectUrl !== undefined || expectText !== undefined
          )
        }
      });
    }

    const inferred = await inferFromSourceProfile(browserRunner, {
      artifactDirectory,
      candidates: analysis.candidates,
      sourceProfile,
      targetUrl,
      outputPath,
      timeoutMs,
      ...(expectUrl === undefined ? {} : { expectUrl }),
      ...(expectText === undefined ? {} : { expectText }),
      classifier,
      maxVerificationAttempts: options.maxVerificationAttempts
        ?? DEFAULT_MAX_VERIFICATION_ATTEMPTS
    });
    return {
      ...inferred.state,
      inference: {
        classification: analysis.classification,
        initialFailure: createInitialFailure(
          initialEvidence,
          analysis.classification,
          expectUrl !== undefined || expectText !== undefined
        ),
        navigation: createNavigationSummary(initialEvidence).summary,
        validation: analysis.validation,
        candidates: inferred.candidates,
        verification: {
          attempted: inferred.attempted,
          minimalIncludeUrls: inferred.minimalIncludeUrls
        }
      }
    };
  } finally {
    await rm(artifactDirectory, { recursive: true, force: true });
  }
}

export function sanitizeStateInferenceUrl(input: string, base?: string): string | undefined {
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
  const session = `divebell-state-infer-${randomUUID()}`;
  const runOptions: BrowserRunOptions = {
    session,
    disableRestore: true,
    ignoreConfiguredProfile: true,
    defaultTimeoutMs: options.timeoutMs,
    headless: true
  };
  try {
    const launch = await browserRunner.run(
      ["--state", options.statePath, "open", "--json"],
      runOptions
    );
    if (launch.exitCode !== 0) {
      return {
        navigationResult: launch,
        navigationFailure: "state_load",
        harEntries: [],
        page: emptyPageFacts(),
        redirects: []
      };
    }
    return await captureOpenSessionNavigationEvidence(browserRunner, runOptions, options);
  } finally {
    await runBrowserSafely(browserRunner, ["close", "--json"], runOptions);
  }
}

async function captureOpenSessionNavigationEvidence(
  browserRunner: BrowserRunner,
  runOptions: BrowserRunOptions,
  options: {
    artifactDirectory: string;
    label: string;
    targetUrl: URL;
    expectText?: string;
  }
): Promise<NavigationEvidence> {
  const harPath = join(options.artifactDirectory, `${options.label}.har`);
  const start = await browserRunner.run(
    ["network", "har", "start", "--content", "none", "--json"],
    runOptions
  );
  if (start.exitCode !== 0) {
    throw createError({
      code: "STATE_INFER_CAPTURE_FAILED",
      kind: "browser",
      message: "Could not start metadata-only navigation capture.",
      retryable: true
    });
  }

  let navigationResult: BrowserRunResult;
  let navigationFailure: NavigationFailureKind | undefined;
  let page = emptyPageFacts();
  try {
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
    await runBrowserSafely(
      browserRunner,
      ["network", "har", "stop", harPath, "--json"],
      runOptions
    );
  }

  const harEntries = await readHarEntries(harPath);
  const finalUrlRaw = page.url ?? inferLastDocumentUrl(harEntries);
  const redirects = traceTopLevelRedirects(options.targetUrl.href, harEntries);
  const finalHttpStatus = findFinalDocumentStatus(finalUrlRaw, harEntries)
    ?? inferLastTopLevelStatus(redirects, harEntries);
  const finalUrl = finalUrlRaw === undefined
    ? undefined
    : sanitizeStateInferenceUrl(finalUrlRaw);
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

async function inferFromSourceProfile(
  browserRunner: BrowserRunner,
  options: {
    artifactDirectory: string;
    candidates: StateInferenceCandidate[];
    sourceProfile: string;
    targetUrl: URL;
    outputPath: string;
    timeoutMs: number;
    expectUrl?: string;
    expectText?: string;
    classifier: StateInferenceClassifier;
    maxVerificationAttempts: number;
  }
): Promise<{
  state: UrlScopedStateSaveResult;
  candidates: StateInferenceCandidate[];
  attempted: number;
  minimalIncludeUrls: string[];
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
      code: "STATE_INFER_SOURCE_PROFILE_OPEN_FAILED",
      kind: "browser",
      message: "Could not open the explicitly selected source Profile.",
      retryable: true
    });
  }

  try {
    const sourceEvidence = await captureOpenSessionNavigationEvidence(
      browserRunner,
      sourceRunOptions,
      {
        artifactDirectory: options.artifactDirectory,
        label: "source-profile",
        targetUrl: options.targetUrl,
        ...(options.expectText === undefined ? {} : { expectText: options.expectText })
      }
    );
    const sourceAnalysis = analyzeNavigationEvidence(sourceEvidence, options.targetUrl, {
      classifier: options.classifier,
      ...(options.expectUrl === undefined ? {} : { expectUrl: options.expectUrl }),
      ...(options.expectText === undefined ? {} : { expectText: options.expectText }),
      maxCandidates: DEFAULT_MAX_CANDIDATES
    });
    if (!sourceAnalysis.accessSuccessful) {
      throw createError({
        code: "STATE_INFER_SOURCE_PROFILE_ACCESS_FAILED",
        kind: "browser",
        message: "The selected source Profile does not satisfy the requested access check.",
        hint: "Open the URL with the intended signed-in Profile and confirm --expect-url and --expect-text before inferring a replacement state.",
        details: {
          profile: options.sourceProfile,
          classification: sourceAnalysis.classification,
          validation: sourceAnalysis.validation
        }
      });
    }

    const candidates: StateInferenceCandidate[] = [];
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
    let successfulState: UrlScopedStateSaveResult | undefined;
    let successfulStatePath: string | undefined;
    let minimalIncludeUrls: string[] | undefined;
    for (const includeUrls of combinations) {
      const statePath = join(options.artifactDirectory, `verification-${attempted}.json`);
      const saved = await saveUrlScopedBrowserState(sourceRunner, {
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
        successfulState = saved;
        successfulStatePath = statePath;
        break;
      }
    }

    if (
      successfulState === undefined
      || successfulStatePath === undefined
      || minimalIncludeUrls === undefined
    ) {
      throw createError({
        code: "STATE_INFER_VERIFICATION_FAILED",
        kind: "browser",
        message: "No inferred state combination satisfied the requested access check.",
        hint: "Confirm that the source Profile can access the target and that the success expectations identify the intended page.",
        details: {
          attempted,
          candidates: candidates.map((candidate) => ({
            url: candidate.url,
            confidence: candidate.confidence,
            sourceStateAvailable: candidate.sourceStateAvailable
          }))
        }
      });
    }

    await mkdir(dirname(options.outputPath), { recursive: true, mode: 0o700 });
    try {
      await copyFile(successfulStatePath, options.outputPath, fsConstants.COPYFILE_EXCL);
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        throw outputExistsError(options.outputPath);
      }
      throw error;
    }
    await chmod(options.outputPath, 0o600);

    const verified = new Set(minimalIncludeUrls);
    return {
      state: {
        ...successfulState,
        path: options.outputPath
      },
      candidates: candidates.map((candidate) => ({
        ...candidate,
        verified: verified.has(candidate.url)
      })),
      attempted,
      minimalIncludeUrls
    };
  } finally {
    await runBrowserSafely(browserRunner, ["close", "--json"], sourceRunOptions);
  }
}

function analyzeNavigationEvidence(
  evidence: NavigationEvidence,
  targetUrl: URL,
  options: {
    classifier: StateInferenceClassifier;
    expectUrl?: string;
    expectText?: string;
    maxCandidates: number;
  }
): AnalysisResult {
  const validation: StateInferenceEvidence["validation"] = {
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
    confidence: StateInferenceConfidence,
    evidenceLabel: string,
    base?: string
  ): void => {
    const safeUrl = sanitizeStateInferenceUrl(rawUrl, base);
    if (safeUrl === undefined) return;
    let parsed: URL;
    try {
      parsed = new URL(safeUrl);
    } catch {
      return;
    }
    if (options.classifier.isIrrelevantUrl(parsed)) return;
    if (isStaticResource(parsed)) return;
    const safeTarget = sanitizeStateInferenceUrl(targetUrl.href);
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
        const requestOrigin = safeOrigin(sanitizeStateInferenceUrl(entry.requestUrl));
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
  const classification = classifyInference(evidence, sortedCandidates, pageAuth, basicSuccess);
  return {
    accessSuccessful: basicSuccess,
    classification,
    candidates: sortedCandidates,
    validation
  };
}

function classifyInference(
  evidence: NavigationEvidence,
  candidates: StateInferenceCandidate[],
  pageAuth: boolean,
  accessSuccessful: boolean
): StateInferenceClassification {
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
  classification: StateInferenceClassification,
  hasExpectation: boolean
): StateInferenceEvidence["initialFailure"] {
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
  summary: StateInferenceEvidence["navigation"];
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
    const from = sanitizeStateInferenceUrl(entry.requestUrl);
    const to = sanitizeStateInferenceUrl(next);
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
  const result: string[][] = [[]];
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

function normalizeInferenceInputUrl(input: string): URL {
  const value = requireValue(input, "URL", "STATE_INFER_URL_REQUIRED");
  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)
    ? value
    : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw invalidInferenceUrl();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw invalidInferenceUrl();
  }
  return url;
}

function invalidInferenceUrl(): Error {
  return createError({
    code: "STATE_INFER_URL_INVALID",
    kind: "validation",
    message: "Invalid state inference URL.",
    hint: "Pass the same http or https URL that failed with `divebell open`."
  });
}

function requireValue(input: string | undefined, option: string, code: string): string {
  const value = input?.trim();
  if (value !== undefined && value.length > 0 && value !== "true") return value;
  throw createError({
    code,
    kind: "validation",
    message: `state infer requires ${option}.`,
    hint: "First run `divebell open <url> --state <path>`; infer only after authentication or permission verification fails."
  });
}

function optionalValue(input: string | undefined, option: string): string | undefined {
  const value = input?.trim();
  if (value === undefined || value.length === 0 || value === "true") {
    if (input === undefined) return undefined;
    throw createError({
      code: "STATE_INFER_OPTION_VALUE_REQUIRED",
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
      code: "STATE_INFER_TIMEOUT_INVALID",
      kind: "validation",
      message: "--timeout must be an integer between 1 and 120000 milliseconds."
    });
  }
  return timeoutMs;
}

async function resolveInferenceOutputPath(
  statePath: string,
  requestedOutputPath: string | undefined
): Promise<string> {
  const requested = optionalValue(requestedOutputPath, "--output");
  if (requested !== undefined) {
    const outputPath = resolve(requested);
    if (outputPath === statePath) {
      throw createError({
        code: "STATE_INFER_OUTPUT_IS_INPUT",
        kind: "validation",
        message: "The inferred state output must be different from the supplied state path.",
        hint: "Omit --output to create a new sibling file automatically, or choose another path."
      });
    }
    if (await pathExists(outputPath)) throw outputExistsError(outputPath);
    return outputPath;
  }

  const parsed = parse(statePath);
  const stem = parsed.ext.toLowerCase() === ".json" ? parsed.name : parsed.base;
  for (let index = 1; index <= 10_000; index += 1) {
    const suffix = index === 1 ? ".inferred.json" : `.inferred-${index}.json`;
    const outputPath = join(parsed.dir, `${stem}${suffix}`);
    if (!await pathExists(outputPath)) return outputPath;
  }
  throw createError({
    code: "STATE_INFER_OUTPUT_UNAVAILABLE",
    kind: "internal",
    message: "Could not allocate a new inferred state path next to the supplied state."
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

function outputExistsError(path: string): Error {
  return createError({
    code: "STATE_INFER_OUTPUT_EXISTS",
    kind: "validation",
    message: "The inferred state output path already exists.",
    hint: "Choose a new --output path or omit --output to allocate one automatically.",
    details: { path }
  });
}

function normalizeCandidateLimit(limit: number): number {
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 20) : DEFAULT_MAX_CANDIDATES;
}

function normalizeAttemptLimit(limit: number): number {
  return Number.isInteger(limit) && limit > 0
    ? Math.min(limit, 32)
    : DEFAULT_MAX_VERIFICATION_ATTEMPTS;
}

function isAuthUrl(input: string, classifier: StateInferenceClassifier): boolean {
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
    && sanitizeStateInferenceUrl(left) === sanitizeStateInferenceUrl(right);
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

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error;
}
