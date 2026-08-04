export const DIVEBELL_RECORDING_PAGE_PATH = "/__divebell/recorder";
export const DIVEBELL_RECORDING_START_PAGE_PATH = "/__divebell/recording-start";

export function createRecordingStartPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Divebell · Workflow recording</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; color: #172033; background: radial-gradient(circle at top, #f3f7ff 0, #f8fafc 42%, #eef2f7 100%); }
    main { width: min(620px, calc(100vw - 48px)); padding: 44px; border: 1px solid #dbe3ef; border-radius: 26px; background: rgba(255,255,255,.94); box-shadow: 0 22px 70px rgba(30, 52, 84, .12); }
    .badge { display: inline-flex; align-items: center; gap: 9px; padding: 8px 12px; border-radius: 999px; color: #166534; background: #f0fdf4; font-size: 14px; font-weight: 700; }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 5px rgba(34,197,94,.12); }
    h1 { margin: 26px 0 12px; font-size: clamp(30px, 5vw, 46px); line-height: 1.08; letter-spacing: -.035em; }
    p { margin: 0; max-width: 520px; color: #56647a; font-size: 17px; line-height: 1.7; }
    form { display: grid; grid-template-columns: 1fr auto; gap: 10px; margin-top: 26px; }
    label { grid-column: 1 / -1; color: #334155; font-size: 14px; font-weight: 700; }
    input { min-width: 0; padding: 13px 15px; border: 1px solid #cbd5e1; border-radius: 12px; color: #172033; background: #fff; font: 500 15px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; outline: none; }
    input:focus { border-color: #2563eb; box-shadow: 0 0 0 4px rgba(37,99,235,.12); }
    button { padding: 13px 18px; border: 0; border-radius: 12px; color: #fff; background: #2563eb; font-size: 15px; font-weight: 750; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .note { margin-top: 18px; padding: 13px 15px; border-radius: 13px; color: #475569; background: #f8fafc; font-size: 14px; line-height: 1.55; }
    .note strong { color: #334155; }
    .error { min-height: 20px; margin-top: 8px; color: #b42318; font-size: 13px; }
    @media (max-width: 520px) {
      main { padding: 30px 26px; }
      form { grid-template-columns: 1fr; }
      label { grid-column: auto; }
    }
  </style>
</head>
<body>
  <main id="divebell-recording-start">
    <div class="badge"><span class="dot"></span>Workflow tab · ready</div>
    <h1>Start the workflow<br>in this tab</h1>
    <p>Open the page you want to operate here. Divebell will record clicks, input, and navigation after the page loads.</p>
    <form id="divebell-recording-url-form" novalidate>
      <label for="divebell-recording-url">Page URL</label>
      <input id="divebell-recording-url" name="url" type="text" inputmode="url" autocomplete="url" placeholder="https://example.com" autofocus>
      <button type="submit">Open and record</button>
    </form>
    <div class="error" id="divebell-recording-url-error" role="alert" aria-live="polite"></div>
    <div class="note"><strong>Keep the “Divebell · Audio” tab open.</strong> It records microphone audio only; do not navigate or perform the workflow in that tab.</div>
  </main>
  <script>
    (() => {
      const form = document.getElementById("divebell-recording-url-form");
      const input = document.getElementById("divebell-recording-url");
      const error = document.getElementById("divebell-recording-url-error");
      form?.addEventListener("submit", (event) => {
        event.preventDefault();
        const raw = input instanceof HTMLInputElement ? input.value.trim() : "";
        const candidate = /^[a-z][a-z\\d+.-]*:\\/\\//iu.test(raw) ? raw : "https://" + raw;
        try {
          const url = new URL(candidate);
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new Error("unsupported protocol");
          }
          location.assign(url.href);
        } catch {
          if (error !== null) error.textContent = "Enter a complete http:// or https:// URL.";
        }
      });
    })();
  </script>
</body>
</html>`;
}

export function createRecordingCompanionPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Divebell · Audio (keep open)</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; color: #172033; background: radial-gradient(circle at top, #f3f7ff 0, #f8fafc 42%, #eef2f7 100%); }
    main { width: min(560px, calc(100vw - 48px)); padding: 40px; border: 1px solid #dbe3ef; border-radius: 24px; background: rgba(255,255,255,.94); box-shadow: 0 22px 70px rgba(30, 52, 84, .12); }
    .icon { width: 54px; height: 54px; display: grid; place-items: center; border-radius: 16px; color: #fff; background: #2563eb; font-size: 26px; }
    h1 { margin: 24px 0 10px; font-size: 28px; line-height: 1.2; letter-spacing: -.02em; }
    p { margin: 0; color: #56647a; font-size: 16px; line-height: 1.7; }
    .status { margin-top: 24px; padding: 14px 16px; border-radius: 14px; color: #1e40af; background: #eff6ff; font-weight: 650; }
    .status[data-state="recording"] { color: #166534; background: #f0fdf4; }
    .status[data-state="denied"], .status[data-state="error"] { color: #9a3412; background: #fff7ed; }
    @media (max-width: 520px) {
      main { padding: 30px 26px; }
    }
  </style>
</head>
<body>
  <main>
    <div class="icon" aria-hidden="true">●</div>
    <h1 id="recording-title">Audio helper tab</h1>
    <p id="recording-description">Allow microphone access, then keep this tab open in the background. Run the workflow only in the “Divebell · Workflow recording” tab.</p>
    <div class="status" id="recording-status" data-state="requesting" role="status" aria-live="polite">Requesting microphone access…</div>
  </main>
  <script>(${installRecordingCompanion.toString()})();</script>
</body>
</html>`;
}

function installRecordingCompanion(): void {
  type RecorderEvent = Record<string, unknown> & { type: string };
  type RecorderChunk = {
    blob: Blob;
    startMs: number;
    endMs: number;
    mimeType: string;
  };
  type RecorderState = {
    status: "requesting" | "recording" | "denied" | "error" | "stopped";
    mimeType: string;
    chunks: RecorderChunk[];
    events: RecorderEvent[];
    stop(): Promise<{
      status: RecorderState["status"];
      mimeType: string;
      chunkCount: number;
      chunks: Array<Omit<RecorderChunk, "blob"> & { size: number }>;
      events: RecorderEvent[];
    }>;
    readChunk(index: number): Promise<string>;
  };
  type SpeechRecognitionEventLike = Event & {
    resultIndex: number;
    results: ArrayLike<{
      isFinal: boolean;
      0?: {
        transcript?: string;
        confidence?: number;
      };
    }>;
  };
  type SpeechRecognitionLike = EventTarget & {
    continuous: boolean;
    interimResults: boolean;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: ((event: Event & { error?: string; message?: string }) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
  };
  type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

  const recorderGlobal = globalThis as typeof globalThis & {
    __DIVEBELL_AUDIO_RECORDER__?: RecorderState;
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  const query = new URL(location.href).searchParams;
  const recordingStartedAt = Date.parse(query.get("startedAt") ?? "") || Date.now();
  const chunkMs = Math.max(250, Number(query.get("chunkMs")) || 1000);
  const title = document.getElementById("recording-title");
  const description = document.getElementById("recording-description");
  const statusElement = document.getElementById("recording-status");
  const chunks: RecorderChunk[] = [];
  const events: RecorderEvent[] = [];
  let mediaRecorder: MediaRecorder | undefined;
  let stream: MediaStream | undefined;
  let speechRecognition: SpeechRecognitionLike | undefined;
  let stopPromise: Promise<void> | undefined;
  let stopRequested = false;
  let chunkStartedAt = Date.now();

  const state: RecorderState = {
    status: "requesting",
    mimeType: "",
    chunks,
    events,
    stop: async () => {
      if (stopPromise === undefined) {
        stopPromise = stopRecording();
      }
      await stopPromise;
      return {
        status: state.status,
        mimeType: state.mimeType,
        chunkCount: chunks.length,
        chunks: chunks.map(({ blob, ...chunk }) => ({
          ...chunk,
          size: blob.size
        })),
        events: [...events]
      };
    },
    readChunk: async (index) => {
      const chunk = chunks[index];
      if (chunk === undefined) {
        throw new Error(`Audio chunk ${index} does not exist.`);
      }
      return bytesToBase64(new Uint8Array(await chunk.blob.arrayBuffer()));
    }
  };
  recorderGlobal.__DIVEBELL_AUDIO_RECORDER__ = state;
  events.push({
    type: "audio-permission-requested",
    timeMs: Math.max(0, Date.now() - recordingStartedAt)
  });

  void startRecording();

  async function startRecording(): Promise<void> {
    if (
      typeof navigator.mediaDevices?.getUserMedia !== "function" ||
      typeof MediaRecorder === "undefined"
    ) {
      fail("error", "This browser does not support microphone recording.");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stopRequested) {
        stream.getTracks().forEach((track) => track.stop());
        state.status = "stopped";
        return;
      }
      const mimeType = selectMimeType();
      mediaRecorder = mimeType.length === 0
        ? new MediaRecorder(stream)
        : new MediaRecorder(stream, { mimeType });
      state.mimeType = mediaRecorder.mimeType || mimeType || "audio/webm";
      chunkStartedAt = Date.now();
      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size === 0) return;
        const endedAt = Date.now();
        chunks.push({
          blob: event.data,
          startMs: Math.max(0, chunkStartedAt - recordingStartedAt),
          endMs: Math.max(0, endedAt - recordingStartedAt),
          mimeType: event.data.type || state.mimeType
        });
        chunkStartedAt = endedAt;
        events.push({
          type: "audio-chunk",
          timeMs: Math.max(0, endedAt - recordingStartedAt),
          index: chunks.length - 1,
          size: event.data.size,
          mimeType: event.data.type || state.mimeType
        });
      });
      mediaRecorder.start(chunkMs);
      state.status = "recording";
      events.push({
        type: "audio-started",
        timeMs: Math.max(0, Date.now() - recordingStartedAt),
        mimeType: state.mimeType
      });
      updateStatus(
        "recording",
        "Microphone recording started — keep this tab open",
        "This tab records audio only. Divebell has returned to the workflow tab; open the target URL and perform all web actions there.",
        "Recording audio"
      );
      startSpeechRecognition();
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      fail(
        message.includes("NotAllowed") || message.includes("Permission") ? "denied" : "error",
        message
      );
    }
  }

  async function stopRecording(): Promise<void> {
    stopRequested = true;
    speechRecognition?.stop();
    if (mediaRecorder !== undefined && mediaRecorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        mediaRecorder?.addEventListener("stop", () => resolve(), { once: true });
        mediaRecorder?.stop();
      });
    }
    stream?.getTracks().forEach((track) => track.stop());
    if (state.status === "recording" || state.status === "requesting") state.status = "stopped";
    events.push({
      type: "audio-stopped",
      timeMs: Math.max(0, Date.now() - recordingStartedAt),
      chunkCount: chunks.length
    });
  }

  function startSpeechRecognition(): void {
    const Recognition = recorderGlobal.SpeechRecognition ?? recorderGlobal.webkitSpeechRecognition;
    if (Recognition === undefined) return;
    try {
      speechRecognition = new Recognition();
      speechRecognition.continuous = true;
      speechRecognition.interimResults = false;
      speechRecognition.onresult = (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const alternative = result?.[0];
          const text = alternative?.transcript?.trim() ?? "";
          if (result?.isFinal !== true || text.length === 0) continue;
          const timeMs = Math.max(0, Date.now() - recordingStartedAt);
          events.push({
            type: "speech-result",
            timeMs,
            endMs: timeMs,
            text,
            ...(alternative?.confidence === undefined
              ? {}
              : { confidence: alternative.confidence })
          });
        }
      };
      speechRecognition.onerror = (event) => {
        events.push({
          type: "speech-error",
          timeMs: Math.max(0, Date.now() - recordingStartedAt),
          message: event.message ?? event.error ?? "Speech recognition failed."
        });
      };
      speechRecognition.start();
    } catch {}
  }

  function fail(status: "denied" | "error", message: string): void {
    state.status = status;
    events.push({
      type: "audio-error",
      timeMs: Math.max(0, Date.now() - recordingStartedAt),
      message
    });
    updateStatus(
      status,
      status === "denied" ? "Microphone access was not granted" : "Microphone recording did not start",
      "Web actions can still be recorded. Continue only in the “Divebell · Workflow recording” tab.",
      status === "denied" ? "Microphone access denied" : "Microphone unavailable"
    );
  }

  function updateStatus(
    status: RecorderState["status"],
    heading: string,
    detail: string,
    statusText: string
  ): void {
    if (title !== null) title.textContent = heading;
    if (description !== null) description.textContent = detail;
    if (statusElement !== null) {
      statusElement.dataset.state = status;
      statusElement.textContent = statusText;
    }
  }

  function selectMimeType(): string {
    for (const candidate of [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus"
    ]) {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    }
    return "";
  }

  function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const blockSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += blockSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + blockSize));
    }
    return btoa(binary);
  }
}
