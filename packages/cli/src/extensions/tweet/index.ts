import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getNumberOption } from "../../args.js";
import { parseBrowserJsonOutput } from "../../browser.js";
import type { CliExtensionRunOptions } from "../types.js";

const TIBO_HANDLE = "thsottiaux";
const TIBO_PROFILE_URL = `https://x.com/${TIBO_HANDLE}`;
const DEFAULT_HOURS = 3;
const DEFAULT_LIMIT = 3;
const DEFAULT_TIMEOUT = 15000;

interface TweetTimelineItem {
  url: string;
  statusId: string | null;
  datetime: string | null;
  text: string;
  author: string | null;
}

interface TweetDetailResult {
  url: string;
  statusId: string | null;
  datetime: string | null;
  text: string;
  author: string | null;
  rawText: string;
}

interface TweetTimelineResult {
  profile: {
    alias: "tibo";
    handle: string;
    url: string;
  };
  window: {
    hours: number;
    limit: number;
    since: string;
    capturedAt: string;
  };
  tweets: TweetTimelineItem[];
  warnings: string[];
}

interface TweetReadResult {
  profile: TweetTimelineResult["profile"];
  window: TweetTimelineResult["window"];
  tweets: Array<TweetTimelineItem & {
    detail: TweetDetailResult | null;
    detailError?: string;
  }>;
  warnings: string[];
}

export async function runTweetCommand(options: CliExtensionRunOptions): Promise<number> {
  const subcommand = options.args.command[1];
  const target = options.args.command[2];
  if (subcommand === "read" && target === "tibo") {
    return await runReadTibo(options);
  }

  throw new Error(`Unknown tweet command "${options.args.command.slice(1).join(" ")}".`);
}

async function runReadTibo({
  args,
  stdout,
  browserRunner
}: CliExtensionRunOptions): Promise<number> {
  const hours = getPositiveNumberOption(args, "hours", DEFAULT_HOURS);
  const limit = getPositiveIntegerOption(args, "limit", DEFAULT_LIMIT);
  const timeout = getPositiveNumberOption(args, "timeout", DEFAULT_TIMEOUT);

  await runBrowserOrThrow(browserRunner, ["open", TIBO_PROFILE_URL], "open Tibo profile");

  const timelineScript = await createScriptFile(createTimelineScript({
    hours,
    limit,
    profileUrl: TIBO_PROFILE_URL,
    handle: TIBO_HANDLE,
    timeout
  }));
  const detailScript = await createScriptFile(createDetailScript(timeout));

  try {
    const timeline = await runBrowserJson<TweetTimelineResult>(
      browserRunner,
      ["eval", "--file", timelineScript.path],
      "read Tibo timeline"
    );
    const result: TweetReadResult = {
      profile: timeline.profile,
      window: timeline.window,
      tweets: [],
      warnings: [...timeline.warnings]
    };

    for (const tweet of timeline.tweets.slice(0, limit)) {
      try {
        await runBrowserOrThrow(browserRunner, ["goto", tweet.url], `open tweet ${tweet.url}`);
        const detail = await runBrowserJson<TweetDetailResult>(
          browserRunner,
          ["eval", "--file", detailScript.path],
          `read tweet detail ${tweet.url}`
        );
        result.tweets.push({
          ...tweet,
          detail
        });
      } catch (error) {
        result.tweets.push({
          ...tweet,
          detail: null,
          detailError: error instanceof Error ? error.message : String(error)
        });
      }
    }

    writeJson(stdout, result);
    return 0;
  } finally {
    await Promise.all([
      timelineScript.cleanup(),
      detailScript.cleanup()
    ]);
  }
}

function getPositiveNumberOption(args: CliExtensionRunOptions["args"], name: string, fallback: number): number {
  const value = getNumberOption(args, name);
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`--${name} must be a positive number.`);
  }
  return value;
}

function getPositiveIntegerOption(args: CliExtensionRunOptions["args"], name: string, fallback: number): number {
  const value = getPositiveNumberOption(args, name, fallback);
  if (!Number.isInteger(value)) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return value;
}

async function runBrowserJson<T>(
  browserRunner: CliExtensionRunOptions["browserRunner"],
  browserArgs: string[],
  label: string
): Promise<T> {
  const result = await runBrowserOrThrow(browserRunner, browserArgs, label);
  return parseBrowserJsonOutput(result.stdout) as T;
}

async function runBrowserOrThrow(
  browserRunner: CliExtensionRunOptions["browserRunner"],
  browserArgs: string[],
  label: string
): Promise<{
  stdout: string;
  stderr: string;
}> {
  const result = await browserRunner.run(browserArgs);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `Failed to ${label}.`);
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}

async function createScriptFile(script: string): Promise<{
  path: string;
  cleanup(): Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "openruntime-tweet-"));
  const path = join(directory, "script.js");
  await writeFile(path, script, "utf8");
  return {
    path,
    cleanup: async () => {
      await rm(directory, {
        force: true,
        recursive: true
      });
    }
  };
}

