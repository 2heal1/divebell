import { after, before } from "node:test";

import { registerCliE2e } from "./cli/scenario.js";
import { registerMfExtensionE2e } from "./extension-mf/scenario.js";
import { DivebellTestEnvironment } from "@divebell/test";
import type { DivebellE2eContext } from "./support/types.js";

let environment: DivebellTestEnvironment | undefined;

before(async () => {
  environment = await DivebellTestEnvironment.create();
});

after(async () => {
  await environment?.close();
});

const context: DivebellE2eContext = {
  getEnvironment() {
    if (environment === undefined) {
      throw new Error("Divebell e2e environment is not ready.");
    }
    return environment;
  }
};

registerCliE2e(context);
registerMfExtensionE2e(context);
