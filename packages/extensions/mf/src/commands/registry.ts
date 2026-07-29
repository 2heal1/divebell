import type { MfCommandRegistration } from "../cli/router.js";
import {
  bridgeTraceCommandMetadata,
  moduleInfoCommandMetadata,
  remoteStatusCommandMetadata,
  remoteTraceCommandMetadata,
  sharedStatusCommandMetadata,
  sharedTraceCommandMetadata,
  statusCommandMetadata
} from "./metadata.js";

export const mfCommandRegistry: readonly MfCommandRegistration[] = [
  {
    ...statusCommandMetadata,
    load: async () => (await import("./status.js")).statusCommand
  },
  {
    ...moduleInfoCommandMetadata,
    load: async () => (await import("./module-info.js")).moduleInfoCommand
  },
  {
    ...remoteStatusCommandMetadata,
    load: async () => (await import("./remote-status.js")).remoteStatusCommand
  },
  {
    ...remoteTraceCommandMetadata,
    load: async () => (await import("./remote-trace.js")).remoteTraceCommand
  },
  {
    ...sharedStatusCommandMetadata,
    load: async () => (await import("./shared-status.js")).sharedStatusCommand
  },
  {
    ...sharedTraceCommandMetadata,
    load: async () => (await import("./shared-trace.js")).sharedTraceCommand
  },
  {
    ...bridgeTraceCommandMetadata,
    load: async () => (await import("./bridge-trace.js")).bridgeTraceCommand
  }
];
