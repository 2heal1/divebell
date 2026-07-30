import type { CliExtensionLoadingFunction } from "../../types/commands.js";

export const EXTENSION_LOADING_DELAY_MS = 400;

const EXTENSION_LOADING_FRAME_INTERVAL_MS = 80;
const EXTENSION_LOADING_FRAMES = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏"
] as const;
const CLEAR_CURRENT_LINE = "\r\u001B[2K";

interface ExtensionLoadingWriter {
  isTTY?: boolean;
  write(chunk: string): void;
}

interface CreateExtensionLoadingFunctionOptions {
  delayMs?: number;
  frameIntervalMs?: number;
}

export function createExtensionLoadingFunction(
  writer: ExtensionLoadingWriter,
  options: CreateExtensionLoadingFunctionOptions = {}
): CliExtensionLoadingFunction {
  if (writer.isTTY !== true) {
    return async <T>(run: () => T | PromiseLike<T>): Promise<T> => await run();
  }

  const delayMs = options.delayMs ?? EXTENSION_LOADING_DELAY_MS;
  const frameIntervalMs = options.frameIntervalMs
    ?? EXTENSION_LOADING_FRAME_INTERVAL_MS;
  let activeCount = 0;
  let frameIndex = 0;
  let delayTimer: ReturnType<typeof setTimeout> | undefined;
  let animationTimer: ReturnType<typeof setInterval> | undefined;
  let visible = false;

  const writeFrame = (): void => {
    const frame = EXTENSION_LOADING_FRAMES[
      frameIndex % EXTENSION_LOADING_FRAMES.length
    ];
    frameIndex += 1;
    writer.write(`\r${frame}`);
  };

  const start = (): void => {
    delayTimer = setTimeout(() => {
      delayTimer = undefined;
      visible = true;
      writeFrame();
      animationTimer = setInterval(writeFrame, frameIntervalMs);
    }, delayMs);
  };

  const stop = (): void => {
    if (delayTimer !== undefined) {
      clearTimeout(delayTimer);
      delayTimer = undefined;
    }
    if (animationTimer !== undefined) {
      clearInterval(animationTimer);
      animationTimer = undefined;
    }
    if (visible) {
      writer.write(CLEAR_CURRENT_LINE);
      visible = false;
    }
    frameIndex = 0;
  };

  return async <T>(run: () => T | PromiseLike<T>): Promise<T> => {
    activeCount += 1;
    if (activeCount === 1) start();
    try {
      return await run();
    } finally {
      activeCount -= 1;
      if (activeCount === 0) stop();
    }
  };
}
