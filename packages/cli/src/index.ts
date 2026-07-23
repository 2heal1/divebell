import { runCli as runCliEntry } from "./create.js";
import { isEntryPoint } from "./utils/entry.js";

export {
  cliPackageInfo,
  createOpenRuntimeCli,
  createOpenRuntimeCliWithExternalExtensions,
  defaultOpenRuntimeCli,
  getCliCommandName,
  runCli
} from "./create.js";
export type {
  CliExtensionPageContext,
  CliExtensionRunOptions,
  CliRunOptions,
  CreateOpenRuntimeCliOptions,
  OpenRuntimeCli,
  OpenRuntimeExtensionCommand,
  OpenRuntimeExtensionDefinition,
  OpenRuntimeCliWithExternalExtensions
} from "./types/cli.js";

export {
  getNumberOption,
  getOptionValue,
  getOptionValues,
  parseCliArgs
} from "./utils/args.js";
export type { ParsedCliArgs } from "./utils/args.js";
export { createOpenRuntimeExtensionApi } from "./features/extension/api.js";
export type * from "./features/extension/api.js";
export {
  OPENRUNTIME_AGENT_BROWSER_EXECUTABLE_ENV,
  OPENRUNTIME_AGENT_BROWSER_SESSION_ENV,
  OPENRUNTIME_BROWSER_PROFILE_ENV,
  createAgentBrowserEnvironment,
  createAgentBrowserRunner,
  createDefaultBrowserProfileDirectory,
  createDefaultBrowserRunner,
  parseBrowserJsonOutput
} from "./features/browser/runner.js";
export type * from "./features/browser/runner.js";
export {
  fetchInputOptions,
  fetchRuntimeResource,
  fetchRuntimes,
  normalizeBridgeUrl,
  requestJson,
  runRuntimeAction,
  selectRuntime,
  waitForRuntime
} from "./features/runtime/client.js";
export type * from "./features/runtime/client.js";
export { isEntryPoint } from "./utils/entry.js";
export {
  cliCommandReferences,
  createCliReferenceMarkdown,
  createHelpText
} from "./commands/help.js";
export type * from "./commands/help.js";
export type { OpenRuntimeCommandSkill } from "./commands/skill.js";
export { defineExtension, validateExtension } from "./commands/definition.js";
export type * from "./commands/definition.js";
export type { ExtensionLoadRecord } from "./commands/external.js";
export {
  OPENRUNTIME_EXTENSION_PACKAGE_SCHEMA_VERSION,
  OPENRUNTIME_EXTENSIONS_DIRECTORY_ENV,
  addExtensionPackage,
  createNpmExtensionPackageDownloader,
  getInstalledExtensionEntryPaths,
  readInstalledExtensionPackageRegistry,
  removeExtensionPackage,
  resolveExtensionsDirectory
} from "./commands/installed.js";
export type {
  ExtensionPackageDownloader,
  InstalledExtensionPackage,
  InstalledExtensionPackageRegistry,
  OpenRuntimeExtensionPackageManifest
} from "./commands/installed.js";
export {
  createCommandOutput,
  createError,
  isCommandError,
  runWithOutputErrorBoundary,
  writeErrorOutput,
  writeNeedsInputOutput,
  writeOkOutput
} from "./utils/output.js";
export type * from "./utils/output.js";

if (isEntryPoint(process.argv[1], import.meta.url)) {
  runCliEntry().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