function createTimelineScript(options: {
  hours: number;
  limit: number;
  profileUrl: string;
  handle: string;
  timeout: number;
}): string {
  return `(() => {
  const options = ${JSON.stringify(options)};
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalizeText = (value) => String(value ?? "").replace(/[ \\t\\r\\f\\v]+/g, " ").trim();
  const statusIdFromUrl = (url) => {
    const match = String(url).match(/\\/status\\/(\\d+)/);
    return match?.[1] ?? null;
  };
  const parseVisibleDateMs = (value) => {
    const text = normalizeText(value);
    const relative = text.match(/^(\\d+)\\s*([smhd])$/i);
    if (relative) {
      const amount = Number(relative[1]);
      const unit = relative[2].toLowerCase();
      const scale = unit === "s" ? 1000 : unit === "m" ? 60 * 1000 : unit === "h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      return Date.now() - amount * scale;
    }
    const zhDate = text.match(/(\\d{4})年(\\d{1,2})月(\\d{1,2})日/);
    if (zhDate) {
      return new Date(Number(zhDate[1]), Number(zhDate[2]) - 1, Number(zhDate[3])).getTime();
    }
    const englishDate = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{1,2},\\s+\\d{4}/i);
    if (englishDate) {
      const parsedEnglishDate = Date.parse(englishDate[0]);
      if (Number.isFinite(parsedEnglishDate)) return parsedEnglishDate;
    }
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const extractTweet = (article) => {
    const time = article.querySelector("time[datetime]");
    const timeAnchor = time?.closest("a[href*='/status/']");
    const href = timeAnchor?.getAttribute("href");
    if (!href) return null;
    const url = new URL(href, location.origin).toString();
    const datetime = time?.getAttribute("datetime") ?? null;
    const tweetText = Array.from(article.querySelectorAll("[data-testid='tweetText']"))
      .map((element) => normalizeText(element.textContent))
      .filter(Boolean)
      .join("\\n");
    return {
      url,
      statusId: statusIdFromUrl(url),
      datetime,
      text: tweetText,
      author: normalizeText(article.querySelector("[data-testid='User-Name']")?.textContent) || null
    };
  };
  const bodyLines = () => document.body.innerText
    .split("\\n")
    .map(normalizeText)
    .filter(Boolean);
  const findVisibleTweetText = (dateText, startIndex) => {
    const lines = bodyLines();
    let dateIndex = -1;
    for (let index = Math.max(startIndex, 0); index < lines.length; index += 1) {
      if (lines[index] === dateText) {
        dateIndex = index;
        break;
      }
    }
    if (dateIndex < 0) return { text: "", nextIndex: startIndex };
    const body = [];
    for (let index = dateIndex + 1; index < lines.length; index += 1) {
      const line = lines[index];
      const nextLine = lines[index + 1] ?? "";
      const afterNextLine = lines[index + 2] ?? "";
      if (line === "Tibo" && nextLine === "@thsottiaux" && parseVisibleDateMs(afterNextLine) !== null) break;
      if (["Posts", "Replies", "Media"].includes(line)) continue;
      body.push(line);
    }
    return {
      text: body.join("\\n").trim(),
      nextIndex: Math.max(dateIndex + 1, startIndex)
    };
  };
  const collectVisibleTweetLinks = (tweets, sinceMs) => {
    const links = Array.from(document.querySelectorAll("a[href*='/status/']"));
    const seen = new Set();
    let textSearchIndex = 0;
    for (const link of links) {
      const url = new URL(link.getAttribute("href") ?? "", location.origin).toString();
      if (!new RegExp("^/" + options.handle + "/status/\\\\d+$").test(new URL(url).pathname) || seen.has(url)) continue;
      seen.add(url);
      const dateText = normalizeText(link.textContent);
      const tweetMs = parseVisibleDateMs(dateText);
      if (tweetMs === null || (sinceMs !== null && tweetMs < sinceMs)) continue;
      const visibleText = findVisibleTweetText(dateText, textSearchIndex);
      textSearchIndex = visibleText.nextIndex;
      tweets.set(url, {
        url,
        statusId: statusIdFromUrl(url),
        datetime: new Date(tweetMs).toISOString(),
        text: visibleText.text,
        author: "Tibo @thsottiaux"
      });
    }
  };

  return (async () => {
    const deadline = Date.now() + options.timeout;
    const sinceMs = Date.now() - options.hours * 60 * 60 * 1000;
    const tweets = new Map();
    const warnings = [];
    let lastScrollHeight = 0;
    let stableScrolls = 0;

    while (Date.now() <= deadline && tweets.size < options.limit) {
      const articles = Array.from(document.querySelectorAll("article[data-testid='tweet']"));
      for (const article of articles) {
        const tweet = extractTweet(article);
        if (!tweet || !tweet.datetime) continue;
        const tweetMs = Date.parse(tweet.datetime);
        if (!Number.isFinite(tweetMs) || tweetMs < sinceMs) continue;
        tweets.set(tweet.url, tweet);
      }

      if (tweets.size >= options.limit) break;

      const nextScrollHeight = document.documentElement.scrollHeight;
      if (nextScrollHeight === lastScrollHeight) {
        stableScrolls += 1;
      } else {
        stableScrolls = 0;
        lastScrollHeight = nextScrollHeight;
      }
      if (articles.length > 0 && stableScrolls >= 3) break;

      window.scrollBy(0, Math.max(500, Math.floor(window.innerHeight * 0.8)));
      await sleep(700);
    }

    if (tweets.size === 0) {
      collectVisibleTweetLinks(tweets, sinceMs);
    }

    if (tweets.size === 0) {
      collectVisibleTweetLinks(tweets, null);
      if (tweets.size > 0) {
        warnings.push("No tweets in the requested time window were found on the rendered page; showing the latest rendered tweets instead.");
      }
    }

    if (tweets.size === 0) {
      warnings.push("No tweet links were found in the current page DOM. Login, rate limits, or X layout changes may be blocking extraction.");
    }

    return {
      profile: {
        alias: "tibo",
        handle: options.handle,
        url: options.profileUrl
      },
      window: {
        hours: options.hours,
        limit: options.limit,
        since: new Date(sinceMs).toISOString(),
        capturedAt: new Date().toISOString()
      },
      tweets: Array.from(tweets.values())
        .sort((left, right) => Date.parse(right.datetime ?? "") - Date.parse(left.datetime ?? ""))
        .slice(0, options.limit),
      warnings
    };
  })();
})()`;
}

