import { after, before } from "node:test";

import { registerCliE2e } from "./cli/scenario.mjs";
import { registerTroubleshootingExtensionE2e } from "./extension-troubleshooting/scenario.mjs";
import { DivebellTestEnvironment } from "./support/environment.mjs";

let environment;

before(async () => {
  environment = await DivebellTestEnvironment.create();
});

after(async () => {
  await environment?.close();
});

const context = {
  getEnvironment() {
    if (environment === undefined) {
      throw new Error("Divebell e2e environment is not ready.");
    }
    return environment;
  }
};

registerCliE2e(context);
registerTroubleshootingExtensionE2e(context);
