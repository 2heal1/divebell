import type { CliExtensionLoadingFunction } from "../types/commands.js";

const LOADING_FRAME_INTERVAL_MS = 80;
const LOADING_FRAMES = [
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

interface LoadingWriter {
  isTTY?: boolean;
  write(chunk: string): void;
}

interface CreateLoadingControllerOptions {
  frameIntervalMs?: number;
}

export interface LoadingController {
  withLoading: CliExtensionLoadingFunction;
  clear(): void;
}

export function createLoadingController(
  writer: LoadingWriter,
  options: CreateLoadingControllerOptions = {}
): LoadingController {
  if (writer.isTTY !== true) {
    return {
      withLoading: async <T>(run: () => T | PromiseLike<T>): Promise<T> => await run(),
      clear() {}
    };
  }

  const frameIntervalMs = options.frameIntervalMs ?? LOADING_FRAME_INTERVAL_MS;
  let activeCount = 0;
  let frameIndex = 0;
  let animationTimer: ReturnType<typeof setInterval> | undefined;
  let visible = false;

  const writeFrame = (): void => {
    const frame = LOADING_FRAMES[frameIndex % LOADING_FRAMES.length];
    frameIndex += 1;
    writer.write(`\r${frame}`);
  };

  const start = (): void => {
    visible = true;
    writeFrame();
    animationTimer = setInterval(writeFrame, frameIntervalMs);
  };

  const clear = (): void => {
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

  const withLoading: CliExtensionLoadingFunction = async <T>(
    run: () => T | PromiseLike<T>
  ): Promise<T> => {
    activeCount += 1;
    if (activeCount === 1) start();
    try {
      return await run();
    } finally {
      activeCount -= 1;
      if (activeCount === 0) clear();
    }
  };

  return { withLoading, clear };
}
