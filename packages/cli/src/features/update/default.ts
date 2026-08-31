import { CLI_VERSION } from "../../version.js";
import { createNpmGlobalCliUpdater } from "./npm.js";

export const defaultDivebellCliUpdater = createNpmGlobalCliUpdater({
  packageName: "@divebell/cli",
  currentVersion: CLI_VERSION,
  packageRoot: new URL("../../../", import.meta.url),
  displayName: "Divebell",
  disableAutomaticUpdateEnvironmentVariable: "DIVEBELL_NO_AUTO_UPDATE"
});
