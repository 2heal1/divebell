/** @satisfies {import("@divebell/cli").DivebellExtensionDefinition} */
const extension = {
  schemaVersion: 1,
  name: "cli-extension-demo",
  displayName: "CLI Extension Demo",
  description: "Demonstrates local Divebell CLI Extension development.",
  commands: [{
    name: "extension-demo",
    commandReferences: [{
      category: "Extensions",
      usage: "divebell extension-demo <hello|page> [--name <name>]",
      description: "Runs the local CLI Extension development example."
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
