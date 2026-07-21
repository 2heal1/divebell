import { getOptionValue } from "../utils/args.js";
import { createBridgeStateStore } from "../features/bridge/config.js";
import { validateCommandSkill } from "./skill.js";
import { createCommandOutput, createError } from "../utils/output.js";
import {
  applyOpenContextDefaults,
  createExtensionPageContext
} from "../open-context.js";
import type { ExtensionCliCommandOptions } from "../types/commands.js";
import { createOpenRuntimeExtensionApi } from "../features/extension/api.js";

export async function runExtensionCliCommand(
  options: ExtensionCliCommandOptions
): Promise<number | undefined> {
  const {
    args,
    stdout,
    stderr,
    fetcher,
    browserRunner,
    bridgeStarter,
    bridgeStateDirectory,
    operationLogStore,
    commandRegistry
  } = options;
  const command = args.command[0];
  if (command === undefined) {
    return undefined;
  }

  const registered = commandRegistry.get(command);
  if (registered === undefined) {
    return undefined;
  }

  if (args.options.has("skill")) {
    if (args.command.length !== 1 || getOptionValue(args, "skill") !== "true") {
      throw createError({
        code: "CLI_COMMAND_SKILL_USAGE_INVALID",
        kind: "validation",
        message: "Command skill lookup only accepts the command name.",
        hint: `Run \`openruntime ${command} --skill\`.`
      });
    }
    if (registered.command.skill === undefined) {
      throw createError({
        code: "CLI_COMMAND_SKILL_UNAVAILABLE",
        kind: "not_found",
        message: `Command "${command}" does not provide a skill.`,
        hint: "Run `openruntime --help` to see commands with available skills."
      });
    }
    const skill = validateCommandSkill(registered.command.skill, registered.command.name);
    stdout.write(`${skill.path}\n`);
    return 0;
  }

  const openContext = await operationLogStore.read();
  const extensionArgs = applyOpenContextDefaults(args, openContext);
  const bridgeStateStore = createBridgeStateStore(extensionArgs, bridgeStateDirectory);
  return await registered.command.run({
    args: extensionArgs,
    stdout,
    stderr,
    fetcher,
    ...(openContext === undefined ? {} : { page: createExtensionPageContext(openContext) }),
    openruntime: createOpenRuntimeExtensionApi({
      args: extensionArgs,
      fetcher,
      browserRunner,
      bridgeStarter,
      bridgeStateStore,
      ...(openContext === undefined ? {} : { openContext })
    }),
    output: createCommandOutput(stdout, extensionArgs.command.join(" "))
  });
}