function createDetailScript(timeout: number): string {
  return `(() => {
  const timeout = ${JSON.stringify(timeout)};
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalizeText = (value) => String(value ?? "").replace(/[ \\t\\r\\f\\v]+/g, " ").trim();
  const statusIdFromUrl = (url) => {
    const match = String(url).match(/\\/status\\/(\\d+)/);
    return match?.[1] ?? null;
  };
  const parseVisibleDateMs = (value) => {
    const text = normalizeText(value);
    const relative = text.match(/^(\\d+)\\s*([smhd])$/i);
    if (relative) {
      const amount = Number(relative[1]);
      const unit = relative[2].toLowerCase();
      const scale = unit === "s" ? 1000 : unit === "m" ? 60 * 1000 : unit === "h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      return Date.now() - amount * scale;
    }
    const zhDate = text.match(/(\\d{4})年(\\d{1,2})月(\\d{1,2})日/);
    if (zhDate) {
      return new Date(Number(zhDate[1]), Number(zhDate[2]) - 1, Number(zhDate[3])).getTime();
    }
    const englishDate = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{1,2},\\s+\\d{4}/i);
    if (englishDate) {
      const parsedEnglishDate = Date.parse(englishDate[0]);
      if (Number.isFinite(parsedEnglishDate)) return parsedEnglishDate;
    }
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const extractDetail = (article) => {
    const time = article.querySelector("time[datetime]");
    const text = Array.from(article.querySelectorAll("[data-testid='tweetText']"))
      .map((element) => normalizeText(element.textContent))
      .filter(Boolean)
      .join("\\n");
    return {
      url: location.href,
      statusId: statusIdFromUrl(location.href),
      datetime: time?.getAttribute("datetime") ?? null,
      text,
      author: normalizeText(article.querySelector("[data-testid='User-Name']")?.textContent) || null,
      rawText: normalizeText(article.innerText)
    };
  };
  const extractVisibleDetail = () => {
    const lines = document.body.innerText
      .split("\\n")
      .map(normalizeText)
      .filter(Boolean);
    const authorIndex = lines.findIndex((line, index) => line === "Tibo" && lines[index + 1] === "@thsottiaux");
    const dateIndex = lines.findIndex((line, index) => index > authorIndex && line.includes("·") && parseVisibleDateMs(line) !== null);
    const body = authorIndex < 0 || dateIndex < 0 ? [] : lines.slice(authorIndex + 2, dateIndex);
    const dateMs = dateIndex < 0 ? null : parseVisibleDateMs(lines[dateIndex]);
    return {
      url: location.href,
      statusId: statusIdFromUrl(location.href),
      datetime: dateMs === null ? null : new Date(dateMs).toISOString(),
      text: body.join("\\n").trim(),
      author: lines.includes("@thsottiaux") ? "Tibo @thsottiaux" : null,
      rawText: normalizeText(document.body.innerText)
    };
  };

  return (async () => {
    const deadline = Date.now() + timeout;
    while (Date.now() <= deadline) {
      const articles = Array.from(document.querySelectorAll("article[data-testid='tweet']"));
      const article = articles.find((candidate) => candidate.querySelector("[data-testid='tweetText']")) ?? articles[0];
      if (article) return extractDetail(article);
      if (document.body.innerText.includes("/ X") || document.querySelector("a[href*='/status/']")) {
        const detail = extractVisibleDetail();
        if (detail.text.length > 0 || detail.rawText.length > 0) return detail;
      }
      await sleep(300);
    }
    throw new Error("Tweet detail was not found in the current page DOM.");
  })();
})()`;
}

function writeJson(stdout: { write(chunk: string): void }, value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
