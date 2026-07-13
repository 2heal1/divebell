import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { applyStoredAuthState, persistAuthStateOnClose } from "./profile.js";

const profileDirectory = process.env.OPENRUNTIME_NEXT_BROWSER_PROFILE_DIR;
const OPENRUNTIME_RECORDING_CONTROL_FILE = "recording-session.json";

interface RecordingSession {
  marker: string;
  eventsFile: string;
  audio?: AudioRecordingSession;
}

interface AudioRecordingSession {
  marker: string;
  audioFile: string;
  chunksFile: string;
  eventsFile: string;
  chunksDirectory: string;
  recorderUrl: string;
  startedAt: string;
  chunkMs: number;
}

if (profileDirectory !== undefined && profileDirectory.length > 0) {
  const originalExistsSync = fs.existsSync.bind(fs);
  const originalLstatSync = fs.lstatSync.bind(fs);
  const originalMkdirSync = fs.mkdirSync.bind(fs);
  const originalSymlinkSync = fs.symlinkSync.bind(fs);
  const resolvedProfileDirectory = resolve(profileDirectory);

  fs.mkdirSync = ((path, options) => {
    if (!isNextBrowserProfilePath(path)) {
      return originalMkdirSync(path, options);
    }

    originalMkdirSync(dirname(path), {
      recursive: true,
      mode: 0o700
    });
    originalMkdirSync(resolvedProfileDirectory, {
      recursive: true,
      mode: 0o700
    });

    try {
      if (originalLstatSync(path).isSymbolicLink()) {
        return undefined;
      }
    } catch {
      // The temporary profile path does not exist yet, so it can be linked below.
    }

    if (originalExistsSync(path)) {
      return originalMkdirSync(path, options);
    }

    originalSymlinkSync(resolvedProfileDirectory, path, "dir");
    return undefined;
  }) as typeof fs.mkdirSync;

  patchPersistentContext(resolvedProfileDirectory);
  syncBuiltinESMExports();
}

function isNextBrowserProfilePath(path: fs.PathLike): path is string {
  return typeof path === "string" && basename(path).startsWith("next-browser-profile-");
}

function patchPersistentContext(resolvedProfileDirectory: string): void {
  const originalLaunchPersistentContext = chromium.launchPersistentContext.bind(chromium);
  chromium.launchPersistentContext = (async (...args: Parameters<typeof chromium.launchPersistentContext>) => {
    const context = await originalLaunchPersistentContext(...args);
    await applyStoredProfileState(context, resolvedProfileDirectory);
    attachOpenRuntimeRecording(context, resolvedProfileDirectory);
    return persistAuthStateOnClose(context, resolvedProfileDirectory);
  }) as typeof chromium.launchPersistentContext;
}

