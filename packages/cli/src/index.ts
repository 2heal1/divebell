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
  OpenRuntimeCliExtension,
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
  convertAuthConnectorPayloadToStorageState,
  exportAuthProfileWithConnector,
  getDefaultAuthConnectorExtensionDirectory,
  openAuthConnectorSetupPage,
  writeAuthConnectorExtension
} from "./features/auth/connector/index.js";
export type * from "./features/auth/connector/index.js";
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
export { defineCommand, validateCommand } from "./commands/definition.js";
export type * from "./commands/definition.js";
export type { ExtensionLoadRecord } from "./commands/external.js";
export {
  OPENRUNTIME_COMMAND_PACKAGE_SCHEMA_VERSION,
  OPENRUNTIME_COMMANDS_DIRECTORY_ENV,
  addCommandPackage,
  createNpmCommandPackageDownloader,
  getInstalledCommandEntryPaths,
  readInstalledCommandPackageRegistry,
  removeCommandPackage,
  resolveCommandsDirectory
} from "./commands/installed.js";
export type {
  CommandPackageDownloader,
  InstalledCommandPackage,
  InstalledCommandPackageRegistry,
  OpenRuntimeCommandPackageManifest
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
