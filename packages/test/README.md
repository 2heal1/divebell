# @divebell/test

`@divebell/test` is Divebell's end-to-end acceptance harness.

Each run creates one clean environment, packs and installs every official
Extension once through the real Divebell CLI, and then reuses that installation
for isolated scenarios. Scenarios execute the CLI as a separate process. They
may import typed command descriptors from `@divebell/test` or an Extension's
`/test` export, but they must not import an Extension implementation or the CLI
runner directly.

The TypeScript source scenarios live under `tests/e2e` in the Divebell
repository. Building `@divebell/test` type-checks those sources and publishes
compiled JavaScript with declaration files, so internal projects can run the
same acceptance checks after installing `@divebell/test`.

The public API carries each command's result type into `runCli`; test scenarios
do not declare or pass CLI output types themselves:

```ts
import {
  DivebellTestEnvironment,
  divebellTestCommands
} from "@divebell/test";
import { mfTestCommands } from "@divebell/extension-mf/test";

const environment = await DivebellTestEnvironment.create();
try {
  const runtimes = await environment.runCli(
    divebellTestCommands.runtimes({ bridge: "http://127.0.0.1:3100" })
  );
  const mfStatus = await environment.runCli(mfTestCommands.status());
  console.log(runtimes.json.runtimes, mfStatus.json.data.instances);
} finally {
  await environment.close();
}
```

The suite covers the built-in Runtime SDK commands, the troubleshooting
Extension, and the MF Extension against a real host/provider fixture. Future
Extension scenarios should be added to the same suite so package installation
remains a one-time cost.

Run the complete acceptance suite from the repository root:

```sh
pnpm test:e2e
```