async function applyStoredProfileState(context: BrowserContext, resolvedProfileDirectory: string): Promise<void> {
  try {
    await applyStoredAuthState(context, resolvedProfileDirectory);
  } catch (error) {
    process.stderr.write(`OpenRuntime profile state could not be applied: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

function attachOpenRuntimeRecording(context: BrowserContext, resolvedProfileDirectory: string): void {
  const session = readRecordingSession(resolvedProfileDirectory);
  if (session === undefined) return;

  const attachedPages = new WeakSet<Page>();
  let audioRecorderStarted = false;
  let audioRecorderStarting = false;
  const attachPage = (page: Page): void => {
    if (attachedPages.has(page)) return;
    attachedPages.add(page);
    page.on("console", (message) => {
      persistRecordingConsoleMessage(session, message.text());
    });
    if (session.audio !== undefined) {
      scheduleAudioRecorderPage(context, session.audio, page, () => audioRecorderStarted || audioRecorderStarting, (value) => {
        audioRecorderStarting = value;
        if (!value) audioRecorderStarted = true;
      });
    }
  };

  for (const page of context.pages()) {
    attachPage(page);
  }
  context.on("page", attachPage);
}

function persistRecordingConsoleMessage(session: RecordingSession, text: string): void {
  if (session.audio !== undefined && persistAudioConsoleMessage(session.audio, text)) return;

  const markerIndex = text.indexOf(session.marker);
  if (markerIndex < 0) return;
  const payload = text.slice(markerIndex + session.marker.length).trim();
  if (payload.length === 0) return;
  try {
    fs.appendFileSync(session.eventsFile, `${payload}\n`, "utf8");
  } catch (error) {
    process.stderr.write(`OpenRuntime recording event could not be persisted: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

function persistAudioConsoleMessage(audio: AudioRecordingSession, text: string): boolean {
  const markerIndex = text.indexOf(audio.marker);
  if (markerIndex < 0) return false;
  const payload = text.slice(markerIndex + audio.marker.length).trim();
  if (payload.length === 0) return true;
  try {
    const parsed = JSON.parse(payload) as {
      type?: unknown;
      index?: unknown;
      startMs?: unknown;
      endMs?: unknown;
      mimeType?: unknown;
      data?: unknown;
      message?: unknown;
    };
    if (parsed.type !== "audio-chunk") {
      appendJsonLineSync(audio.eventsFile, parsed);
      return true;
    }

    if (typeof parsed.index !== "number" || typeof parsed.data !== "string") {
      appendJsonLineSync(audio.eventsFile, {
        type: "audio-error",
        message: "Invalid audio chunk payload."
      });
      return true;
    }

    const chunkName = `chunk-${String(parsed.index).padStart(6, "0")}.webm`;
    const chunkPath = join(audio.chunksDirectory, chunkName);
    const buffer = Buffer.from(parsed.data, "base64");
    fs.writeFileSync(chunkPath, buffer);
    fs.appendFileSync(audio.audioFile, buffer);
    const startMs = typeof parsed.startMs === "number" ? parsed.startMs : 0;
    const endMs = typeof parsed.endMs === "number" ? parsed.endMs : startMs;
    appendJsonLineSync(audio.chunksFile, {
      index: parsed.index,
      startedAt: createTimestamp(audio.startedAt, startMs),
      endedAt: createTimestamp(audio.startedAt, endMs),
      startMs,
      endMs,
      durationMs: Math.max(0, endMs - startMs),
      file: `audio-chunks/${chunkName}`,
      mimeType: typeof parsed.mimeType === "string" ? parsed.mimeType : "audio/webm",
      size: buffer.byteLength
    });
  } catch (error) {
    process.stderr.write(`OpenRuntime audio recording event could not be persisted: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  return true;
}

function scheduleAudioRecorderPage(
  context: BrowserContext,
  audio: AudioRecordingSession,
  page: Page,
  isStartedOrStarting: () => boolean,
  setStarting: (value: boolean) => void
): void {
  if (isStartedOrStarting()) return;
  setTimeout(() => {
    if (isStartedOrStarting()) return;
    setStarting(true);
    startAudioRecorderPage(context, audio, page)
      .catch((error) => {
        appendJsonLineSync(audio.eventsFile, {
          type: "audio-error",
          timeMs: Math.max(0, Date.now() - Date.parse(audio.startedAt)),
          message: error instanceof Error ? error.message : String(error)
        });
      })
      .finally(() => {
        setStarting(false);
      });
  }, 750);
}

async function startAudioRecorderPage(context: BrowserContext, audio: AudioRecordingSession, foregroundPage: Page): Promise<void> {
  const recorderOrigin = new URL(audio.recorderUrl).origin;
  await context.route(`${recorderOrigin}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: createAudioRecorderHtml(audio)
    });
  });
  await context.grantPermissions(["microphone"], {
    origin: recorderOrigin
  }).catch(() => undefined);
  const recorderPage = await context.newPage();
  await recorderPage.goto(audio.recorderUrl, {
    waitUntil: "domcontentloaded"
  });
  await foregroundPage.bringToFront().catch(() => undefined);
}

function createAudioRecorderHtml(audio: AudioRecordingSession): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>OpenRuntime Audio Recorder</title>
</head>
<body>
  <script>
    (() => {
      const marker = ${JSON.stringify(audio.marker)};
      const startedAt = Date.parse(${JSON.stringify(audio.startedAt)});
      const chunkMs = ${JSON.stringify(audio.chunkMs)};
      let chunkIndex = 0;
      let nextChunkStartMs = Math.max(0, Date.now() - startedAt);
      const emit = (payload) => {
        console.info(marker + JSON.stringify({
          timeMs: Math.max(0, Date.now() - startedAt),
          ...payload
        }));
      };
      const blobToBase64 = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const value = String(reader.result || "");
          resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
        };
        reader.onerror = () => reject(reader.error || new Error("Could not read audio chunk."));
        reader.readAsDataURL(blob);
      });
      const pickMimeType = () => {
        const candidates = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
          "audio/ogg"
        ];
        return candidates.find((value) => MediaRecorder.isTypeSupported(value)) || "";
      };
      const startSpeechRecognition = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
          emit({ type: "speech-unavailable", message: "SpeechRecognition is not available." });
          return;
        }
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = false;
          recognition.lang = navigator.language || "zh-CN";
          let lastResultEndMs = Math.max(0, Date.now() - startedAt);
          recognition.onstart = () => emit({ type: "speech-started", lang: recognition.lang });
          recognition.onerror = (event) => emit({ type: "speech-error", message: String(event.error || event) });
          recognition.onend = () => {
            emit({ type: "speech-ended" });
            setTimeout(() => {
              try {
                recognition.start();
              } catch {
                // Browser speech recognition may reject immediate restart.
              }
            }, 500);
          };
          recognition.onresult = (event) => {
            for (let index = event.resultIndex; index < event.results.length; index += 1) {
              const result = event.results[index];
              if (!result || !result.isFinal) continue;
              const alternative = result[0];
              const text = String(alternative?.transcript || "").trim();
              if (!text) continue;
              const endMs = Math.max(0, Date.now() - startedAt);
              const startMs = lastResultEndMs;
              lastResultEndMs = endMs;
              emit({
                type: "speech-result",
                startMs,
                endMs,
                text,
                confidence: typeof alternative?.confidence === "number" ? alternative.confidence : undefined
              });
            }
          };
          recognition.start();
        } catch (error) {
          emit({ type: "speech-error", message: String(error) });
        }
      };
      const start = async () => {
        try {
          if (!navigator.mediaDevices?.getUserMedia) {
            emit({ type: "audio-error", message: "getUserMedia is not available." });
            return;
          }
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mimeType = pickMimeType();
          const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
          recorder.onstart = () => emit({ type: "audio-started", mimeType: recorder.mimeType || mimeType || "audio/webm" });
          recorder.onerror = (event) => emit({ type: "audio-error", message: String(event.error || event) });
          recorder.onstop = () => {
            emit({ type: "audio-stopped" });
            for (const track of stream.getTracks()) track.stop();
          };
          recorder.ondataavailable = async (event) => {
            if (!event.data || event.data.size === 0) return;
            const endMs = Math.max(0, Date.now() - startedAt);
            const startMs = nextChunkStartMs;
            nextChunkStartMs = endMs;
            try {
              emit({
                type: "audio-chunk",
                index: chunkIndex++,
                startMs,
                endMs,
                mimeType: recorder.mimeType || mimeType || event.data.type || "audio/webm",
                data: await blobToBase64(event.data)
              });
            } catch (error) {
              emit({ type: "audio-error", message: String(error) });
            }
          };
          window.__OPENRUNTIME_AUDIO_RECORDER_STOP__ = () => {
            if (recorder.state !== "inactive") recorder.stop();
          };
          recorder.start(chunkMs);
          startSpeechRecognition();
          emit({ type: "audio-ready" });
        } catch (error) {
          emit({ type: "audio-error", message: String(error) });
        }
      };
      start();
    })();
  </script>
