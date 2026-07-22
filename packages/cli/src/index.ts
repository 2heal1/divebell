import { runCli as runCliEntry } from "./create.js";
import { isEntryPoint } from "./utils/entry.js";

export {
  cliPackageInfo,
  createDivebellCli,
  createDivebellCliWithExternalExtensions,
  defaultDivebellCli,
  getCliCommandName,
  runCli
} from "./create.js";
export type {
  CliExtensionPageContext,
  CliExtensionRunFunction,
  CliExtensionRunOptionScalar,
  CliExtensionRunOptionValue,
  CliExtensionRunOptions,
  CliExtensionRunRequest,
  CliRunOptions,
  CreateDivebellCliOptions,
  DivebellCli,
  DivebellExtensionCommand,
  DivebellExtensionDefinition,
  DivebellCliWithExternalExtensions
} from "./types/cli.js";

export {
  getNumberOption,
  getOptionValue,
  getOptionValues,
  parseCliArgs
} from "./utils/args.js";
export type { ParsedCliArgs } from "./utils/args.js";
export { createDivebellExtensionApi } from "./features/extension/api.js";
export type * from "./features/extension/api.js";
export {
  DIVEBELL_AGENT_BROWSER_EXECUTABLE_ENV,
  DIVEBELL_AGENT_BROWSER_SESSION_ENV,
  DIVEBELL_BROWSER_PROFILE_ENV,
  createAgentBrowserEnvironment,
  createAgentBrowserRunner,
  createDefaultBrowserProfileDirectory,
  createDefaultBrowserRunner,
  parseBrowserJsonOutput
} from "./features/browser/runner.js";
export type * from "./features/browser/runner.js";
export {
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
export type { DivebellCommandSkill } from "./commands/skill.js";
export { defineExtension, validateExtension } from "./commands/definition.js";
export type * from "./commands/definition.js";
export type { ExtensionLoadRecord } from "./commands/external.js";
export {
  DIVEBELL_EXTENSION_PACKAGE_SCHEMA_VERSION,
  DIVEBELL_EXTENSIONS_DIRECTORY_ENV,
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
  DivebellExtensionPackageManifest
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
