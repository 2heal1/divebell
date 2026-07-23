/** @satisfies {import("@openruntime/cli").OpenRuntimeExtensionDefinition} */
const extension = {
  schemaVersion: 1,
  name: "cli-extension-demo",
  displayName: "CLI Extension Demo",
  description: "演示本地开发 OpenRuntime CLI Extension。",
  commands: [{
    name: "extension-demo",
    commandReferences: [{
      category: "Extensions",
      usage: "openruntime extension-demo <hello|page> [--name <name>]",
      description: "运行本地 CLI Extension 开发示例。"
    }],
    run: async options =>
      await (await import("./command.mjs")).runExtensionDemo(options)
  }],
  hooks: {
    open: async options =>
      await (await import("./hooks.mjs")).open(options),
    detectStack: async options =>
      await (await import("./hooks.mjs")).detectStack(options),
    close: async options =>
      await (await import("./hooks.mjs")).close(options)
  }
};

export default extension;