</body>
</html>`;
}

function createTimestamp(startedAt: string, offsetMs: number): string {
  const timestamp = Date.parse(startedAt);
  if (!Number.isFinite(timestamp)) return new Date().toISOString();
  return new Date(timestamp + offsetMs).toISOString();
}

function appendJsonLineSync(path: string, value: unknown): void {
  fs.appendFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
}

function readRecordingSession(resolvedProfileDirectory: string): RecordingSession | undefined {
  const controlFile = join(resolvedProfileDirectory, OPENRUNTIME_RECORDING_CONTROL_FILE);
  try {
    const parsed = JSON.parse(fs.readFileSync(controlFile, "utf8")) as {
      marker?: unknown;
      eventsFile?: unknown;
      audio?: unknown;
    };
    if (typeof parsed.marker !== "string" || parsed.marker.length === 0) return undefined;
    if (typeof parsed.eventsFile !== "string" || parsed.eventsFile.length === 0) return undefined;
    fs.mkdirSync(dirname(parsed.eventsFile), { recursive: true });
    return {
      marker: parsed.marker,
      eventsFile: parsed.eventsFile,
      ...createOptionalAudioRecordingSession(parsed.audio)
    };
  } catch {
    return undefined;
  }
}

function createOptionalAudioRecordingSession(value: unknown): Pick<RecordingSession, "audio"> | Record<string, never> {
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const marker = record.marker;
  const audioFile = record.audioFile;
  const chunksFile = record.chunksFile;
  const eventsFile = record.eventsFile;
  const chunksDirectory = record.chunksDirectory;
  const recorderUrl = record.recorderUrl;
  const startedAt = record.startedAt;
  const chunkMs = record.chunkMs;
  if (
    typeof marker !== "string" ||
    typeof audioFile !== "string" ||
    typeof chunksFile !== "string" ||
    typeof eventsFile !== "string" ||
    typeof chunksDirectory !== "string" ||
    typeof recorderUrl !== "string" ||
    typeof startedAt !== "string" ||
    typeof chunkMs !== "number"
  ) {
    return {};
  }
  fs.mkdirSync(dirname(audioFile), { recursive: true });
  fs.mkdirSync(dirname(chunksFile), { recursive: true });
  fs.mkdirSync(dirname(eventsFile), { recursive: true });
  fs.mkdirSync(chunksDirectory, { recursive: true });
  return {
    audio: {
      marker,
      audioFile,
      chunksFile,
      eventsFile,
      chunksDirectory,
      recorderUrl,
      startedAt,
      chunkMs
    }
  };
}
