import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  DomSnapshotSample,
  InteractionEvent,
  OperationEntry,
  PageSnapshotSample,
  RecordingData,
  RecordingFiles,
  RecordingManifest,
  RuntimeSample,
  TranscriptData
} from "./types.js";

const RECORDING_FORMAT = "divebell-recording";
const RECORDING_VERSION = 1;
export function createRecordingFiles(): RecordingFiles {
  return {
    manifest: "manifest.json",
    runtime: "runtime.jsonl",
    pageSnapshots: "page-snapshots.jsonl",
    domSnapshots: "dom-snapshots.jsonl",
    interactions: "interactions.jsonl",
    audio: "audio.webm",
    audioChunks: "audio-chunks.jsonl",
    audioEvents: "audio-events.jsonl",
    operations: "operations.jsonl",
    transcript: "transcript.json"
  };
}

function createOptionalStringProperty<Name extends string>(
  name: Name,
  value: string | undefined
): Record<Name, string> | Record<string, never> {
  return value === undefined ? {} : { [name]: value } as Record<Name, string>;
}

export async function writeRecordingFiles(
  outputDirectory: string,
  manifest: RecordingManifest,
  runtimeSamples: RuntimeSample[],
  pageSnapshots: PageSnapshotSample[],
  domSnapshots: DomSnapshotSample[],
  interactions: InteractionEvent[],
  operations: OperationEntry[]
): Promise<void> {
  await writeJsonFile(join(outputDirectory, manifest.files.manifest), manifest);
  await writeJsonLines(join(outputDirectory, manifest.files.runtime), runtimeSamples);
  await writeJsonLines(join(outputDirectory, manifest.files.pageSnapshots), pageSnapshots);
  await writeJsonLines(join(outputDirectory, manifest.files.domSnapshots), domSnapshots);
  await writeJsonLines(join(outputDirectory, manifest.files.interactions), interactions);
  await ensureJsonLinesFile(join(outputDirectory, manifest.files.audioChunks));
  await ensureJsonLinesFile(join(outputDirectory, manifest.files.audioEvents));
  await writeJsonLines(join(outputDirectory, manifest.files.operations), operations);
  await ensureJsonFile(join(outputDirectory, manifest.files.transcript), {
    status: manifest.capture.audio.requested ? "pending" : "not-requested",
    ...(manifest.capture.audio.requested ? { audio: manifest.files.audio } : {}),
    segments: []
  });
}

export async function readRecordingData(outputDirectory: string): Promise<RecordingData> {
  const manifest = await readRecordingManifest(outputDirectory);
  return {
    manifest,
    runtimeSamples: await readJsonLines(join(outputDirectory, manifest.files.runtime)),
    pageSnapshots: await readJsonLines(join(outputDirectory, manifest.files.pageSnapshots)),
    domSnapshots: await readJsonLinesIfExists(join(outputDirectory, manifest.files.domSnapshots)),
    interactions: await readJsonLinesIfExists(join(outputDirectory, manifest.files.interactions)),
    transcript: await readTranscriptData(outputDirectory, manifest.files),
    operations: await readJsonLines(join(outputDirectory, manifest.files.operations))
  };
}

export async function readRecordingManifest(outputDirectory: string): Promise<RecordingManifest> {
  const manifest = await readJsonFile<RecordingManifest>(join(outputDirectory, createRecordingFiles().manifest));
  if (manifest.format !== RECORDING_FORMAT) {
    throw new Error(`Unsupported recording format in ${outputDirectory}.`);
  }
  if (manifest.version !== RECORDING_VERSION) {
    throw new Error(`Unsupported recording version "${manifest.version}".`);
  }
  return {
    ...manifest,
    files: {
      ...createRecordingFiles(),
      ...(manifest.files ?? {})
    }
  };
}

export async function readRecordingCounts(outputDirectory: string, files: RecordingFiles): Promise<RecordingManifest["counts"]> {
  const [runtimeSamples, pageSnapshots, domSnapshots, interactions, audioChunks, transcriptSegments, operations] = await Promise.all([
    countJsonLines(join(outputDirectory, files.runtime)),
    countJsonLines(join(outputDirectory, files.pageSnapshots)),
    countJsonLinesIfExists(join(outputDirectory, files.domSnapshots)),
    countJsonLinesIfExists(join(outputDirectory, files.interactions)),
    countJsonLinesIfExists(join(outputDirectory, files.audioChunks)),
    countTranscriptSegments(outputDirectory, files),
    countJsonLines(join(outputDirectory, files.operations))
  ]);
  return {
    runtimeSamples,
    pageSnapshots,
    domSnapshots,
    interactions,
    audioChunks,
    transcriptSegments,
    operations
  };
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function writeJsonLines(path: string, values: unknown[]): Promise<void> {
  await writeFile(path, values.map((value) => JSON.stringify(value)).join("\n") + (values.length === 0 ? "" : "\n"), "utf8");
}

export async function ensureJsonLinesFile(path: string): Promise<void> {
  try {
    await writeFile(path, "", {
      encoding: "utf8",
      flag: "wx"
    });
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") return;
    throw error;
  }
}

export async function ensureJsonFile(path: string, value: unknown): Promise<void> {
  try {
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") return;
    throw error;
  }
}

export async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

export async function readJsonLines<T>(path: string): Promise<T[]> {
  const text = await readFile(path, "utf8");
  if (text.trim().length === 0) return [];
  return text
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

export async function readJsonLinesIfExists<T>(path: string): Promise<T[]> {
  try {
    return await readJsonLines(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function countJsonLines(path: string): Promise<number> {
  return (await readJsonLines(path)).length;
}

export async function countJsonLinesIfExists(path: string): Promise<number> {
  return (await readJsonLinesIfExists(path)).length;
}

export async function readTranscriptData(outputDirectory: string, files: RecordingFiles): Promise<TranscriptData> {
  try {
    const data = await readJsonFile<TranscriptData>(join(outputDirectory, files.transcript));
    return {
      status: data.status,
      ...createOptionalStringProperty("audio", data.audio),
      ...createOptionalStringProperty("model", data.model),
      ...createOptionalStringProperty("transcribedAt", data.transcribedAt),
      ...createOptionalStringProperty("text", data.text),
      segments: Array.isArray(data.segments) ? data.segments : [],
      ...(Array.isArray(data.words) ? { words: data.words } : {}),
      ...createOptionalStringProperty("error", data.error)
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        status: "not-requested",
        segments: []
      };
    }
    throw error;
  }
}

export async function countTranscriptSegments(outputDirectory: string, files: RecordingFiles): Promise<number> {
  return (await readTranscriptData(outputDirectory, files)).segments.length;
}


function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
